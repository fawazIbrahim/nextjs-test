import { trace, SpanStatusCode, type Attributes, type Span, type Tracer } from "@opentelemetry/api";

// Small helper for creating app-defined spans, mirroring src/otel/metrics.ts.
// Auto-instrumentation (HttpInstrumentation/UndiciInstrumentation, see
// src/otel/server.ts) already produces a span per HTTP request/fetch, but
// those are generic ("GET /api/restaurants/:id"). withSpan() is for
// wrapping specific pieces of application logic — e.g. the mock backend's
// own work — as their own named, nested spans, so a trace waterfall in
// Grafana shows what the app was actually doing, not just that an HTTP
// call happened. See design/DESIGN.md §7.6.

const TRACER_NAME = "restaurant-app";

function getDefaultTracer() {
  return trace.getTracer(TRACER_NAME);
}

// `tracer` defaults to the app's single globally-registered tracer. Pass a
// specific Tracer (e.g. getMockApiTracer() from src/otel/server.ts) to
// have these spans report under a different service.name — see
// design/DESIGN.md §7.7.
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Attributes,
  tracer: Tracer = getDefaultTracer()
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: attributes ?? {} }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error));
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
