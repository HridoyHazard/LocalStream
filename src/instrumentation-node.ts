/**
 * Node-only startup tasks. Imported from instrumentation.ts exclusively when
 * NEXT_RUNTIME is "nodejs" — never from client or Edge code.
 */
export async function register() {
  const { ensureScanScheduled } = await import("./lib/server/scanner");
  ensureScanScheduled();

  // Warm the curated extra-server catalogs shortly after boot. This is a
  // shallow crawl (~200 directory requests) and deliberately not awaited so it
  // never delays the first request.
  const { ensureLiveCatalogs } = await import("./lib/server/live-catalog");
  void ensureLiveCatalogs();

  // Warm the primary reachability cache so the first page can label the
  // media server correctly instead of staying on "Connecting..." for a while.
  const { serverConfig } = await import("./lib/server/config");
  const { isMountReachable } = await import("./lib/server/reachability");
  void isMountReachable(serverConfig.mounts[0], true);
}
