// Next.js server-lifecycle hook — register() runs once when a new server
// instance starts, before it accepts requests. See design/DESIGN.md §7.2.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerServerOtel } = await import("./otel/server");
    registerServerOtel();
  }
}
