import { NextResponse } from "next/server";
import { recordHealthCheck } from "@/otel/service-up";

// Spring Boot Actuator-style liveness endpoint: GET /health -> { "status": "UP" }.
// Every call also marks the service as freshly checked, which the
// `service_up` ObservableGauge (src/otel/service-up.ts) turns into a
// queryable time series in Mimir that reads "up" only while checks keep
// arriving, rather than forever after a single call. See design/DESIGN.md §5.4.

export async function GET() {
  recordHealthCheck();

  return NextResponse.json({ status: "UP" });
}
