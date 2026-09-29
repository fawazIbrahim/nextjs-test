# Restaurant Menu Viewer

A Next.js (App Router, TypeScript) app that lists restaurants and shows
each one's menu and prices. Data comes from a mocked backend (Route
Handlers over static fixtures — see [`src/lib/mock-backend/`](src/lib/mock-backend/)).
The app emits OpenTelemetry traces and metrics, including custom
app-defined metrics, directly to Grafana's Tempo and Mimir backends over
OTLP/HTTP, authenticated via IBM Cloud App ID.

See [`design/DESIGN.md`](design/DESIGN.md) for the full architecture and
the rationale behind it, and [`AGENTS.md`](AGENTS.md) for conventions when
working in this repo (also read by Claude Code via `CLAUDE.md`).

## Run it locally

The webapp and its mock backend are the same app — `npm run dev` starts
both (the mock backend is just the `/api/restaurants` Route Handlers, see
[`src/lib/mock-backend/`](src/lib/mock-backend/)). No separate process is
needed for the mock data.

Tempo, Mimir, and IBM Cloud App ID are separate, external pieces. If you
don't have real ones running locally, use the bundled mock OTLP receiver
and leave auth off — either way, the steps are otherwise identical:

### 1. Point `TEMPO_URL`/`MIMIR_URL` at something that speaks OTLP/HTTP

**Option A — mock it (no Tempo/Mimir required):**

```bash
npm run mock:otlp
```

Starts a tiny logging HTTP server on `http://localhost:4318` (the
standard OTLP/HTTP port) that accepts any trace/metric POST regardless of
path, prints `method path content-type bytes` for each one, and responds
`200`. Source: [`scripts/mock-otlp-receiver.mjs`](scripts/mock-otlp-receiver.mjs).
Point both `TEMPO_URL` and `MIMIR_URL` at it.

**Option B — point at real Tempo/Mimir instances:**

Note Tempo's OTLP/HTTP receiver URL and Mimir's **native OTLP** ingestion
URL (not its Prometheus remote-write endpoint — see
[`design/DESIGN.md` §7.11](design/DESIGN.md#711-grafana-authentication-ibm-cloud-app-id))
for the next step.

### 2. Configure env vars and start the app

In a second terminal:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
TEMPO_URL=http://localhost:4318   # or your real Tempo OTLP URL from step 1
MIMIR_URL=http://localhost:4318   # or your real Mimir native-OTLP URL from step 1
OTLP_ENDPOINT=/otlp                # default; the browser-facing proxy path

# Leave unset for local dev against the mock receiver (unauthenticated).
# Set to "appid" + fill in the APPID_* vars below to enable IBM Cloud App
# ID auth on every export (see design/DESIGN.md §7.11).
TELEMETRY_AUTH_PROVIDER=
APPID_TOKEN_URL=
APPID_CLIENT_ID=
APPID_CLIENT_SECRET=
```

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `TEMPO_URL`/`MIMIR_URL`
are required — `src/otel/server.ts` (server-side OTEL SDK) and
`src/app/otlp/[...path]/route.ts` (the `/otlp` proxy) both throw a clear
error the first time they're needed if either is unset.

### 3. What you should see

- Browsing the app in a browser: server-side spans are sent **directly**
  to `TEMPO_URL` and server-side metrics directly to `MIMIR_URL` (not
  through the proxy — see
  [`design/DESIGN.md` §7.3](design/DESIGN.md#73-where-telemetry-is-sent--the-key-design-decision)
  for why); client-side spans/metrics are sent to the same-origin
  `/otlp/v1/traces` and `/otlp/v1/metrics`, which
  [`src/app/otlp/[...path]/route.ts`](<src/app/otlp/[...path]/route.ts>)
  forwards to `TEMPO_URL`/`MIMIR_URL` respectively, attaching the App ID
  auth header if `TELEMETRY_AUTH_PROVIDER=appid` is set.
- If you're using the mock receiver from Option A, its terminal will log
  a line per batch, e.g.:
  ```
  [mock-otlp] POST /v1/traces  content-type=application/x-protobuf  bytes=5194
  [mock-otlp] POST /v1/metrics  content-type=application/x-protobuf  bytes=2064
  ```
  Metrics export on a ~60s interval by default, so give it a minute after
  loading a page.
- To confirm the proxy itself (independent of the OTEL SDK's own export
  timing), send a request through it directly:
  ```bash
  curl -i -X POST http://localhost:3000/otlp/v1/traces --data-binary "test"
  ```
  This should reach the mock receiver (or Tempo) at `/v1/traces`.

## Scripts

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check
- `npm run mock:otlp` — local stand-in for Tempo/Mimir's OTLP/HTTP receivers (logs requests, no real telemetry backend needed)

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenTelemetry JS Documentation](https://opentelemetry.io/docs/languages/js/)
