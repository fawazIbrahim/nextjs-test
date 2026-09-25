import { headers } from "next/headers";

// Server Components need an absolute URL to fetch this app's own Route
// Handlers (relative URLs aren't resolvable outside a browser). Derived
// from the incoming request's own headers instead of a hardcoded PORT env
// var, so it keeps working in dev, prod, and behind a reverse proxy.
export async function getBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
