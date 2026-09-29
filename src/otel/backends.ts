// Shared upstream URL resolution for this app's two telemetry backends --
// Tempo (traces) and Mimir (metrics), both reached directly over OTLP/HTTP
// with no collector in between. Used by both src/otel/server.ts (direct
// server-side exports) and src/app/otlp/[...path]/route.ts (the
// browser-facing proxy, which forwards to these same two URLs). See
// design/DESIGN.md §7.3/§8.

export function requireTempoUrl(): string {
  return requireEnvUrl("TEMPO_URL");
}

export function requireMimirUrl(): string {
  return requireEnvUrl("MIMIR_URL");
}

function requireEnvUrl(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} environment variable is required (see .env.example and design/DESIGN.md §4).`
    );
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
