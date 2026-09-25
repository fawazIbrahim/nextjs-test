# Design: Restaurant Menu Viewer

Status: **Implemented (2026-09-23).** All §9 decisions were confirmed
(all recommended defaults accepted) and verified per §10.

This document is the single source of truth for what will be built. Read
it before touching telemetry, proxy, or mock-backend code. If the
architecture changes during implementation, update this doc in the same
change.

## 1. Goal

A simple Next.js web app that lists restaurants and, per restaurant, shows
its menu and prices. Restaurant/menu data comes from "another backend",
which is simulated with a mock (no real backend exists). The app emits
OpenTelemetry traces and metrics — including app-defined custom metrics —
to Grafana Alloy over OTLP/HTTP, routed through a same-origin proxy path so
the browser never needs to know Alloy's real network address.

## 2. Non-goals

- Authentication, ordering, cart, payments.
- A persistent database. Mock data is static, in-memory, served over HTTP
  from Route Handlers inside this same Next.js app.
- Deploying/running an actual Grafana Alloy instance — that's assumed to
  exist already (or be run separately, e.g. via Docker) and reachable at
  whatever `ALLOY_URL` points to.
- Multi-locale/i18n, accessibility audit, design system — kept intentionally
  minimal (plain CSS, no UI kit) unless the review asks otherwise.

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16.3.6, App Router | Already scaffolded; has first-class `instrumentation.ts` / `instrumentation-client.ts` hooks and a `rewrites()` config that this design relies on. |
| Language | TypeScript (strict) | Scaffolded default. |
| UI | React 19, plain CSS Modules | "Simple webapp" — no component library needed. |
| Package manager | npm | Requested explicitly. |
| Mock backend | Next.js Route Handlers (`src/app/api/**/route.ts`) + static in-memory fixtures | Simulates "another backend" as a real HTTP boundary (fetch, JSON, latency) without standing up a second process. See §5. |
| Telemetry | `@opentelemetry/*` packages, manual SDK wiring (no `@vercel/otel`) | Requested explicitly ("use opentelemetry dependencies"); manual wiring is required anyway to expose a **custom metrics** recording API, which `@vercel/otel` does not surface. |

No Tailwind, no state-management library, no test framework beyond what's
already scaffolded (ESLint) — flag in §9 if you want any of these added.

## 4. Environment variables

| Variable | Example | Required | Purpose |
|---|---|---|---|
| `ALLOY_URL` | `http://localhost:12345` | Yes | Base URL of the Grafana Alloy OTLP/HTTP receiver. Used by (a) the dev/prod proxy rewrite target, and (b) the server-side OTLP exporters directly (see §7.3). |
| `OTLP_ENDPOINT` | `/otlp` | Yes (defaults to `/otlp`) | The same-origin path prefix the **browser** sends telemetry to. Proxied by Next's `rewrites()` to `ALLOY_URL` with the prefix stripped. |
| `OTEL_SERVICE_NAME` | `restaurant-menu-viewer` | No (defaulted) | `service.name` resource attribute — see §7.5. |
| `OTEL_SERVICE_VERSION` | `0.1.0` | No (defaulted from `npm_package_version`) | `service.version` resource attribute — see §7.5. |
| `OTEL_DEPLOYMENT_ENVIRONMENT` | `development` / `staging` / `production` | No (defaulted) | `deployment.environment.name` resource attribute — see §7.5. |
| `PORT` | `3000` | No | Standard Next.js dev/start port. Read so the design doc's examples are concrete; not otherwise special-cased. |

These will live in a git-ignored `.env.local` for local dev, with a
committed `.env.example` documenting them (requires a `!.env.example`
exception added to `.gitignore`, since `create-next-app` ignores all
`.env*` files by default).

`next.config.ts` will throw a clear startup error if `ALLOY_URL` is unset,
rather than silently proxying to `undefined`.

## 5. Mock backend

### 5.1 Shape

Route Handlers under `src/app/api/`:

- `GET /api/restaurants` → list of restaurants (id, name, cuisine,
  description, rating, image placeholder).
- `GET /api/restaurants/:id` → one restaurant, including its full `menu`:
  an array of `{ category, items: [{ id, name, description, price,
  currency }] }`.
- `404` JSON body for an unknown `:id`.

Both handlers emit custom trace spans around their work (not just the
auto-instrumented HTTP span) so a request is visible as a small span tree
in Grafana Tempo, not a flat line — see §7.6.

### 5.2 Fixture data

Static TypeScript module `src/lib/mock-backend/data.ts` exporting a small
hand-written array (5–8 restaurants, 3–6 menu items each). No database, no
seeding step, no randomness in the data itself.

### 5.3 Why Route Handlers instead of MSW

Two ways to "simulate a backend" were considered:

1. **Route Handlers in this same app** (chosen) — the frontend calls
   `fetch('/api/restaurants')` exactly as it would call a real external
   service. It's a genuine network hop through Next's server, so OTEL HTTP
   instrumentation produces real spans/timings, and it works identically in
   the browser and in Server Components.
2. **MSW (Mock Service Worker)** — intercepts `fetch` at the network layer,
   useful for testing but adds an indirection layer (service worker in the
   browser, `msw/node` interceptor on the server) that isn't needed here and
   would need its own OTEL considerations (intercepted requests may not hit
   real instrumentation hooks the same way).

Route Handlers were chosen for simplicity and because they produce
realistic, instrumentable HTTP traffic. Flagged in §9 in case MSW is
actually what you had in mind.

An artificial `await sleep(50–200ms)` will be added in the handlers so
traces/latency metrics have something non-trivial to show.

### 5.4 Health endpoint

`GET /health` (`src/app/health/route.ts`) — a liveness check in the
[Spring Boot Actuator](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.health)
response shape, deliberately minimal (no `components` breakdown, since
there's nothing behind this app to break — see §5.3):

```json
{ "status": "UP" }
```

Always `200 OK` — there's no dependency to fail against in this app
(the "backend" the frontend calls is this same process's Route Handlers;
if the process can respond at all, it's up). No artificial latency here,
unlike §5.1/§5.2: a health check should reflect real, not simulated,
responsiveness.

Every call also marks the service as freshly checked, which
`src/otel/service-up.ts` turns into a `service_up` gauge metric through
the same server-side OTEL pipeline as everything else (§7.3: exported
directly to `ALLOY_URL`, protobuf). This is what turns "is the service
up" from a one-off HTTP response into a queryable time series once it
lands in Mimir — the metrics storage backend behind Alloy in this stack.
**This app never talks to Mimir directly**; it emits OTLP metrics to
Alloy exactly as it does for every other metric in §7, and whatever
Alloy is configured to do with them (typically `remote_write` to Mimir)
is outside this app's boundary and this design doc's scope. A gauge
(not a counter) is used because "is it up right now" is a current-state
signal, following the same shape as Prometheus's own `up` metric.

**This is an `ObservableGauge` with a freshness window, not the plain
synchronous `recordGauge()` from `src/otel/metrics.ts`, and it only ever
reports `1` — never `0`.** See §7.4.1 for the full mechanics and why that
took two changes, not one: a synchronous gauge's last recorded value keeps
getting re-exported on every collection tick forever (one `GET /health`
call would look identical to continuous uptime in Mimir), and the
seemingly-obvious fix — an `ObservableGauge` that observes `0` when stale
— doesn't actually solve that, because of how the SDK's default
aggregation temporality carries values forward. The metric now either
shows `1` (checked recently) or **stops appearing entirely** (not checked
recently) — a gap in the series, not a `0` value.

## 6. Pages

| Route | Type | Behavior |
|---|---|---|
| `/` | Server Component | Fetches `/api/restaurants`, renders a grid of restaurant cards linking to `/restaurants/[id]`. |
| `/restaurants/[id]` | Server Component | Fetches `/api/restaurants/:id`, renders name/description + menu grouped by category with prices. `notFound()` on 404. |
| `/health` | Route Handler | Liveness check — see §5.4. Not a page (no UI), returns JSON. |

`loading.tsx` and `error.tsx` at both route levels for basic UX; no client
components required except where telemetry needs a browser entry point
(see §7).

## 7. OpenTelemetry architecture

### 7.1 Packages

Server (Node.js runtime):
- `@opentelemetry/api`
- `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
- `@opentelemetry/sdk-trace-node`, `@opentelemetry/sdk-metrics`
- `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/exporter-metrics-otlp-proto`
- `@opentelemetry/instrumentation`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-undici` (Next's internal `fetch` runs on undici in the Node runtime)

Browser (client bundle):
- `@opentelemetry/api`
- `@opentelemetry/resources`, `@opentelemetry/semantic-conventions`
- `@opentelemetry/sdk-trace-web`, `@opentelemetry/sdk-metrics`
- `@opentelemetry/exporter-trace-otlp-proto`, `@opentelemetry/exporter-metrics-otlp-proto` (both support browser XHR/fetch transport)
- `@opentelemetry/instrumentation-fetch` (traces the browser's own `fetch('/api/...')` calls)

> **Verified against installed package source** (OTEL JS 2.11.0 / 0.222.0):
> the `-http`-suffixed exporter packages (`@opentelemetry/exporter-trace-otlp-http`
> etc.) default to **JSON** serialization (`Content-Type: application/json`)
> in this version — despite what the package description implies. Only the
> `-proto`-suffixed packages use `ProtobufTraceSerializer`/
> `ProtobufMetricsSerializer` with `application/x-protobuf`. Since §9
> confirmed protobuf, the app uses the `-proto` packages, not `-http`.

### 7.2 Where initialization runs

- **`src/instrumentation.ts`** (Next's server-lifecycle hook, `register()`)
  — guarded by `process.env.NEXT_RUNTIME === 'nodejs'` — calls
  `registerServerOtel()` from `src/otel/server.ts`. Registers a
  `NodeTracerProvider` + `BatchSpanProcessor(OTLPTraceExporter)` and a
  `MeterProvider` + `PeriodicExportingMetricReader(OTLPMetricExporter)` as
  the global OTEL providers, plus HTTP/undici auto-instrumentation.
- **`src/instrumentation-client.ts`** (Next's client-lifecycle file,
  runs once before hydration) calls `registerBrowserOtel()` from
  `src/otel/client.ts`. Registers a `WebTracerProvider` +
  `MeterProvider` the same way, plus fetch auto-instrumentation scoped to
  same-origin `/api/*` calls.

Both modules are idempotent (guard against double-registration, relevant
in dev with Fast Refresh).

### 7.3 Where telemetry is sent — the key design decision

- **Browser → `${OTLP_ENDPOINT}/v1/traces` and `${OTLP_ENDPOINT}/v1/metrics`**
  (i.e. `/otlp/v1/traces`), same-origin. The Next server proxies this to
  `ALLOY_URL` (§8). The browser never sees `ALLOY_URL`.
- **Server → `${ALLOY_URL}/v1/traces` and `${ALLOY_URL}/v1/metrics` directly**,
  bypassing the `/otlp` proxy entirely.

Rationale: the proxy exists to solve a **browser** problem (the browser may
not be able to resolve/reach Alloy directly — different network namespace,
CORS, or a desire not to expose the collector's address to clients). The
Node server process has none of those constraints; it can reach `ALLOY_URL`
directly. Routing server telemetry through its own HTTP proxy would mean
the app calling back into itself over the network for no benefit, adding
latency and a failure mode (if the server is overloaded, its own telemetry
export competes with and depends on its own HTTP listener).

**This is the part most worth double-checking against your actual
intent** — if you specifically want *all* telemetry, including
server-emitted, to physically transit the `/otlp` path (e.g. because
something needs to observe/mutate it at that boundary), say so and this
flips to: server exporters target
`http://127.0.0.1:${PORT}${OTLP_ENDPOINT}` instead.

### 7.4 Custom metrics API

`src/otel/metrics.ts` exports a small helper, usable from both server
(Route Handlers, Server Components) and browser (Client Components) code —
it reads whichever global `MeterProvider` is registered for the current
runtime:

```ts
getMeter(name = "restaurant-app"): Meter
recordCounter(name: string, value?: number, attributes?: Attributes): void
recordHistogram(name: string, value: number, attributes?: Attributes): void
recordGauge(name: string, value: number, attributes?: Attributes): void
```

Demonstrated with example metrics wired into the app itself (not just
library code, so the design is verifiably exercised):
- `restaurant_list_view_count` (counter) — incremented when `/` renders.
- `restaurant_list_fetch_duration_ms` / `restaurant_menu_fetch_duration_ms`
  (histograms) — recorded around the corresponding `fetch('/api/restaurants[/:id]')` calls.

`recordGauge()`'s synchronous `Gauge` is correct for a "current value
that changes occasionally and should keep reading as its last value
between changes" metric (e.g. a queue depth, a connection-pool size).
`service_up` is **not** that shape — see §5.4/§7.4.1: it needs to stop
reading "up" once checks stop happening, which a synchronous Gauge can't
do on its own (the exporter always re-sends the last value on schedule).
It's implemented separately in `src/otel/service-up.ts`.

#### 7.4.1 Why `service_up` needed its own instrument *and* its own MeterProvider

**Attempt 1 — synchronous `Gauge`.** `PeriodicExportingMetricReader`
collects and exports on a fixed interval (60s default) regardless of
whether any new measurement came in. For a synchronous `Gauge`, "collect"
means "re-report whatever was last recorded" — so one `gauge.record(1)`
call produces a `1` at *every* subsequent export, forever, with no way to
tell "still true" apart from "was true once, ages ago." That's what made
`service_up` look permanently "up" in Mimir after a single `GET /health`
call — never a data pipeline bug, just what synchronous Gauges are
specified to do.

**Attempt 2 — `ObservableGauge` reporting `1` or `0`.** The obvious next
step: an `ObservableGauge`, whose callback runs fresh on every collection
tick, reporting `1` when `lastHealthCheckAt` (tracked on `globalThis`,
same reasoning as §7.7's implementation note) is within
`FRESHNESS_WINDOW_MS` (90s — comfortably more than one 60s collection
interval, so a single check survives at least one export before decaying)
of `Date.now()`, else `0`. **This still didn't produce the wanted result
in practice** — the metric kept reading `1`. Not a logic bug: verified by
reading the SDK's own source
(`@opentelemetry/sdk-metrics/build/src/state/TemporalMetricProcessor.js`,
`DeltaMetricProcessor.js`, `LastValue.js`). Two things compound:
- `LastValueAggregator.merge()` picks whichever of two accumulations has
  the later internal sample timestamp — so as long as the callback keeps
  calling `observe()` every cycle with a genuinely new value, a real `0`
  *should* win once observed. That part alone isn't the problem.
- The actual mechanism this app hit is external to this specific gauge's
  logic and affects the whole class of "should eventually go quiet"
  metrics: see Attempt 3 below for the real cause, discovered when trying
  the "just don't call observe() when stale" fix instead of observing `0`.

**Attempt 3 (current) — skip `observe()` when stale, on a dedicated
DELTA-temporality MeterProvider.** The idiomatic fix for "this metric
should stop existing, not read 0" is for the callback to simply not call
`result.observe(...)` in a stale cycle — no measurement this cycle, no
data point exported, a real gap in the series. Tried in isolation, this
**still didn't work**, and the SDK source explains exactly why:
`TemporalMetricProcessor.merge(last, current, aggregator)` — used
whenever the reader's aggregation temporality is `CUMULATIVE` (the
default for every OTLP metric exporter unless configured otherwise) —
starts from `result = last` (the *previous* collection's accumulations)
and only overwrites the attribute sets present in `current` (this
cycle's observations). An attribute set silently absent from `current`
(because the callback skipped it) is **not removed** — it survives in
`result` untouched, forever, because every future cycle's merge starts
from that same `result` again. Under `CUMULATIVE` temporality, skipping
`observe()` doesn't create a gap; it just means "keep repeating whatever
was last observed," which is the exact same stuck-at-`1` outcome as
Attempt 1, only reached one layer further down.

Under `DELTA` temporality, the same code path takes a different branch —
`TemporalMetricProcessor.calibrateStartTime(last, current, ...)` — which
returns `current` on its own, un-merged with `last`. An attribute set
absent from `current` is simply absent from the result: a genuine gap.
So the fix needed *both* changes together: skip `observe()` when stale
(§ implemented in `src/otel/service-up.ts`), **and** put `service_up` on
a `MeterProvider` configured with `temporalityPreference:
AggregationTemporality.DELTA` — a third, dedicated `MeterProvider`
(`getServiceUpMeter()` / `getOrCreateServiceUpMeterProvider()` in
`src/otel/server.ts`, cached on `globalThis` the same way as §7.7's
mock-api `TracerProvider`) rather than reusing the app's main
`MeterProvider`, since `DELTA` would be the wrong default for the
`restaurant_list_view_count` counter and the fetch-duration histograms —
those are meant to accumulate for standard Prometheus-style `rate()`
queries, and only `service_up` needed the different temporality.

Net result: `service_up` now reports `1` when `GET /health` was called
within the last 90s, and **no data point at all** otherwise — never `0`.

**Verified empirically** (temporarily: a debug `console.log` inside the
callback; a shortened `FRESHNESS_WINDOW_MS` and `exportIntervalMillis`
for a fast test cycle; all reverted after): the callback's `isFresh`
check itself was correct throughout — it flips to `false` right on
schedule. What the initial verification attempt got wrong was adding a
second, `ConsoleMetricExporter`-based reader to eyeball the value
directly — that reader defaults to `CUMULATIVE` temporality (never
configured otherwise) and, exactly as predicted from the source reading
above, kept printing `value: 1` forever, independent of the real
DELTA-configured OTLP reader. That was the verification tool lying, not
the fix failing. Checked against the actual mock OTLP receiver instead:
calling `/health` produces exactly one `POST /v1/metrics`, and — a nicer
outcome than a payload with zero data points — **no further POST at all**
arrives once stale. `PeriodicExportingMetricReader`'s own source
(`if (resourceMetrics.scopeMetrics.length === 0) { return; }`) skips the
export call entirely when a collection produces nothing, so a stale
`service_up` doesn't just leave a gap in an otherwise-continuous export
stream — it stops that stream's network traffic altogether until the
next `/health` call.

### 7.5 Resource attributes

Every span and every metric data point this app emits — server or
browser, auto-instrumented or custom — carries the same OTEL resource,
built once by `src/otel/resource.ts#buildResource()` and passed to both
the `TracerProvider` and the `MeterProvider` on each side (§7.2). It
includes:

| Attribute | Semconv constant | Source |
|---|---|---|
| `service.name` | `ATTR_SERVICE_NAME` | `OTEL_SERVICE_NAME` env var (default `restaurant-menu-viewer`) |
| `service.version` | `ATTR_SERVICE_VERSION` | `OTEL_SERVICE_VERSION` env var (default: `npm_package_version`, else `0.1.0`) |
| `deployment.environment.name` | `ATTR_DEPLOYMENT_ENVIRONMENT_NAME` | `OTEL_DEPLOYMENT_ENVIRONMENT` env var (default `development`) |
| `service.namespace` | `ATTR_SERVICE_NAMESPACE` | Hardcoded `nextjs-test` — not deployment-specific, no env var. |
| `service.runtime` | *(non-standard, app-defined)* | Hardcoded per call site: `"nodejs"` in `server.ts`, `"browser"` in `client.ts`. |

The three env-var-driven attributes exist specifically so the same build
can be told apart by environment (dev/staging/prod) and version at the
Alloy/Grafana side without a code change. Because `resource.ts` is
imported by both `server.ts` and `client.ts`, and the browser bundle can
only see env vars Next statically inlines, these three are threaded
through `next.config.ts`'s `env` block (same mechanism as `OTLP_ENDPOINT`,
§4) rather than read as plain `process.env.X` only on the server.

### 7.6 Custom trace spans

Auto-instrumentation (`HttpInstrumentation` for incoming requests,
`UndiciInstrumentation` for the self-`fetch()` calls Server Components make
to this app's own Route Handlers — see §7.1) already puts a span on the
wire for every HTTP call. Those spans are generic (`GET /api/restaurants/:id`)
— they show *that* an HTTP call happened, not what the mock backend
actually did while handling it. Without application-level spans, a trace
in Grafana's Tempo view is a flat line: one HTTP span, no visible work
inside it.

`src/otel/tracing.ts` adds `withSpan()`, mirroring the shape of
`src/otel/metrics.ts`'s helpers:

```ts
withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T, attributes?: Attributes, tracer?: Tracer): Promise<T>
```

It starts a span, makes it the active span for the duration of `fn`
(context propagates correctly across `await` in Node because
`NodeTracerProvider.register()` installs an `AsyncLocalStorageContextManager`
by default — see the `register()` source in `@opentelemetry/sdk-trace-node`),
records exceptions and sets `SpanStatusCode.ERROR` on throw, and always
ends the span. `tracer` defaults to the app's one globally-registered
tracer; the mock backend passes a different one — see §7.7.

The mock backend (§5) uses it to turn each request into a small,
meaningful span tree instead of one flat HTTP span:

- `GET /api/restaurants` → auto HTTP span (`service.name` = main app, §7.5)
  - `mock-backend.list-restaurants` (`mock_backend.restaurant_count` attribute; `service.name` = **mock-api**, §7.7)
    - `mock-backend.simulate-latency` (`mock_backend.delay_ms` attribute; `service.name` = **mock-api**)
- `GET /api/restaurants/:id` → auto HTTP span (`service.name` = main app)
  - `mock-backend.get-restaurant` (`restaurant.id`, `mock_backend.found` attributes; `service.name` = **mock-api**)
    - `mock-backend.simulate-latency` (`mock_backend.delay_ms` attribute; `service.name` = **mock-api**)

A `404` (restaurant not found) is a normal business outcome, not a span
error — `mock_backend.found: false` is set as an attribute instead of
throwing, so the span still ends with `OK` status. Only a genuine
exception (thrown, unexpected) gets `SpanStatusCode.ERROR`.

### 7.7 Mock API service identity

The mock backend's own spans (everything under `mock-backend.*` in the
tree above) report a different `service.name` than the rest of the app:
`<OTEL_SERVICE_NAME>-mock-api` (e.g. `restaurant-menu-viewer-mock-api`)
instead of plain `<OTEL_SERVICE_NAME>`.

**Why**: §5's whole premise is that the frontend fetches from "another
backend" — a real HTTP boundary, simulated in-process. Giving the mock
backend's spans their own `service.name` carries that fiction into the
telemetry too: opened in Grafana Tempo, a trace for `/restaurants/[id]`
shows two services, not one — matching what the architecture is standing
in for, even though it's physically one Node process.

**How**: OTLP groups spans by *Resource*, and `service.name` is a
resource attribute, not a span attribute — so this can't be done by
tagging spans with an extra attribute; it requires a second `Resource`,
which requires a second `TracerProvider`. `src/otel/server.ts` builds one
(`buildResource({ "service.runtime": "nodejs" }, "mock-api")`, its own
`OTLPTraceExporter` pointed at the same `ALLOY_URL`) but does **not**
call `.register()` on it — registering would replace the app's single
global tracer provider. Instead it's exposed as `getMockApiTracer()`,
and only `src/lib/mock-backend/latency.ts` and the two
`src/app/api/restaurants/**/route.ts` handlers pass it explicitly to
`withSpan()`. Every other `withSpan()` call in the app keeps using the
default (global) tracer.

**The mixed-service trace is intentional, not a bug**: the outer HTTP
span (`GET /api/restaurants/:id`) comes from `HttpInstrumentation`, which
patches Node's `http` module globally and always uses whatever
`TracerProvider` is globally registered — it cannot be scoped to a
different provider per route without much more machinery than this app
needs. So the outer span stays under the main service, and only the work
*inside* it (the spans this app explicitly creates) moves to `mock-api`.
That split is arguably more accurate anyway: the "real" backend call is
the HTTP request; `mock-api` represents what would be a distinct service
receiving and handling it.

No metrics are affected by this — there's currently no custom metric
recorded from inside the mock backend's Route Handlers (the fetch-duration
histograms in §7.4 are recorded by the *caller*, in `src/app/page.tsx` /
`src/app/restaurants/[id]/page.tsx`, under the main service).

**Implementation detail that mattered in practice**: the mock-api
`NodeTracerProvider` is created lazily and cached on `globalThis`
(`globalThis.__mockApiTracerProvider`), not held in a plain module-scope
variable. A first implementation used a module-scope variable set only
inside `registerServerOtel()`, and it failed at runtime — under Turbopack
dev, a Route Handler can get a separate instance of `src/otel/server.ts`
from the one `src/instrumentation.ts` ran `registerServerOtel()` against,
so that variable was still `undefined` in the Route Handler's copy.
`globalThis` is the one thing actually shared across every module
instance in the same Node process, same reasoning as
`__otelServerRegistered` already used for the main provider.

### 7.8 Span names for auto-instrumented HTTP spans

By default, `HttpInstrumentation` names an incoming-request span just the
HTTP method (`GET`) — Node's raw `http` module has no concept of a route,
so there's nothing more specific to default to. Same default for
`UndiciInstrumentation`'s outgoing spans (the self-`fetch()` calls Server
Components make to this app's own API — §7.1). Left alone, every span in
a Tempo trace waterfall for this app would be an indistinguishable `GET`.

Both instrumentations accept a `requestHook(span, request)` (called after
the span starts, before the request/response is handled), used in
`src/otel/server.ts` to rename the span to `"<METHOD> <path>"`
(`request.url` for `HttpInstrumentation`'s `IncomingMessage`, `request.path`
for `UndiciInstrumentation`) via `span.updateName()`. Query strings are
stripped (`pathnameOf()`, split on `?`) since they're high-cardinality and
already available as the `http.target`/`url.path` span attribute if
needed. This only touches these two instrumentations' own default naming
— it has no effect on the custom spans `withSpan()` creates (§7.6), which
were already given explicit, descriptive names.

**Verified empirically** (temporarily adding a `ConsoleSpanExporter`
alongside the OTLP one, hitting every route in both `next dev` and
`next start`, then removing it again): for pages and Route Handlers,
`HttpInstrumentation` never produces an *incoming*-request span at all —
Next.js owns that span itself (`instrumentationScope.name: 'next.js'`),
already named `"GET /api/restaurants/[id]"` etc. (route pattern, not the
resolved path) with no help needed from this app. Where
`HttpInstrumentation` and `UndiciInstrumentation` **do** produce spans —
and where they defaulted to a bare `"GET"` before this fix — is (a) the
*outgoing* side, the loopback self-`fetch()` a Server Component makes to
this app's own Route Handlers (§7.1), and (b) **static asset requests**
(`/_next/static/**`), which is the one case where `HttpInstrumentation`'s
*incoming* span is the only span produced for a request, since Next's own
tracer doesn't wrap static file serving at all. See §7.9 for what this
app does with that second case — it turned out to be worth excluding from
tracing entirely rather than naming.

### 7.9 Excluding static assets from tracing, and fully-named spans for dynamic routes

Two related, separately-requested refinements on top of §7.6/§7.8:

**Static assets aren't traced.** Every `/_next/static/**` request (one
per JS/CSS chunk a browser loads) was producing its own root span, purely
from `HttpInstrumentation`'s incoming-request instrumentation (§7.8) —
these are pure noise for an app-behavior trace view: dozens of spans per
page load that say nothing about what the app did. `HttpInstrumentation`
accepts an `ignoreIncomingRequestHook(request): boolean` — "do not trace
if this returns true" — used in `src/otel/server.ts` with
`isStaticAssetPath()`, matching `/_next/static/`, `/_next/image`, and
`/favicon.ico` path prefixes. For `_next/static`/`_next/image`, this is
the *only* span those requests would have produced (per §7.8's finding),
so this alone fully removes them from tracing.

`/favicon.ico` needed one more layer. Placed in `src/app/`, it's handled
by Next's App Router "metadata file" convention, so its span comes from
Next's *own* tracer, not `HttpInstrumentation` — the
`ignoreIncomingRequestHook` above has no effect on it, since that hook is
specific to that one instrumentation. Fixed with a custom `Sampler`
(`ExcludeStaticAssetsSampler`, wrapping the SDK's normal default —
`ParentBasedSampler(AlwaysOnSampler)`) passed to the `NodeTracerProvider`.
A `Sampler.shouldSample()` runs for *every* span on that provider
regardless of which tracer created it, so it's the one interception point
that can also catch Next-owned spans. **Verified empirically** (temporary
`console.log` inside `shouldSample`) that at sampling time, this
particular Next-owned span's name is still the generic `"GET"` — Next
renames it to `"GET /favicon.ico"` afterward, the same
start-generic-then-rename pattern as `HttpInstrumentation`'s own default
(§7.8), so matching on `spanName` alone would have missed it silently.
What *is* already present at sampling time is an initial `http.target:
'/favicon.ico'` attribute, so `ExcludeStaticAssetsSampler` checks both
`spanName` and a handful of path-shaped attribute keys
(`http.target`/`url.path`/`next.route`/`http.route`) before falling
through to the wrapped default sampler.

**Dynamic routes get a fully-named custom span.** Next's own root span for
a parameterized route is always named after the route *pattern*
(`"GET /restaurants/[id]"`), never the resolved value — confirmed in
§7.8, and this is deliberate on Next's part: encoding the actual resolved
value into a span name that gets created on every single request is
exactly the kind of unbounded-cardinality span name the OTEL semantic
conventions warn against (it defeats aggregate views — latency by
endpoint, error rate by endpoint — that group by span name). This app has
no supported way to override Next's own span-naming for that root span.

Rather than fight that span, this app adds its own, next to it:
- `page.restaurant-list` (`src/app/page.tsx`) and
  `page.restaurant-detail <id>` (`src/app/restaurants/[id]/page.tsx`) —
  wrap the page's data fetch in `withSpan()`, giving `/restaurants/[id]`
  page loads a span whose name *does* include the resolved id.
- `mock-backend.get-restaurant <id>` (`src/app/api/restaurants/[id]/route.ts`)
  — same treatment on the mock-api side (renamed from the previous
  `mock-backend.get-restaurant` with `restaurant.id` only as an
  attribute).

**This is a deliberate exception to the "don't put high-cardinality
values in span names" guidance above**, made knowingly for this specific
demo-scale app: these spans are the ones a person actually looks at when
following a single request through Grafana Tempo, and being able to read
the restaurant id directly off the span name (not just by opening its
attributes) was the explicit ask. `restaurant.id` remains available as an
attribute too, for anyone who wants to query/aggregate by it instead of
reading names. `mock-backend.list-restaurants` and `page.restaurant-list`
keep unparameterized names — there's no id to encode for the list view.

If this app's traffic ever became large enough for span-name cardinality
to matter to the tracing backend, the fix is to drop the id from these
four span names and rely on the `restaurant.id` attribute alone (already
present, so no data is lost) — see design decisions if that trade-off
needs revisiting.

### 7.10 Excluding this app's own OTLP export calls from tracing

`OTLPTraceExporter`/`OTLPMetricExporter` (from the `-proto` packages,
§7.1) POST to `ALLOY_URL` using Node's `http`/`https` core modules
directly (the `node-http` transport — confirmed from the installed
package's source, not fetch/undici). `HttpInstrumentation` patches those
same core modules for *outgoing* requests app-wide, so without exclusion
every export POST — both trace and metric, from both the main tracer's
exporter and the mock-api tracer's exporter (§7.7), since
`HttpInstrumentation` is registered once, globally, and doesn't care
which `TracerProvider` triggered the underlying `http.request()` call —
would get wrapped in its own span. That's telemetry about the telemetry
pipeline, not app behavior, and it compounds: each export's own POST span
gets picked up and shipped in the *next* export.

Fixed the same way as the outgoing-side static-asset exclusion would be
(§7.9 covers the *incoming* side): `HttpInstrumentation`'s
`ignoreOutgoingRequestHook(request): boolean`, checking the request's
resolved host (`request.host`, or `hostname:port` when `host` isn't set)
against `new URL(ALLOY_URL).host`, computed once in `registerServerOtel()`.
`UndiciInstrumentation` gets the matching `ignoreRequestHook` too (via
`request.origin`), even though the exporters don't currently use
fetch/undici — cheap, harmless if it never matches, and keeps the two
instrumentations consistent if the transport ever changes.

No `Sampler`-level fix was needed here (contrast with §7.9's favicon.ico
case): these are plain outgoing `HttpInstrumentation` spans with no
competing Next-owned tracer involved, so the one hook is sufficient.

## 8. The `/otlp` proxy

### 8.1 Naming note — please read

Next.js 16 renamed its `middleware.ts` file convention to **`proxy.ts`**
(a request-interception hook for auth/redirects, unrelated to reverse
proxying to an external host). This is a coincidental naming collision
with what you asked for. **`proxy.conf.js` in this design is not that
file** — it's a plain config module (styled after the Angular CLI's
`proxy.conf.js`, matching the `"^/otlp": ""` rewrite convention you
described) that feeds Next's `rewrites()` config, which is the mechanism
Next.js actually uses for path-rewriting to an external destination.

### 8.2 Files

**`proxy.conf.js`** (project root, CommonJS):

```js
// Mirrors Angular-CLI-style proxy config: path pattern -> rewrite -> target.
// Consumed by next.config.ts's rewrites(); not a Next.js "proxy" file.
module.exports = function getOtlpProxyRewrites() {
  const alloyUrl = process.env.ALLOY_URL;
  const otlpEndpoint = process.env.OTLP_ENDPOINT || "/otlp";

  if (!alloyUrl) {
    throw new Error(
      "ALLOY_URL environment variable is required to configure the OTLP proxy."
    );
  }

  return [
    {
      source: `${otlpEndpoint}/:path*`,
      destination: `${alloyUrl}/:path*`,
    },
  ];
};
```

**`next.config.ts`**:

```ts
import type { NextConfig } from "next";
import getOtlpProxyRewrites from "../proxy.conf.js"; // illustrative path

const nextConfig: NextConfig = {
  async rewrites() {
    return getOtlpProxyRewrites();
  },
};

export default nextConfig;
```

Effectively: a request to `/otlp/v1/traces` is rewritten to
`${ALLOY_URL}/v1/traces` — the `^/otlp` prefix is stripped (replaced by
nothing) exactly as `"^/otlp": ""` in an Angular-style proxy config would
do, and the remainder is forwarded to the `ALLOY_URL` target.

### 8.3 Constraints this implies

- Requires running Next's own server (`next dev` or `next start`) — will
  **not** work with `next export`/static hosting. Acceptable since Route
  Handlers already require a server.
  - `rewrites()` to an external URL work in both dev and prod the same way.
- OTLP requests from the browser are POST with a `Content-Type` of
  `application/x-protobuf` or `application/json` depending on exporter
  choice; Next rewrites don't alter method/body, so this is transparent.

### 8.4 Local development without a real Alloy

`scripts/mock-otlp-receiver.mjs` (run via `npm run mock:otlp`) is a
zero-dependency stand-in: it accepts any OTLP/HTTP POST, logs the method,
path, content-type, and byte size, and responds `200`. Point `ALLOY_URL`
at it for local dev when a real Alloy isn't available. See README.md "Run
it locally" for the exact steps.

## 9. Decisions (confirmed 2026-09-23)

1. **Server telemetry path** (§7.3): **confirmed** — server exporters talk
   to `ALLOY_URL` directly; only the browser goes through `/otlp`.
2. **Mock backend shape** (§5.3): **confirmed** — Next.js Route Handlers.
3. **OTLP wire format**: **confirmed** — protobuf, for both traces and
   metrics, matching Alloy's default OTLP receiver.
4. **Styling**: **confirmed** — plain CSS Modules, no new dependency.
5. **Fixture size**: 5–8 restaurants / 3–6 menu items each, hand-written —
   proceeding with this as no objection was raised.
6. **No automated tests** beyond `next lint` / `tsc --noEmit` — proceeding
   with this as no objection was raised. Can be revisited later.

## 10. Implementation checklist

- [x] `.env.example` + `.gitignore` exception (`.env.local` stays untracked, create your own from `.env.example`)
- [x] `proxy.conf.js` + `next.config.ts` wiring, with a fail-fast check for `ALLOY_URL` (also enforced independently in `src/otel/server.ts`)
- [x] `src/lib/mock-backend/data.ts` + `src/app/api/restaurants/route.ts` + `src/app/api/restaurants/[id]/route.ts`
- [x] `src/otel/server.ts`, `src/otel/client.ts`, `src/otel/metrics.ts`, `src/otel/resource.ts` (shared resource attrs)
- [x] `src/instrumentation.ts`, `src/instrumentation-client.ts`
- [x] `/` page + `/restaurants/[id]` page + `loading.tsx`/`error.tsx`/`not-found.tsx`
- [x] Wired `restaurant_list_view_count` (browser counter, via `ViewTracker`) and `restaurant_list_fetch_duration_ms` / `restaurant_menu_fetch_duration_ms` (server histograms) custom metrics into the pages
- [x] Manual verification (2026-09-23): ran a stub OTLP/HTTP receiver as `ALLOY_URL`. Confirmed: `npm run lint` / `tsc --noEmit` / `npm run build` all clean; `GET /`, `GET /restaurants/[id]`, `GET /api/restaurants[/[id]]` all 200; `POST /otlp/v1/traces` correctly rewritten to the receiver with the `/otlp` prefix stripped; real server-emitted trace and metric batches arrived at the receiver as `application/x-protobuf`, sent **directly** to `ALLOY_URL` (not through `/otlp`), matching §7.3; `registerBrowserOtel` confirmed present in the compiled client bundle (browser execution itself wasn't exercised — no headless browser available — but the server-side pipeline it mirrors is verified end-to-end).
- [x] Corrected during implementation: `@opentelemetry/exporter-trace-otlp-http` / `-metrics-otlp-http` default to **JSON** in the installed version (0.222.0), not protobuf as assumed while drafting §7.1. Switched to `@opentelemetry/exporter-trace-otlp-proto` / `-metrics-otlp-proto`, which do use protobuf, to honor the §9 decision. See the note under §7.1.
- [x] `design/DESIGN.md` "Status" updated to reflect implementation.
