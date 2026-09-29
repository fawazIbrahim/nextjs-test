import { IncomingMessage, type RequestOptions } from "node:http";
import {
  metrics,
  SpanKind,
  type Attributes,
  type Context,
  type Link,
  type Meter,
  type Tracer,
} from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  ParentBasedSampler,
  SamplingDecision,
  type Sampler,
  type SamplingResult,
} from "@opentelemetry/sdk-trace-base";
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { buildResource } from "./resource";
import { requireMimirUrl, requireTempoUrl } from "./backends";
import { getGrafanaAuthHeaders } from "./auth";

// Server-side OTEL wiring, called once from src/instrumentation.ts.
//
// Talks to Tempo/Mimir DIRECTLY — it does NOT go through the /otlp proxy.
// That proxy exists to solve a browser-only problem (the browser can't
// reach them directly / shouldn't know their address). The Node process
// has no such constraint. See design/DESIGN.md §7.3 for the full
// rationale and the confirmed decision.
//
// State lives on `globalThis`, not module-scope variables: Next/Turbopack
// can give a Route Handler and src/instrumentation.ts separate instances
// of this module in dev, so a plain module-level variable set by one
// instance isn't visible from another. globalThis is the one thing
// guaranteed shared across all of them within the same Node process.

declare global {
  var __otelServerRegistered: boolean | undefined;
  var __mockApiTracerProvider: NodeTracerProvider | undefined;
  var __serviceUpMeterProvider: MeterProvider | undefined;
}

export function registerServerOtel(): void {
  if (globalThis.__otelServerRegistered) {
    return;
  }
  globalThis.__otelServerRegistered = true;

  const tempoUrl = requireTempoUrl();
  const mimirUrl = requireMimirUrl();
  const telemetryBackendHosts = new Set([new URL(tempoUrl).host, new URL(mimirUrl).host]);
  const resource = buildResource({ "service.runtime": "nodejs" });

  const traceExporter = new OTLPTraceExporter({
    url: `${tempoUrl}/v1/traces`,
    headers: getGrafanaAuthHeaders,
  });
  const tracerProvider = new NodeTracerProvider({
    resource,
    sampler: new ExcludeStaticAssetsSampler(new ParentBasedSampler({ root: new AlwaysOnSampler() })),
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  tracerProvider.register();

  const metricExporter = new OTLPMetricExporter({
    url: `${mimirUrl}/v1/metrics`,
    headers: getGrafanaAuthHeaders,
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        // Next's own tracer (instrumentationScope "next.js") owns spans for
        // pages and Route Handlers; this instrumentation's incoming-request
        // span only actually fires for requests Next doesn't wrap itself —
        // in practice, static asset serving (_next/static, _next/image).
        // Don't trace those at all — see design/DESIGN.md §7.9.
        ignoreIncomingRequestHook: (request) => isStaticAssetPath(request.url),
        // Don't trace this app's own OTLP exports to Tempo/Mimir (the node-http
        // transport used by OTLPTraceExporter/OTLPMetricExporter is plain
        // http/https, so it's this instrumentation's OUTGOING side that
        // would otherwise wrap every export POST in its own span — noise
        // about the telemetry pipeline itself, not app behavior. See
        // design/DESIGN.md §7.10.
        ignoreOutgoingRequestHook: (request) =>
          isTelemetryBackendRequest(request, telemetryBackendHosts),
        // Default incoming-request span name is just the method ("GET") —
        // Node's raw http module has no concept of a route. Rename it to
        // "GET /path" so spans are identifiable in Grafana Tempo.
        requestHook: (span, request) => {
          if (request instanceof IncomingMessage && request.url) {
            span.updateName(`${request.method ?? "GET"} ${pathnameOf(request.url)}`);
          }
        },
      }),
      new UndiciInstrumentation({
        // Defensive, mirroring the HttpInstrumentation exclusion above —
        // the OTLP exporters don't currently use fetch/undici (they use
        // Node's http/https directly), so this shouldn't ever match, but
        // keeps the two instrumentations consistent if that changes.
        ignoreRequestHook: (request) =>
          isTelemetryBackendRequestOrigin(request.origin, telemetryBackendHosts),
        // Same default-naming issue as above, for the self-fetch() calls
        // Server Components make to this app's own Route Handlers.
        requestHook: (span, request) => {
          span.updateName(`${request.method} ${pathnameOf(request.path)}`);
        },
      }),
    ],
  });

  getOrCreateMockApiTracerProvider();
}

// A second, deliberately NOT globally-registered TracerProvider, so the
// mock backend's own spans (src/lib/mock-backend, src/app/api/**) carry a
// distinct service.name ("<OTEL_SERVICE_NAME>-mock-api") instead of the
// main app's. It reuses the same Tempo URL — same destination, just a
// different resource — see design/DESIGN.md §7.7. Obtained via
// getMockApiTracer(), never through the global trace API. Created lazily
// (and cached on globalThis) rather than only in registerServerOtel(), so
// getMockApiTracer() works even if it's called from a module instance
// that never ran registerServerOtel() itself.
function getOrCreateMockApiTracerProvider(): NodeTracerProvider {
  if (!globalThis.__mockApiTracerProvider) {
    const tempoUrl = requireTempoUrl();
    const mockApiResource = buildResource({ "service.runtime": "nodejs" }, "mock-api");
    const mockApiTraceExporter = new OTLPTraceExporter({
      url: `${tempoUrl}/v1/traces`,
      headers: getGrafanaAuthHeaders,
    });
    globalThis.__mockApiTracerProvider = new NodeTracerProvider({
      resource: mockApiResource,
      spanProcessors: [new BatchSpanProcessor(mockApiTraceExporter)],
    });
  }
  return globalThis.__mockApiTracerProvider;
}

export function getMockApiTracer(): Tracer {
  return getOrCreateMockApiTracerProvider().getTracer("restaurant-app-mock-api");
}

// A third, dedicated MeterProvider — not for a different service.name this
// time, but for a different aggregation temporality. The main MeterProvider
// above uses OTLP's default CUMULATIVE temporality, which is correct for
// counters/histograms but wrong for the service_up gauge (src/otel/service-up.ts):
// under CUMULATIVE, a collection cycle where the callback observes nothing
// still re-exports the last observed value (verified against the SDK's
// TemporalMetricProcessor.merge(), which starts from the previous
// accumulation and only overwrites attribute sets present in the current
// cycle) — exactly the "stuck at 1 forever" behavior this app doesn't want.
// DELTA temporality drops unobserved attribute sets instead of carrying
// them forward, so service-up.ts skipping observe() when stale produces a
// real gap in Mimir, not a stale value. See design/DESIGN.md §7.4.1.
function getOrCreateServiceUpMeterProvider(): MeterProvider {
  if (!globalThis.__serviceUpMeterProvider) {
    const mimirUrl = requireMimirUrl();
    const serviceUpMetricExporter = new OTLPMetricExporter({
      url: `${mimirUrl}/v1/metrics`,
      temporalityPreference: AggregationTemporality.DELTA,
      headers: getGrafanaAuthHeaders,
    });
    globalThis.__serviceUpMeterProvider = new MeterProvider({
      resource: buildResource({ "service.runtime": "nodejs" }),
      readers: [new PeriodicExportingMetricReader({ exporter: serviceUpMetricExporter })],
    });
  }
  return globalThis.__serviceUpMeterProvider;
}

export function getServiceUpMeter(): Meter {
  return getOrCreateServiceUpMeterProvider().getMeter("restaurant-app");
}

function pathnameOf(rawUrl: string): string {
  return rawUrl.split("?")[0];
}

// Matches HttpInstrumentation's ignoreOutgoingRequestHook: true means
// "this request is this app's own OTLP export to Tempo/Mimir, don't trace it."
function isTelemetryBackendRequest(request: RequestOptions, hosts: Set<string>): boolean {
  const host = getRequestHost(request);
  return host !== undefined && hosts.has(host);
}

function getRequestHost(request: RequestOptions): string | undefined {
  if (request.host) {
    return request.host;
  }
  if (request.hostname) {
    return request.port ? `${request.hostname}:${request.port}` : request.hostname;
  }
  return undefined;
}

// Same check for UndiciInstrumentation's ignoreRequestHook, whose request
// shape carries a single `origin` string ("http://host:port") instead.
function isTelemetryBackendRequestOrigin(origin: string, hosts: Set<string>): boolean {
  try {
    return hosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

const STATIC_ASSET_PATH_PREFIXES = ["/_next/static/", "/_next/image", "/favicon.ico"];

function isStaticAssetPath(rawUrl: string | undefined): boolean {
  if (!rawUrl) {
    return false;
  }
  const pathname = pathnameOf(rawUrl);
  return STATIC_ASSET_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// Belt-and-suspenders alongside HttpInstrumentation's ignoreIncomingRequestHook
// above: that hook only stops HttpInstrumentation's OWN spans, but some
// static-looking routes (e.g. /favicon.ico, served via Next's App Router
// metadata-file convention) get their span from Next's OWN tracer instead,
// which this app has no per-instrumentation hook into. A Sampler runs for
// EVERY span on this TracerProvider regardless of which tracer created it,
// so it's the one place that can catch both.
//
// Verified empirically (temporary console.log in shouldSample) that for
// this Next-owned span, spanName is still the generic "GET" at sampling
// time — Next renames it to "GET /favicon.ico" later, the same
// start-generic-then-rename pattern as HttpInstrumentation's own default
// (§7.8), so matching on spanName alone misses it. The initial attributes
// passed into shouldSample DO already include `http.target: '/favicon.ico'`
// at that point, though, so this checks both: spanName (covers instrumentations
// whose default name already includes the path) and http.target/url.path/
// next.route attributes (covers Next's own two-step rename).
class ExcludeStaticAssetsSampler implements Sampler {
  constructor(private readonly delegate: Sampler) {}

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): SamplingResult {
    if (isStaticAssetSpan(spanName, attributes)) {
      return { decision: SamplingDecision.NOT_RECORD };
    }
    return this.delegate.shouldSample(context, traceId, spanName, spanKind, attributes, links);
  }

  toString(): string {
    return `ExcludeStaticAssetsSampler{${this.delegate.toString()}}`;
  }
}

const STATIC_ASSET_PATH_ATTRIBUTE_KEYS = ["http.target", "url.path", "next.route", "http.route"];

function isStaticAssetSpan(spanName: string, attributes: Attributes): boolean {
  const spaceIndex = spanName.indexOf(" ");
  const namePath = spaceIndex === -1 ? spanName : spanName.slice(spaceIndex + 1);
  if (isStaticAssetPath(namePath)) {
    return true;
  }
  return STATIC_ASSET_PATH_ATTRIBUTE_KEYS.some((key) => {
    const value = attributes[key];
    return typeof value === "string" && isStaticAssetPath(value);
  });
}
