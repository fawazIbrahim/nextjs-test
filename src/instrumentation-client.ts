// Next.js client-lifecycle file — runs after the HTML document loads but
// before React hydration begins. See design/DESIGN.md §7.2.
import { registerBrowserOtel } from "./otel/client";

registerBrowserOtel();
