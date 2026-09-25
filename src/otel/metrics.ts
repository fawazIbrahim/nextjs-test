import {
  metrics,
  type Attributes,
  type Counter,
  type Gauge,
  type Histogram,
} from "@opentelemetry/api";

// Small helper for recording app-defined ("custom") metrics from anywhere
// in the app — Route Handlers, Server Components, or Client Components.
// Reads whichever MeterProvider is globally registered for the current
// runtime (src/otel/server.ts on the server, src/otel/client.ts in the
// browser), so callers never touch the OTEL SDK directly.
// See design/DESIGN.md §7.4.

const METER_NAME = "restaurant-app";

const counters = new Map<string, Counter>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, Gauge>();

function getMeter() {
  return metrics.getMeter(METER_NAME);
}

function getCounter(name: string): Counter {
  let counter = counters.get(name);
  if (!counter) {
    counter = getMeter().createCounter(name);
    counters.set(name, counter);
  }
  return counter;
}

function getHistogram(name: string): Histogram {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = getMeter().createHistogram(name);
    histograms.set(name, histogram);
  }
  return histogram;
}

function getGauge(name: string): Gauge {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = getMeter().createGauge(name);
    gauges.set(name, gauge);
  }
  return gauge;
}

export function recordCounter(name: string, value = 1, attributes?: Attributes): void {
  getCounter(name).add(value, attributes);
}

export function recordHistogram(name: string, value: number, attributes?: Attributes): void {
  getHistogram(name).record(value, attributes);
}

export function recordGauge(name: string, value: number, attributes?: Attributes): void {
  getGauge(name).record(value, attributes);
}
