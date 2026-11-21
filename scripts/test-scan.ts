/**
 * Small, isolated scanner smoke test against one category.
 * Uses a throwaway database so the real library is untouched.
 */
process.env.MEDIA_SERVER_URL = process.argv[2] || "http://172.16.50.7/DHAKA-FLIX-7/3D%20Movies/";
process.env.DATABASE_PATH = process.argv[3] || "data/test-scan.db";
process.env.TMDB_API_KEY = "";
process.env.SCAN_ON_START = "false";

async function main() {
  const { startScan } = await import("../src/lib/server/scanner");
  const { getDb, closeDb } = await import("../src/lib/server/db");
  const { getStats } = await import("../src/lib/server/queries");
  const { searchTitles } = await import("../src/lib/server/search");

  const status = await startScan({ force: true, reason: "test" });
  console.log("status", status);
  console.log("stats", getStats());

  const db = getDb();
  const sample = db
    .prepare("SELECT id, kind, title, year, folder_path, file_path FROM titles ORDER BY title LIMIT 8")
    .all();
  console.log("titles", sample);
  const dirs = db.prepare("SELECT kind, COUNT(*) AS count FROM scan_dirs GROUP BY kind").all();
  console.log("dir kinds", dirs);

  for (const query of ["Avatar", "Avngers Endgame", "Interstllar", "Spiderman", "Dark Knight"]) {
    const result = searchTitles({ query, limit: 5 });
    console.log(
      `search "${query}" ->`,
      result.results.map((hit) => `${hit.title} (${hit.year ?? "?"}) [${hit.score}]`),
      result.didYouMean ? `did you mean: ${result.didYouMean}` : "",
    );
  }

  closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
