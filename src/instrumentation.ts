/**
 * Next.js instrumentation runs once when the server process starts.
 * This schedules the first library scan and periodic refreshes.
 *
 * The actual work lives in instrumentation-node.ts so the Edge bundle never
 * pulls in the native SQLite dependency.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
