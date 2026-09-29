import { NextResponse } from "next/server";
import { getGrafanaHeaders } from "@/otel/auth";
import { requireMimirUrl, requireTempoUrl } from "@/otel/backends";

// Browser-facing OTLP proxy. Replaces the old declarative `rewrites()`
// (previously proxy.conf.js): a rewrite can only change the destination
// URL, it can't attach a header, and this app's telemetry backends now
// require an auth header on every request (design/DESIGN.md §7.11). The
// browser can never hold the credential that produces that header, so it
// has to be attached server-side, here -- same reason the browser was
// already routed through a same-origin proxy instead of talking to the
// backends directly (§7.3).
//
// Also routes by OTLP signal path: Tempo and Mimir are two different
// upstream hosts now that there's no collector in front of them doing that
// routing itself (§8).
//
// This route's own path is fixed by its file-system location, not by the
// OTLP_ENDPOINT env var -- if you change OTLP_ENDPOINT away from "/otlp",
// move this folder to match.

const SIGNAL_UPSTREAM: Record<string, () => string> = {
  "v1/traces": requireTempoUrl,
  "v1/metrics": requireMimirUrl,
};

export async function POST(request: Request, ctx: RouteContext<"/otlp/[...path]">) {
  const { path } = await ctx.params;
  const signal = path.join("/");

  const resolveUpstream = SIGNAL_UPSTREAM[signal];
  if (!resolveUpstream) {
    return NextResponse.json({ error: `Unsupported OTLP path: /${signal}` }, { status: 404 });
  }

  const authHeaders = await getGrafanaHeaders();
  const body = await request.arrayBuffer();

  const upstreamResponse = await fetch(`${resolveUpstream()}/${signal}`, {
    method: "POST",
    headers: {
      "Content-Type": request.headers.get("content-type") ?? "application/x-protobuf",
      ...authHeaders,
    },
    body,
  });

  return new NextResponse(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    headers: {
      "Content-Type": upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
}
