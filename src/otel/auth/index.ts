import { getAppIdAccessToken } from "./appid-token-provider";

// The ONLY export other code should import from src/otel/auth/. Every
// header needed to talk to Tempo/Mimir is produced here, behind this one
// function, so each concern stays independently:
// - deactivatable: unset the env var that gates it (TELEMETRY_AUTH_PROVIDER
//   for the App ID bearer token, GRAFANA_ORG_ID for the tenant header) and
//   that header stops being sent, no other file touched.
// - removable: delete this src/otel/auth/ directory and the
//   `headers: getGrafanaHeaders` line at each of its call sites (the 4
//   exporters in src/otel/server.ts, plus
//   src/app/otlp/[...path]/route.ts). Nothing else in src/otel/** or the
//   rest of the app has any awareness that App ID or tenant scoping exist.
// See design/DESIGN.md §7.11.
export async function getGrafanaHeaders(): Promise<Record<string, string>> {
  return {
    ...(await getAppIdAuthHeader()),
    ...getTenantHeader(),
  };
}

async function getAppIdAuthHeader(): Promise<Record<string, string>> {
  if (process.env.TELEMETRY_AUTH_PROVIDER !== "appid") {
    return {};
  }
  const token = await getAppIdAccessToken();
  return { Authorization: `Bearer ${token}` };
}

// X-Scope-OrgID is Mimir/Tempo's (Cortex-derived) multi-tenancy header --
// which tenant's data a request reads/writes. Optional: only sent when
// GRAFANA_ORG_ID is set, so single-tenant setups (or a fronting gateway
// that injects it itself) don't need it at all.
function getTenantHeader(): Record<string, string> {
  const orgId = process.env.GRAFANA_ORG_ID;
  return orgId ? { "X-Scope-OrgID": orgId } : {};
}
