import { withSpan } from "@/otel/tracing";
import { getMockApiTracer } from "@/otel/server";

// Artificial network latency so the mock backend produces non-trivial
// trace/metric timings instead of near-zero durations. See design/DESIGN.md §5.2.
// Wrapped in its own span so it shows up as a distinct step in the trace
// waterfall, separate from the "does the data exist" work around it.
// Uses the mock-api tracer (see design/DESIGN.md §7.7) — this file is
// only ever imported by the mock backend's Route Handlers.
export async function simulateBackendLatency(minMs = 50, maxMs = 200): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

  await withSpan(
    "mock-backend.simulate-latency",
    async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
    },
    { "mock_backend.delay_ms": delay },
    getMockApiTracer()
  );
}
