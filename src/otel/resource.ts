import { resourceFromAttributes, type Resource } from "@opentelemetry/resources";
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

// Shared identity for every span/metric this app emits, from both the
// server and browser SDKs. See design/DESIGN.md §7.5.
//
// service.name / service.version / deployment.environment.name are read
// from env vars (OTEL_SERVICE_NAME / OTEL_SERVICE_VERSION /
// OTEL_DEPLOYMENT_ENVIRONMENT) so they're configurable per deployment
// without a code change. Defaults are applied in next.config.ts's `env`
// block, not here, so the same defaulted value reaches both the server
// process and the statically-inlined browser bundle — direct
// `process.env.OTEL_*` access (not destructured) is required for Next to
// inline these into client code.
export const SERVICE_NAMESPACE = "nextjs-test";

// `serviceNameSuffix` appends `-<suffix>` to OTEL_SERVICE_NAME, giving a
// distinct service.name for a sub-part of the app that should show up as
// its own service in Grafana rather than folded into the main one — e.g.
// the mock backend's own spans (see design/DESIGN.md §7.7).
export function buildResource(
  extraAttributes: Record<string, string> = {},
  serviceNameSuffix?: string
): Resource {
  const serviceName = serviceNameSuffix
    ? `${process.env.OTEL_SERVICE_NAME}-${serviceNameSuffix}`
    : process.env.OTEL_SERVICE_NAME;

  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.OTEL_DEPLOYMENT_ENVIRONMENT,
    [ATTR_SERVICE_NAMESPACE]: SERVICE_NAMESPACE,
    ...extraAttributes,
  });
}
