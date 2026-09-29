import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exposes these vars (but never TEMPO_URL, MIMIR_URL, or any APPID_*
  // var, which must stay server-only) to the browser bundle under their
  // exact names, without a NEXT_PUBLIC_ prefix, per design/DESIGN.md
  // §4/§7.5. The browser never talks to Tempo/Mimir directly — it only
  // ever sees OTLP_ENDPOINT, proxied server-side by
  // src/app/otlp/[...path]/route.ts (see §7.3/§7.11/§8).
  env: {
    OTLP_ENDPOINT: process.env.OTLP_ENDPOINT || "/otlp",
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || "restaurant-menu-viewer",
    OTEL_SERVICE_VERSION:
      process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || "0.1.0",
    OTEL_DEPLOYMENT_ENVIRONMENT: process.env.OTEL_DEPLOYMENT_ENVIRONMENT || "development",
  },
};

export default nextConfig;
