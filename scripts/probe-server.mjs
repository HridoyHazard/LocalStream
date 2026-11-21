/**
 * One-off discovery crawler for the ISP h5ai index.
 * Produces a compact summary of the directory tree, formats and TV-like files.
 */
import { writeFile, mkdir } from 'node:fs/promises';

const ROOT = process.env.MEDIA_SERVER_URL || 'http://172.16.50.7/DHAKA-FLIX-7/';
const VIDEO_EXT = /\.(mp4|mkv|avi|mov|wmv|webm|m4v|ts|m2ts|mpg|mpeg|flv|ogv)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|webp|bmp)$/i;

function parseListing(html) {
  const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
  const items = [];
  for (const row of rows) {
    const hrefMatch = row.match(/href="([^"]+)"/);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].replace(/&amp;/g, '&');
    if (!href || href === '..' || href === './' || href.startsWith('?')) continue;
    const name = (row.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1] || '').replace(/<[^>]+>/g, '').trim();
    const date = (row.match(/<td class="fb-d">([\s\S]*?)<\/td>/)?.[1] || '').trim();
    const size = (row.match(/<td class="fb-s">([\s\S]*?)<\/td>/)?.[1] || '').trim();
    if (!name) continue;
    items.push({ href, name, date, size, isDir: /\/$/.test(href) });
  }
  return items;
}

function absolute(href) {
  return new URL(href, ROOT).toString();
}

let active = 0;
const queue = [{ path: new URL(ROOT).pathname.replace(/\/$/, ''), depth: 0 }];
const seen = new Set();
const dirRecords = [];
const videoSamples = [];
const tvSamples = [];
let videos = 0;
let images = 0;
let errors = 0;
const formatCounts = {};
let done = 0;

function take() {
  return queue.shift();
}

async function worker() {
  while (true) {
    const job = take();
    if (!job) {
      if (active === 0) return;
      await new Promise((r) => setTimeout(r, 40));
      continue;
    }
    if (seen.has(job.path)) continue;
    seen.add(job.path);
    active++;
    try {
      const url = absolute(job.path + '/');
      let html;
      let lastError;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          html = await res.text();
          break;
        } catch (e) {
          lastError = e;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
      if (!html) {
        errors++;
        dirRecords.push({ path: job.path, depth: job.depth, error: String(lastError) });
        continue;
      }
      const items = parseListing(html);
      const dirs = items.filter((i) => i.isDir);
      const files = items.filter((i) => !i.isDir);
      const vids = files.filter((f) => VIDEO_EXT.test(f.name));
      const imgs = files.filter((f) => IMAGE_EXT.test(f.name));
      videos += vids.length;
      images += imgs.length;
      for (const v of vids) {
        const ext = v.name.split('.').pop()?.toLowerCase() || 'unknown';
        formatCounts[ext] = (formatCounts[ext] || 0) + 1;
        if (videoSamples.length < 40) videoSamples.push({ dir: job.path, name: v.name, size: v.size });
        if (/s\d{1,2}\s*e\d{1,2}|season\s*\d+|\b\d{1,2}x\d{1,2}\b/i.test(`${job.path}/${v.name}`)) {
          if (tvSamples.length < 40) tvSamples.push({ dir: job.path, name: v.name });
        }
      }
      dirRecords.push({
        path: job.path,
        depth: job.depth,
        dirs: dirs.length,
        files: files.length,
        videos: vids.length,
        images: imgs.length,
        sample: vids[0]?.name,
        mtime: items.reduce((max, i) => (i.date > max ? i.date : max), ''),
      });
      if (job.depth < 8) {
        for (const d of dirs) {
          const path = new URL(d.href, url).pathname.replace(/\/$/, '');
          if (!seen.has(path)) queue.push({ path, depth: job.depth + 1 });
        }
      }
    } catch (e) {
      errors++;
      dirRecords.push({ path: job.path, depth: job.depth, error: String(e) });
    } finally {
      active--;
      done++;
      if (done % 100 === 0) {
        console.log(`scanned=${done} queue=${queue.length} active=${active} dirs=${dirRecords.length} videos=${videos} errors=${errors}`);
      }
    }
  }
}

await Promise.all(Array.from({ length: 10 }, worker));
const summary = {
  root: ROOT,
  scannedDirs: dirRecords.length,
  videos,
  images,
  errors,
  formatCounts,
  deepest: Math.max(...dirRecords.map((d) => d.depth)),
  videoSamples,
  tvSamples,
  categoryRoots: dirRecords.filter((d) => d.depth <= 2),
  dirsWithVideos: dirRecords.filter((d) => d.videos > 0).length,
  yearLikeDirs: dirRecords.filter((d) => /^\(\d{4}(-\d{4})?\)$/.test(d.path.split('/').pop() || '')).length,
};
await mkdir('data', { recursive: true });
await writeFile('data/probe.json', JSON.stringify({ summary, dirRecords }, null, 2));
console.log(JSON.stringify(summary, null, 2));
