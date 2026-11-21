/**
 * Lightweight post-scan verification for the live library.
 *   npx tsx scripts/verify.ts
 */
import { getStats, getBrowse, getTitleDetail, getFacets } from "../src/lib/server/queries";
import { searchTitles } from "../src/lib/server/search";
import { getDb, closeDb } from "../src/lib/server/db";

function report(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!ok) process.exitCode = 1;
}

const stats = getStats();
console.log("stats", JSON.stringify(stats));

const db = getDb();
const counts = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM titles) AS titles,
            (SELECT COUNT(*) FROM episodes) AS episodes,
            (SELECT COUNT(*) FROM media_files) AS files,
            (SELECT COUNT(*) FROM scan_dirs) AS dirs,
            (SELECT COUNT(*) FROM titles WHERE file_path = '') AS no_file`,
  )
  .get() as Record<string, number>;
console.log("counts", JSON.stringify(counts));
report("titles present", counts.titles > 18000, `${counts.titles}`);
report("files linked", counts.files >= counts.titles, `${counts.files}`);
report("scan dirs", counts.dirs > 18000, `${counts.dirs}`);

const morichika = getTitleDetail("series-morichika-2021") ?? getTitleDetail("morichika");
const seriesRows = db
  .prepare("SELECT id, title, folder_path FROM titles WHERE kind = 'series' LIMIT 5")
  .all() as { id: string; title: string; folder_path: string }[];
console.log("series", JSON.stringify(seriesRows));
const actualSeries = seriesRows.find((row) => /morichika/i.test(row.title));
if (actualSeries) {
  const detail = getTitleDetail(actualSeries.id);
  console.log(
    "morichika",
    detail?.episodes.map((episode) => `${episode.season}x${episode.episode} ${episode.path}`),
  );
  report("morichika episodes", detail?.episodes.length === 8, `${detail?.episodes.length ?? 0}`);
} else {
  report("morichika present", false, "series row not found");
}

const movies = getBrowse({ kind: "movie", pageSize: 1 });
const series = getBrowse({ kind: "series", pageSize: 1 });
console.log("browse", { movies: movies.total, series: series.total });
report("movies indexed", movies.total > 18000, `${movies.total}`);
report("series indexed", series.total >= 1, `${series.total}`);
report("facets", getFacets("all").years.length > 20, JSON.stringify(getFacets("all")).slice(0, 160));

const queries: { q: string; expect: RegExp }[] = [
  { q: "Avngers Endgame", expect: /avengers.*endgame|endgame/i },
  { q: "Interstllar", expect: /interstellar/i },
  { q: "Spiderman", expect: /spider/i },
  { q: "Fast and Furios", expect: /fast/i },
  { q: "Jhon Wick", expect: /john wick/i },
  { q: "Dark Knight", expect: /dark knight/i },
];

for (const test of queries) {
  const result = searchTitles({ query: test.q, limit: 5 });
  const titles = result.results.map((hit) => hit.title);
  report(
    `search "${test.q}"`,
    titles.some((title) => test.expect.test(title)),
    `→ ${titles.join(" | ") || "(none)"}  didYouMean=${result.didYouMean ?? "-"}  ${result.tookMs}ms`,
  );
}

closeDb();
