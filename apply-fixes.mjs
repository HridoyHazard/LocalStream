#!/usr/bin/env node
/**
 * LocalStream fix-up script.
 *
 *   node apply-fixes.mjs [projectRoot]
 *
 * Every edit is an exact-match replacement. If the old text is not found
 * (or is found more than once when exactly one was expected) the file is
 * left untouched and the problem is reported. Safe to run twice.
 * Handles LF and CRLF checkouts.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = process.argv[2] ?? '.';
const L = (...lines) => lines.join('\n');

/** @type {{file: string, changes: {old: string, new: string, all?: boolean}[]}[]} */
const edits = [
  {
    file: 'src/app/api/stream/[...path]/route.ts',
    changes: [
      {
        // HEAD threw URIError on a literal "%" and skipped validation of decoded segments.
        old: '  const relativePath = path.map((segment) => decodeURIComponent(segment)).join("/");',
        new: L(
          '  const decoded = path.map((segment) => {',
          '    try {',
          '      return decodeURIComponent(segment);',
          '    } catch {',
          '      return segment;',
          '    }',
          '  });',
          '  if (!isValidPath(decoded)) {',
          '    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });',
          '  }',
          '  const relativePath = decoded.join("/");',
        ),
      },
    ],
  },
  {
    file: 'src/lib/server/scanner.ts',
    changes: [
      {
        old: L('function prefixPattern(value: string) {', '  return `${escapeLike(value)}/%`;', '}'),
        new: L(
          'function prefixPattern(value: string) {',
          '  return `${escapeLike(value)}/%`;',
          '}',
          '',
          "/** Index-friendly bounds for \"path starts with `dir/`\" ('0' sorts right after '/'). */",
          'function prefixRange(dir: string): [string, string] {',
          '  return [`${dir}/`, `${dir}0`];',
          '}',
        ),
      },
      {
        old: 'this.db.prepare("SELECT 1 FROM media_files WHERE substr(path, 1, ?) = ? LIMIT 1").get(job.path.length + 1, `${job.path}/`)',
        new: 'this.db.prepare("SELECT 1 FROM media_files WHERE path >= ? AND path < ? LIMIT 1").get(...prefixRange(job.path))',
      },
      {
        old: L(
          '          const prefix = `${job.path}/`;',
          '          this.db.prepare("DELETE FROM media_files WHERE substr(path, 1, ?) = ?").run(prefix.length, prefix);',
          '          this.db.prepare("DELETE FROM episodes WHERE substr(path, 1, ?) = ?").run(prefix.length, prefix);',
        ),
        new: L(
          '          const [from, to] = prefixRange(job.path);',
          '          this.db.prepare("DELETE FROM media_files WHERE path >= ? AND path < ?").run(from, to);',
          '          this.db.prepare("DELETE FROM episodes WHERE path >= ? AND path < ?").run(from, to);',
        ),
      },
      {
        // Sub-folder titles were deleted by the parent folder's scan and never restored
        // (unchanged children are skipped on incremental scans).
        old: L(
          '    const prefix = `${path}/`;',
          '    const keep = new Set(titleIds);',
          '    const existing = this.db',
          `      .prepare("SELECT id, folder_path FROM titles WHERE kind = 'movie' AND substr(folder_path, 1, ?) = ?")`,
          '      .all(prefix.length, prefix) as { id: string; folder_path: string }[];',
        ),
        new: L(
          '    const [from, to] = prefixRange(path);',
          '    const keep = new Set(titleIds);',
          '    const existing = this.db',
          `      .prepare("SELECT id, folder_path FROM titles WHERE kind = 'movie' AND folder_path >= ? AND folder_path < ?")`,
          '      .all(from, to) as { id: string; folder_path: string }[];',
        ),
      },
      {
        old: '      if (!keep.has(row.id) && row.folder_path !== path) removeTitle.run(row.id);',
        new: L(
          '      // Only per-file titles of this folder. Sub-folder movies belong to their own scan.',
          '      if (!keep.has(row.id) && row.folder_path !== path && isVideoFile(row.folder_path) && dirname(row.folder_path) === path) {',
          '        removeTitle.run(row.id);',
          '      }',
        ),
      },
      {
        // Movie total size never shrank when files were removed.
        old: '          total_size = MAX(titles.total_size, excluded.total_size),',
        new: "          total_size = CASE WHEN excluded.kind = 'movie' THEN excluded.total_size ELSE titles.total_size END,",
      },
      {
        // Stale-file cleanup removed media_files of every nested folder, not just this one.
        old: L(
          '    const prefix = `${dirPath}/`;',
          '    const existing = this.db',
          '      .prepare("SELECT path FROM media_files WHERE substr(path, 1, ?) = ?")',
          '      .all(prefix.length, prefix) as { path: string }[];',
        ),
        new: L(
          '    const [from, to] = prefixRange(dirPath);',
          '    const existing = this.db',
          '      .prepare("SELECT path FROM media_files WHERE path >= ? AND path < ?")',
          '      .all(from, to) as { path: string }[];',
        ),
      },
      {
        old: '      if (!keep.has(row.path)) remove.run(row.path);',
        new: '      if (dirname(row.path) === dirPath && !keep.has(row.path)) remove.run(row.path);',
      },
    ],
  },
  {
    file: 'src/lib/server/db.ts',
    changes: [
      {
        // /api/image looked up artwork with a full table scan per request.
        old: 'CREATE INDEX IF NOT EXISTS titles_normalized_idx ON titles(normalized_title);',
        new: L(
          'CREATE INDEX IF NOT EXISTS titles_normalized_idx ON titles(normalized_title);',
          '    CREATE INDEX IF NOT EXISTS titles_local_poster_idx ON titles(local_poster);',
          '    CREATE INDEX IF NOT EXISTS titles_local_backdrop_idx ON titles(local_backdrop);',
        ),
      },
    ],
  },
  {
    file: 'src/lib/media/normalize.ts',
    changes: [
      {
        // "Robot 2.0" lost its "2.0".
        old: String.raw`    "\\b(?:ddp[257]|5\\.1|7\\.1|2\\.0|dual\\s*audio|multi\\s*audio|dubbed|subbed)\\b",`,
        new: String.raw`    "\\b(?:ddp[257]|5\\.1|7\\.1|dual\\s*audio|multi\\s*audio|dubbed|subbed)\\b",`,
      },
      {
        // Titles like "Extra Ordinary" or "The Trailer Park Boys" were cut to nothing.
        // Samples/trailers are already filtered by file name in the scanner.
        old: String.raw`    "\\b(?:sample|trailer|teaser|featurette|extras?|bonus)\\b",` + '\n',
        new: '',
      },
      {
        old: '  if (hit?.index !== undefined) text = text.slice(0, hit.index);',
        new: '  if (hit?.index !== undefined && hit.index > 0) text = text.slice(0, hit.index);',
      },
    ],
  },
  {
    file: 'src/lib/server/queries.ts',
    changes: [
      {
        old: 'import { getScanStatus } from "./scanner";',
        new: L('import { getScanStatus } from "./scanner";', 'import { normalizeTitle } from "@/lib/media/normalize";'),
      },
      {
        // Browse search compared a raw lowercase query to the punctuation-stripped column.
        old: L(
          '    where.push("t.normalized_title LIKE ?");',
          '    values.push(`%${normalizeSqlLike(params.query.trim())}%`);',
        ),
        new: L(
          '    where.push("t.normalized_title LIKE ?");',
          '    const needle = normalizeTitle(params.query) || normalizeSqlLike(params.query.trim());',
          '    values.push(`%${needle}%`);',
        ),
      },
      {
        // NULL category made the whole row fail "!= '3D Movies'", hiding it from the hero.
        old: "t.category != '3D Movies'",
        new: "COALESCE(t.category, '') != '3D Movies'",
        all: true,
      },
    ],
  },
  {
    file: 'src/lib/server/search.ts',
    changes: [
      {
        // "spider-man" never hit the startsWith/includes boosts.
        old: L('function matchScore(doc: SearchDoc, rawQuery: string, query: string) {', '  let best = titleSimilarity(query, doc.title);'),
        new: L(
          'function matchScore(doc: SearchDoc, rawQuery: string, query: string) {',
          '  query = normalizeTitle(query) || query;',
          '  let best = titleSimilarity(query, doc.title);',
        ),
      },
    ],
  },
  {
    file: 'src/lib/server/subtitles.ts',
    changes: [
      {
        // Failed job stayed in the map forever.
        old: L(
          '    job.error = "Embedded subtitles need ffmpeg. Install it or set FFMPEG_PATH.";',
          '    pumpQueue();',
          '    return;',
        ),
        new: L(
          '    job.error = "Embedded subtitles need ffmpeg. Install it or set FFMPEG_PATH.";',
          '    const cleanup = setTimeout(() => {',
          '      if (jobs.get(job.key) === job) jobs.delete(job.key);',
          '    }, JOB_RETENTION_MS);',
          '    cleanup.unref?.();',
          '    pumpQueue();',
          '    return;',
        ),
      },
    ],
  },
  {
    file: 'src/app/api/subtitles/route.ts',
    changes: [
      {
        old: 'import { extensionOf } from "@/lib/media/normalize";',
        new: L('import { extensionOf, isSubtitleFile } from "@/lib/media/normalize";', 'import { normalizeMediaPath } from "@/lib/server/paths";'),
      },
      {
        old: 'const relativePath = request.nextUrl.searchParams.get("path");',
        new: 'const relativePath = normalizeMediaPath(request.nextUrl.searchParams.get("path"));',
      },
      {
        // The endpoint proxied any file under the media root.
        old: 'if (!relativePath || relativePath.split("/").some((segment) => segment === ".." || segment === ".")) {',
        new: 'if (!relativePath || !isSubtitleFile(relativePath)) {',
      },
    ],
  },
  {
    file: 'scripts/vlc-companion.mjs',
    changes: [
      {
        old: "'Access-Control-Max-Age': '600',",
        new: L("'Access-Control-Max-Age': '600',", "    'Access-Control-Allow-Private-Network': 'true',"),
      },
    ],
  },
  {
    file: 'src/components/home/Hero.tsx',
    changes: [
      {
        // Rating comes from TMDB, not IMDb.
        old: '<span className="text-[9px] font-semibold text-amber-400/70">IMDb</span>',
        new: '<span className="text-[9px] font-semibold text-amber-400/70">TMDB</span>',
      },
    ],
  },
  {
    file: 'src/components/details/DetailsView.tsx',
    changes: [
      {
        // Subtitle files next to a movie were never listed.
        old: '{title.episodes.some((episode) => episode.subtitles.length > 0) ? (',
        new: '{title.subtitles.length > 0 || title.episodes.some((episode) => episode.subtitles.length > 0) ? (',
      },
      {
        old: '{title.episodes.flatMap((episode) =>',
        new: L(
          '{title.subtitles.map((track) => (',
          '                <a',
          '                  key={`title-${track.path}`}',
          '                  href={subtitleUrl(track.path)}',
          '                  target="_blank"',
          '                  rel="noreferrer"',
          '                  className="chip !h-7 text-[0.62rem]"',
          '                  title={track.path}',
          '                >',
          '                  <Captions className="h-2.5 w-2.5" />',
          '                  {track.label}',
          '                </a>',
          '              ))}',
          '              {title.episodes.flatMap((episode) =>',
        ),
      },
    ],
  },
  {
    file: 'src/app/globals.css',
    changes: [
      {
        // "both" kept an identity transform forever, which traps position:fixed children.
        old: 'animation: fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;',
        new: 'animation: fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) backwards;',
      },
    ],
  },
  {
    file: 'tailwind.config.js',
    changes: [
      {
        // font-display (Genres decade tiles) rendered Manrope instead of Bebas Neue.
        old: 'display: ["var(--font-ui)"',
        new: 'display: ["var(--font-display)"',
      },
    ],
  },
  {
    file: 'package.json',
    changes: [
      // README says .env.local is read by the CLI scripts. It was not.
      { old: '"scan": "tsx scripts/scan.ts",', new: '"scan": "tsx --env-file=.env.local scripts/scan.ts",' },
      { old: '"scan:full": "tsx scripts/scan.ts --force",', new: '"scan:full": "tsx --env-file=.env.local scripts/scan.ts --force",' },
      { old: '"verify": "tsx scripts/verify.ts",', new: '"verify": "tsx --env-file=.env.local scripts/verify.ts",' },
      { old: '"vlc": "node scripts/vlc-companion.mjs"', new: '"vlc": "node --env-file=.env.local scripts/vlc-companion.mjs"' },
    ],
  },
];

const browsePage = (kind, eyebrow, title, description, name) =>
  L(
    "import { Suspense } from 'react';",
    "import BrowseView from '@/components/browse/BrowseView';",
    '',
    `export default function ${name}() {`,
    '  // BrowseView calls useSearchParams(); Next 15 fails `next build` without a Suspense boundary.',
    '  return (',
    '    <Suspense fallback={null}>',
    '      <BrowseView',
    `        kind="${kind}"`,
    `        eyebrow="${eyebrow}"`,
    `        title="${title}"`,
    `        description="${description}"`,
    '      />',
    '    </Suspense>',
    '  );',
    '}',
    '',
  );

/** Whole-file writes (new files or small files that are simply replaced). */
const writes = [
  {
    file: 'src/app/movies/page.tsx',
    content: browsePage(
      'movie',
      'Feature presentations',
      'Movies',
      'Every film on your server, beautifully arranged and ready to play. Browse the complete local collection — no internet required.',
      'MoviesPage',
    ),
  },
  {
    file: 'src/app/series/page.tsx',
    content: browsePage(
      'series',
      'Episodic storytelling',
      'TV Series',
      'Every season and episode in your local library, ready for the next binge. Pick up an episode and stream it instantly.',
      'SeriesPage',
    ),
  },
  {
    file: '.gitignore',
    content: L(
      '# dependencies / build',
      'node_modules/',
      '.next/',
      'out/',
      '*.tsbuildinfo',
      '',
      '# local config and generated data',
      '.env.local',
      '.env*.local',
      'data/',
      '',
      '# misc',
      '.DS_Store',
      'npm-debug.log*',
      '',
    ),
    skipIfExists: true,
  },
];

let failed = 0;
let changed = 0;

for (const edit of edits) {
  const path = join(root, edit.file);
  if (!existsSync(path)) {
    console.log(`SKIP     ${edit.file} (not found)`);
    failed += 1;
    continue;
  }
  let text = readFileSync(path, 'utf8');
  const crlf = text.includes('\r\n');
  const fit = (value) => (crlf ? value.replace(/\n/g, '\r\n') : value);
  const problems = [];
  let applied = 0;

  for (const [index, change] of edit.changes.entries()) {
    const oldText = fit(change.old);
    const newText = fit(change.new);
    const count = text.split(oldText).length - 1;
    if (count === 0) {
      if (!newText || text.includes(newText)) continue; // already applied (or pure deletion done)
      problems.push(`change #${index + 1}: old text not found`);
    } else if (count > 1 && !change.all) {
      problems.push(`change #${index + 1}: old text found ${count} times`);
    } else {
      text = text.split(oldText).join(newText);
      applied += 1;
    }
  }

  if (problems.length) {
    failed += 1;
    console.log(`FAILED   ${edit.file}\n           ${problems.join('\n           ')}\n           (file left unchanged)`);
    continue;
  }
  if (applied) {
    writeFileSync(path, text);
    changed += 1;
    console.log(`PATCHED  ${edit.file} (${applied} change${applied === 1 ? '' : 's'})`);
  } else {
    console.log(`OK       ${edit.file} (already applied)`);
  }
}

for (const entry of writes) {
  const path = join(root, entry.file);
  if (entry.skipIfExists && existsSync(path)) {
    console.log(`OK       ${entry.file} (exists)`);
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, entry.content);
  changed += 1;
  console.log(`WROTE    ${entry.file}`);
}

console.log(`\n${changed} file(s) written, ${failed} problem(s).`);
if (failed) process.exitCode = 1;
