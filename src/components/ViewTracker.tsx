"use client";

import { useEffect } from "react";
import { recordCounter } from "@/otel/metrics";

// Records a custom counter metric from the browser when a page view
// happens. Exists as its own Client Component so the pages it's used on
// can stay Server Components. See design/DESIGN.md §7.4.
export function ViewTracker({ metricName }: { metricName: string }) {
  useEffect(() => {
    recordCounter(metricName);
    // Intentionally runs once per mount, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
