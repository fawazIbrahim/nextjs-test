# Restaurant Menu Viewer

A Next.js (App Router, TypeScript) app that lists restaurants and shows
each one's menu and prices. Data comes from a mocked backend (Route
Handlers over static fixtures — see [`src/lib/mock-backend/`](src/lib/mock-backend/)).
The app emits OpenTelemetry traces and metrics, including custom
app-defined metrics, to Grafana Alloy over OTLP/HTTP.

See [`design/DESIGN.md`](design/DESIGN.md) for the full architecture and
the rationale behind it, and [`AGENTS.md`](AGENTS.md) for conventions when
working in this repo (also read by Claude Code via `CLAUDE.md`).

## Run it locally

The webapp and its mock backend are the same app — `npm run dev` starts
both (the mock backend is just the `/api/restaurants` Route Handlers, see
[`src/lib/mock-backend/`](src/lib/mock-backend/)). No separate process is
needed for the mock data.

Grafana Alloy is a separate, external piece. If you don't have one running
locally, use the bundled mock OTLP receiver instead — either way, the
steps are otherwise identical:

### 1. Point `ALLOY_URL` at something that speaks OTLP/HTTP

**Option A — mock it (no Alloy required):**

```bash
npm run mock:otlp
```

Starts a tiny logging HTTP server on `http://localhost:4318` (the
standard OTLP/HTTP port) that accepts any trace/metric POST, prints
`method path content-type bytes` for each one, and responds `200`. Source:
[`scripts/mock-otlp-receiver.mjs`](scripts/mock-otlp-receiver.mjs).

**Option B — point at a real Grafana Alloy instance:**

Run/point at whatever Alloy deployment you have; just note its OTLP/HTTP
receiver URL (e.g. `http://localhost:12345`) for the next step.

### 2. Configure env vars and start the app

In a second terminal:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```bash
ALLOY_URL=http://localhost:4318   # or your real Alloy URL from step 1
OTLP_ENDPOINT=/otlp               # default; the browser-facing proxy path
```

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). `ALLOY_URL` is
required — `next.config.ts` (the `/otlp` proxy) and `src/instrumentation.ts`
(the server-side OTEL SDK) both throw a clear error at startup if it's unset.

### 3. What you should see

- Browsing the app in a browser: server-side spans/metrics are sent
  **directly** to `ALLOY_URL` (not through the proxy — see
  [`design/DESIGN.md` §7.3](design/DESIGN.md#73-where-telemetry-is-sent--the-key-design-decision)
  for why); client-side spans/metrics are sent to the same-origin
  `/otlp/v1/traces` and `/otlp/v1/metrics`, which Next's `rewrites()`
  (`proxy.conf.js`) forwards to `ALLOY_URL` with the `/otlp` prefix
  stripped.
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
  This should reach the mock receiver (or Alloy) at `/v1/traces` — the
  `/otlp` prefix gets stripped by the rewrite.

## Scripts

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check
- `npm run mock:otlp` — local stand-in for Alloy's OTLP/HTTP receiver (logs requests, no real telemetry backend needed)

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [OpenTelemetry JS Documentation](https://opentelemetry.io/docs/languages/js/)
