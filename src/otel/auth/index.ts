import { getAppIdAccessToken } from "./appid-token-provider";

// The ONLY export other code should import from src/otel/auth/. Every
// App ID-specific detail is isolated behind this one function so the whole
// auth layer can be:
// - deactivated: unset TELEMETRY_AUTH_PROVIDER (or set it to anything but
//   "appid") -- this resolves to {} below and every export/proxy call goes
//   out unauthenticated, no other file touched.
// - removed entirely: delete this src/otel/auth/ directory and the
//   `headers: getGrafanaAuthHeaders` line at each of its call sites
//   (the 4 exporters in src/otel/server.ts, plus
//   src/app/otlp/[...path]/route.ts). Nothing else in src/otel/** or the
//   rest of the app has any awareness that App ID exists.
// See design/DESIGN.md §7.11.
export async function getGrafanaAuthHeaders(): Promise<Record<string, string>> {
  if (process.env.TELEMETRY_AUTH_PROVIDER !== "appid") {
    return {};
  }
  const token = await getAppIdAccessToken();
  return { Authorization: `Bearer ${token}` };
}
