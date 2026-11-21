import { existsSync, readFileSync, statSync } from "node:fs";
import { ensureEmbeddedSubtitle, subtitleCachePath } from "../src/lib/server/subtitles";

const ladies =
  "English Movies/(2018)/Ladies in Black (2018) 720p [Dual Audio]/Ladies in Black (2018) 720p BluRay x264 ESub [Dual Audio][Hindi 2.0+English 5.1] -MsMod.mkv";

async function waitForReady(size: number | null) {
  const started = Date.now();
  let result = await ensureEmbeddedSubtitle(ladies, 5, size);
  console.log("  initial", result.state, result.progress);
  while (result.state === "queued" || result.state === "running") {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    result = await ensureEmbeddedSubtitle(ladies, 5, size);
    console.log("  poll", result.state, result.progress, `${Date.now() - started}ms`);
  }
  return result;
}

async function main() {
  const output = subtitleCachePath(ladies, 5);
  console.log("cache path", output);
  console.log("stable hash across sizes", output === subtitleCachePath(ladies, 5));

  console.log("\n[1] fresh extraction with size");
  const first = await waitForReady(391396352);
  console.log("  final", first.state, first.error, first.output);
  console.log("  vtt exists", existsSync(output), existsSync(`${output}.json`));
  const meta = JSON.parse(readFileSync(`${output}.json`, "utf8"));
  console.log("  metadata", meta);
  const cues = (readFileSync(output, "utf8").match(/-->/g) ?? []).length;
  console.log("  cues", cues);

  console.log("\n[2] replay with same size (should be instant)");
  const same = Date.now();
  const cached = await ensureEmbeddedSubtitle(ladies, 5, 391396352);
  console.log("  ", cached.state, `${Date.now() - same}ms`);

  console.log("\n[3] replay without size (should use cache)");
  const noSize = Date.now();
  const noSizeResult = await ensureEmbeddedSubtitle(ladies, 5, null);
  console.log("  ", noSizeResult.state, `${Date.now() - noSize}ms`);

  console.log("\n[4] replay with changed size (should re-extract)");
  const changed = await waitForReady(391396353);
  console.log("  final", changed.state, changed.error);
  const newMeta = JSON.parse(readFileSync(`${output}.json`, "utf8"));
  console.log("  metadata", newMeta, "size updated", newMeta.size === 391396353);
  console.log("  vtt mtime", statSync(output).mtime.toISOString());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
