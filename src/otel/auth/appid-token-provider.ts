// Fetches and caches an IBM Cloud App ID access token via the OAuth2
// client-credentials grant. Nothing outside src/otel/auth/ should import
// this file directly -- go through ./index.ts's getGrafanaAuthHeaders()
// instead, which is the one thing the rest of the app depends on. See
// design/DESIGN.md §7.11.
//
// Cache lives on globalThis, not a module-scope variable: Next/Turbopack
// can hand a Route Handler and src/instrumentation.ts separate instances
// of a module in dev (see the same reasoning already applied to
// __otelServerRegistered etc. in src/otel/server.ts), and globalThis is
// the one thing guaranteed shared across all of them in the same process.

const REFRESH_SKEW_MS = 60_000; // refetch this long before the token actually expires

declare global {
  var __appIdTokenCache: { accessToken: string; expiresAt: number } | undefined;
  var __appIdTokenFetchInFlight: Promise<string> | undefined;
}

export async function getAppIdAccessToken(): Promise<string> {
  const cached = globalThis.__appIdTokenCache;
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  // Dedupe concurrent callers (the trace and metric exporters can both ask
  // for a header at once) into a single in-flight token request.
  if (!globalThis.__appIdTokenFetchInFlight) {
    globalThis.__appIdTokenFetchInFlight = fetchAppIdAccessToken().finally(() => {
      globalThis.__appIdTokenFetchInFlight = undefined;
    });
  }
  return globalThis.__appIdTokenFetchInFlight;
}

async function fetchAppIdAccessToken(): Promise<string> {
  const tokenUrl = requireEnv("APPID_TOKEN_URL");
  const clientId = requireEnv("APPID_CLIENT_ID");
  const clientSecret = requireEnv("APPID_CLIENT_SECRET");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`IBM App ID token request failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  globalThis.__appIdTokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  return body.access_token;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is required when TELEMETRY_AUTH_PROVIDER=appid ` +
        "(see .env.example and design/DESIGN.md §7.11)."
    );
  }
  return value;
}
