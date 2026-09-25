"use client";

import { metrics } from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
import {
  WebTracerProvider,
  StackContextManager,
  BatchSpanProcessor,
} from "@opentelemetry/sdk-trace-web";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { buildResource } from "./resource";

// Browser-side OTEL wiring, called once from src/instrumentation-client.ts.
//
// Sends telemetry to the same-origin OTLP_ENDPOINT ("/otlp" by default),
// which Next's rewrites() (see proxy.conf.js) forwards to ALLOY_URL. The
// browser never learns ALLOY_URL directly. See design/DESIGN.md §7.3/§8.

let registered = false;

export function registerBrowserOtel(): void {
  if (registered) {
    return;
  }
  registered = true;

  const otlpEndpoint = process.env.OTLP_ENDPOINT || "/otlp";
  const resource = buildResource({ "service.runtime": "browser" });

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });
  const tracerProvider = new WebTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
  });
  tracerProvider.register({
    contextManager: new StackContextManager(),
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${otlpEndpoint}/v1/metrics`,
  });
  const meterProvider = new MeterProvider({
    resource,
    readers: [new PeriodicExportingMetricReader({ exporter: metricExporter })],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        // Don't trace the telemetry exporter's own requests to itself.
        ignoreUrls: [new RegExp(`^${escapeRegExp(otlpEndpoint)}/`)],
      }),
    ],
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
