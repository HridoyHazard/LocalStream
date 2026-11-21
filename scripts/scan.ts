/**
 * Standalone scanner.
 *
 *   npx tsx scripts/scan.ts
 *   npx tsx scripts/scan.ts --force
 *
 * Useful for the first full index or for cron jobs without running Next.
 */
import { getScanStatus, startScan } from "../src/lib/server/scanner";
import { closeDb } from "../src/lib/server/db";

async function main() {
  const force = process.argv.includes("--force");
  console.log(`[scan] starting${force ? " full" : " incremental"} scan…`);
  const timer = setInterval(() => {
    const status = getScanStatus();
    console.log(
      `[scan] ${status.phase} · folders ${status.scannedDirs.toLocaleString()} · files ${status.discoveredFiles.toLocaleString()} · titles ${status.indexedTitles.toLocaleString()} · episodes ${status.indexedEpisodes.toLocaleString()} · errors ${status.errors}`,
    );
  }, 10_000);
  timer.unref?.();

  const started = Date.now();
  const status = await startScan({ force, reason: force ? "manual-full" : "manual" });
  clearInterval(timer);

  console.log(
    `[scan] finished in ${Math.round((Date.now() - started) / 1000)}s with phase "${status.phase}" · ${status.indexedTitles.toLocaleString()} titles · ${status.indexedEpisodes.toLocaleString()} episodes · ${status.errors} errors`,
  );
  if (status.message) console.log(`[scan] ${status.message}`);
  closeDb();
}

main().catch((error) => {
  console.error("[scan] failed", error);
  closeDb();
  process.exitCode = 1;
});
