/**
 * Node-only startup tasks. Imported from instrumentation.ts exclusively when
 * NEXT_RUNTIME is "nodejs" — never from client or Edge code.
 */
export async function register() {
  const { ensureScanScheduled } = await import("./lib/server/scanner");
  ensureScanScheduled();
}
