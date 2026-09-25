import { NextResponse } from "next/server";
import { listRestaurants } from "@/lib/mock-backend/data";
import { simulateBackendLatency } from "@/lib/mock-backend/latency";
import { withSpan } from "@/otel/tracing";
import { getMockApiTracer } from "@/otel/server";
import type { RestaurantSummary } from "@/lib/mock-backend/types";

export async function GET() {
  const summaries = await withSpan(
    "mock-backend.list-restaurants",
    async (span) => {
      await simulateBackendLatency();

      const result: RestaurantSummary[] = listRestaurants().map(
        ({ id, name, cuisine, description, rating }) => ({
          id,
          name,
          cuisine,
          description,
          rating,
        })
      );

      span.setAttribute("mock_backend.restaurant_count", result.length);
      return result;
    },
    undefined,
    getMockApiTracer()
  );

  return NextResponse.json(summaries);
}
