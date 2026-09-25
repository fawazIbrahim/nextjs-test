import { getServiceUpMeter } from "./server";

// A synchronous Gauge (metrics.ts#recordGauge) reports its LAST recorded
// value again at every export tick, forever — that's correct Gauge
// semantics in general, but wrong for "is this service still being
// checked": one GET /health call would look identical to continuous
// liveness forever in Mimir, since the exporter keeps re-sending the same
// last value on its own schedule regardless of whether a new check ever
// came in. See design/DESIGN.md §5.4/§7.4.
//
// An ObservableGauge fixes this — its callback runs fresh on every
// collection tick — but only if it also SKIPS calling observe() when
// stale, and only if that's paired with DELTA temporality. Verified
// against the SDK source (TemporalMetricProcessor.merge): under the
// default CUMULATIVE temporality, a collection cycle where nothing is
// observed still re-exports the last observed value (the merge starts
// from the previous accumulation and only overwrites what's present this
// cycle) — so an unconditional 1-or-0 observe() would still eventually
// get "stuck," and skipping observe() under CUMULATIVE wouldn't help
// either. getServiceUpMeter() (src/otel/server.ts) is backed by a
// dedicated MeterProvider using DELTA temporality specifically to make
// "don't observe" mean "no data point this cycle" — a real gap in Mimir
// when checks stop, not a stuck value and not an explicit 0. See
// design/DESIGN.md §7.4.1.

const GAUGE_NAME = "service_up";

// Must comfortably exceed the metrics export interval (60s by default —
// see PeriodicExportingMetricReader in src/otel/server.ts) so a single
// health check still reads as "up" for at least one collection tick.
const FRESHNESS_WINDOW_MS = 90_000;

declare global {
  var __lastHealthCheckAt: number | undefined;
  var __serviceUpGaugeRegistered: boolean | undefined;
}

function ensureGaugeRegistered(): void {
  if (globalThis.__serviceUpGaugeRegistered) {
    return;
  }
  globalThis.__serviceUpGaugeRegistered = true;

  getServiceUpMeter()
    .createObservableGauge(GAUGE_NAME, {
      description: `1 if GET /health was called within the last ${FRESHNESS_WINDOW_MS / 1000}s; no data point otherwise`,
    })
    .addCallback((result) => {
      const lastCheckedAt = globalThis.__lastHealthCheckAt;
      const isFresh = lastCheckedAt !== undefined && Date.now() - lastCheckedAt < FRESHNESS_WINDOW_MS;
      if (isFresh) {
        result.observe(1, { "health.check": "liveness" });
      }
      // Stale: deliberately don't observe anything — see the note above on
      // why this requires DELTA temporality to actually produce a gap.
    });
}

export function recordHealthCheck(): void {
  ensureGaugeRegistered();
  globalThis.__lastHealthCheckAt = Date.now();
}
