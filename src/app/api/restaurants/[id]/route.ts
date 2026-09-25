import { NextResponse } from "next/server";
import { findRestaurant } from "@/lib/mock-backend/data";
import { simulateBackendLatency } from "@/lib/mock-backend/latency";
import { withSpan } from "@/otel/tracing";
import { getMockApiTracer } from "@/otel/server";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/restaurants/[id]">
) {
  const { id } = await ctx.params;

  const restaurant = await withSpan(
    `mock-backend.get-restaurant ${id}`,
    async (span) => {
      await simulateBackendLatency();

      const result = findRestaurant(id);
      span.setAttribute("mock_backend.found", result !== undefined);
      return result;
    },
    { "restaurant.id": id },
    getMockApiTracer()
  );

  if (!restaurant) {
    return NextResponse.json(
      { error: `Restaurant "${id}" not found.` },
      { status: 404 }
    );
  }

  return NextResponse.json(restaurant);
}
