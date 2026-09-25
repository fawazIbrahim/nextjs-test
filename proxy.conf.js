// Angular-CLI-style proxy config: path pattern -> rewrite -> target.
// Consumed by next.config.ts's `rewrites()`. This is NOT Next.js's
// `proxy.ts` file convention (that's the renamed `middleware.ts`, an
// unrelated request-interception hook) — see design/DESIGN.md §8.1.
//
// Equivalent to an Angular proxy.conf.js entry of:
//   { "context": ["/otlp"], "target": ALLOY_URL, "pathRewrite": { "^/otlp": "" } }

/** @returns {import('next').NextConfig['rewrites'] extends () => Promise<infer R> ? R : never} */
function getOtlpProxyRewrites() {
  const alloyUrl = process.env.ALLOY_URL;
  const otlpEndpoint = process.env.OTLP_ENDPOINT || "/otlp";

  if (!alloyUrl) {
    throw new Error(
      "ALLOY_URL environment variable is required to configure the OTLP proxy " +
        "(see .env.example and design/DESIGN.md §4)."
    );
  }

  const normalizedPrefix = otlpEndpoint.endsWith("/")
    ? otlpEndpoint.slice(0, -1)
    : otlpEndpoint;
  const normalizedTarget = alloyUrl.endsWith("/")
    ? alloyUrl.slice(0, -1)
    : alloyUrl;

  return [
    {
      source: `${normalizedPrefix}/:path*`,
      destination: `${normalizedTarget}/:path*`,
    },
  ];
}

module.exports = getOtlpProxyRewrites;
