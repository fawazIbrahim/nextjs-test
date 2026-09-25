import type { NextConfig } from "next";
import getOtlpProxyRewrites from "./proxy.conf.js";

const nextConfig: NextConfig = {
  // Exposes these vars (but never ALLOY_URL, which must stay server-only)
  // to the browser bundle under their exact names, without a
  // NEXT_PUBLIC_ prefix, per design/DESIGN.md §4/§7.5.
  env: {
    OTLP_ENDPOINT: process.env.OTLP_ENDPOINT || "/otlp",
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || "restaurant-menu-viewer",
    OTEL_SERVICE_VERSION:
      process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || "0.1.0",
    OTEL_DEPLOYMENT_ENVIRONMENT: process.env.OTEL_DEPLOYMENT_ENVIRONMENT || "development",
  },
  async rewrites() {
    return getOtlpProxyRewrites();
  },
};

export default nextConfig;
