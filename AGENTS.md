<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project: Restaurant Menu Viewer

A simple Next.js (App Router, TypeScript) app that lists restaurants and,
per restaurant, shows its menu and prices. Data is fetched from a mocked
backend (Next.js Route Handlers with static fixtures — there is no real
backend). The app emits OpenTelemetry traces and metrics (including
custom, app-defined metrics) to Grafana Alloy over OTLP/HTTP.

**Before changing anything telemetry-, proxy-, or mock-backend-related,
read [`design/DESIGN.md`](design/DESIGN.md) first.** It is the source of
truth for *why* things are wired the way they are (e.g. why server-side
OTLP exporters talk to `ALLOY_URL` directly while the browser goes through
the `/otlp` proxy — see its §7.3). If you change the actual architecture,
update that document in the same change; don't let it drift from the code.

## Commands

- `npm run dev` — start the dev server (also registers `instrumentation.ts` / `instrumentation-client.ts`).
- `npm run build` — production build.
- `npm run start` — run the production build.
- `npm run lint` — ESLint (`eslint.config.mjs`, flat config).
- `npx tsc --noEmit` — type-check without emitting.

There is no test runner configured. If you add one, record the run command
here.

## Required environment variables

See `design/DESIGN.md` §4 and `.env.example` for the authoritative list.
At minimum, `ALLOY_URL` must be set (the app's `next.config.ts` throws at
startup if it's missing) — copy `.env.example` to `.env.local` and fill it
in before running `npm run dev`.

## Architecture at a glance

- `src/app/` — pages (App Router): `/` (restaurant list), `/restaurants/[id]` (menu + prices), `/health` (liveness check, see `design/DESIGN.md` §5.4).
- `src/app/api/` — the mocked backend (Route Handlers over static fixtures in `src/lib/mock-backend/`).
- `src/otel/` — OpenTelemetry setup: `server.ts` / `client.ts` (SDK registration, called from `src/instrumentation.ts` / `src/instrumentation-client.ts`), `metrics.ts` (custom metrics helper), `tracing.ts` (`withSpan()` custom span helper), `service-up.ts` (`recordHealthCheck()`, the `/health` freshness-windowed gauge — see below) — use these instead of reaching for `@opentelemetry/api` directly in app code.
- `proxy.conf.js` + `next.config.ts` — the `/otlp` → `ALLOY_URL` rewrite. Despite the filename, this is **not** Next.js's `proxy.ts` file convention (Next 16 renamed the old `middleware.ts` to `proxy.ts`, an unrelated request-interception hook); `proxy.conf.js` is a plain config module feeding Next's `rewrites()`. Don't confuse the two — see `design/DESIGN.md` §8.1.

## Conventions for AI agents working in this repo

- Don't hand-roll a second OTEL initialization path — always go through
  `src/otel/*`. Duplicate `NodeTracerProvider`/`MeterProvider` registration
  is a real bug class here (global OTEL state, easy to double-register
  under Next's Fast Refresh).
- Don't have the browser talk to `ALLOY_URL` directly, and don't have the
  server talk through `/otlp` — that split is intentional (§7.3 of the
  design doc), not an oversight.
- The mock backend's spans (`src/lib/mock-backend/*`, `src/app/api/restaurants/**`)
  deliberately report under a different `service.name` (`<OTEL_SERVICE_NAME>-mock-api`)
  than the rest of the app, via `getMockApiTracer()` from `src/otel/server.ts`
  passed as the 4th arg to `withSpan()` — see `design/DESIGN.md` §7.7. A
  trace showing two services for one request is expected, not a bug.
- Don't use `recordGauge()` (`src/otel/metrics.ts`) for anything that
  should stop reading "true" when it stops being checked — a synchronous
  Gauge re-exports its last value on every collection tick forever. Use
  the `service-up.ts` pattern instead: an `ObservableGauge` that skips
  `observe()` when stale, on a *dedicated* `MeterProvider` using `DELTA`
  temporality (`getServiceUpMeter()` in `src/otel/server.ts`). Both parts
  are required — skipping `observe()` alone does nothing under the
  default `CUMULATIVE` temporality (verified against the SDK source: it
  merges with the previous cycle's accumulation instead of dropping the
  unobserved attribute set, so the value gets stuck at whatever it last
  was). Never make `service_up` observe an explicit `0` — the point of
  this pattern is a gap in the series, not a `0` value. See
  `design/DESIGN.md` §7.4.1 before touching either file.
- Static assets (`/_next/static/**`, `/_next/image`, `/favicon.ico`) are
  deliberately excluded from tracing — via `ignoreIncomingRequestHook` on
  `HttpInstrumentation` *and* a custom `Sampler` (`ExcludeStaticAssetsSampler`
  in `src/otel/server.ts`). Both are needed: the hook alone doesn't catch
  `/favicon.ico`, whose span comes from Next's own tracer, not
  `HttpInstrumentation` — see `design/DESIGN.md` §7.9. Don't remove either
  filter, and if a new static-like route needs excluding, add its prefix
  to `STATIC_ASSET_PATH_PREFIXES` rather than writing a third mechanism.
- This app's own OTLP export POSTs to `ALLOY_URL` are also deliberately
  excluded from tracing (`ignoreOutgoingRequestHook`/`ignoreRequestHook`
  in `src/otel/server.ts`, matching on the resolved request host) — see
  `design/DESIGN.md` §7.10. Don't remove it; without it, exporting a
  trace batch creates a new span about exporting a trace batch.
- `page.restaurant-detail <id>` and `mock-backend.get-restaurant <id>`
  intentionally put the resolved restaurant id in the span *name*
  (`restaurant.id` is also kept as an attribute) — an explicit exception
  to normal low-cardinality span-naming advice, made because these are
  the spans someone actually reads in Grafana. See `design/DESIGN.md`
  §7.9 before changing either.
- Treat `design/DESIGN.md` as living documentation: when a decision in its
  §9 "Open decisions" gets resolved, or the architecture changes, edit the
  doc in the same commit as the code change.
- Run `npm run lint` and `npx tsc --noEmit` before considering a change
  done; this project has no CI configured yet, so these are the only
  automated checks in place.
- Mock data lives in `src/lib/mock-backend/data.ts` as a static, hand-written
  array — no database, no seeding scripts, no randomness in the data.
