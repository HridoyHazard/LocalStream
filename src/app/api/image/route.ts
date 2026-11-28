import { NextResponse } from "next/server";
import { mediaUrlForPath, mimeTypeForPath, splitMount } from "@/lib/server/config";
import { getDb } from "@/lib/server/db";
import { sectionForPath } from "@/lib/server/sources";
import { isPathReachableFast, markPathOffline } from "@/lib/server/reachability";
import { isImageFile } from "@/lib/media/normalize";
import { fetchDirectoryListing, MediaServerError } from "@/lib/server/listing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Remember recent upstream misses so grids do not retry the same poster. */
const misses = new Map<string, number>();
const MISS_TTL_MS = 5 * 60_000;

function isRecentMiss(path: string) {
  const at = misses.get(path);
  if (!at) return false;
  if (Date.now() - at < MISS_TTL_MS) return true;
  misses.delete(path);
  return false;
}

function rememberMiss(path: string) {
  if (misses.size > 2000) {
    const cutoff = Date.now() - MISS_TTL_MS;
    for (const [key, at] of misses) if (at < cutoff) misses.delete(key);
    if (misses.size > 2000) misses.clear();
  }
  misses.set(path, Date.now());
}

/**
 * The live catalogue guesses "<folder>/a_AL_.jpg" for posters (true on server
 * 12 and 7). Other servers name them differently, so on a miss read the folder
 * once and use the image that is really there.
 */
const posterAlias = new Map<string, string | null>();

async function findRealPoster(relativePath: string, signal?: AbortSignal): Promise<string | null | undefined> {
  if (posterAlias.has(relativePath)) return posterAlias.get(relativePath) ?? null;
  let found: string | null = null;
  try {
    const folder = relativePath.slice(0, relativePath.lastIndexOf("/"));
    const listing = await fetchDirectoryListing(folder, signal ?? AbortSignal.timeout(4_000));
    const images = listing.items.filter((item) => !item.isDir && isImageFile(item.name));
    const pick =
      images.find((item) => /^(poster|folder|cover|front)\./i.test(item.name)) ??
      images.find((item) => /poster|cover|folder/i.test(item.name)) ??
      [...images].sort((a, b) => b.size - a.size)[0];
    found = pick?.path ?? null;
  } catch (error) {
    // A missing folder simply has no artwork. Anything else (timeout,
    // connection loss, auth, wrong protocol) is not a final answer, so return
    // `undefined` and do not cache it as "no image".
    if (error instanceof MediaServerError && error.code === "not-found") {
      found = null;
    } else {
      return undefined;
    }
  }
  if (posterAlias.size > 4000) posterAlias.clear();
  posterAlias.set(relativePath, found);
  return found;
}

/**
 * Total time one poster request may spend upstream. The guessed filename is
 * probed briefly; if it misses or stalls we list the folder and fetch the real
 * image inside the same budget, so a slow/misnamed poster cannot pin a worker
 * anywhere near the old 8s ceiling.
 */
const POSTER_BUDGET_MS = 6_500;

/**
 * Per-server success rate for the "<folder>/a_AL_.jpg" guess. Server 7/12 use
 * that name everywhere; server 14 does not. Once a server has missed the guess
 * a few times without ever hitting it, stop probing it and go straight to the
 * folder listing — that removes the timeout penalty for every later poster.
 */
const guessStats = new Map<string, { hits: number; misses: number }>();

function mountKey(relativePath: string) {
  return splitMount(relativePath).mount.id || "primary";
}

function shouldSkipGuess(relativePath: string) {
  const stats = guessStats.get(mountKey(relativePath));
  return Boolean(stats && stats.misses >= 3 && stats.hits === 0);
}

function recordGuess(relativePath: string, hit: boolean) {
  const key = mountKey(relativePath);
  const stats = guessStats.get(key) ?? { hits: 0, misses: 0 };
  if (hit) stats.hits += 1;
  else stats.misses += 1;
  guessStats.set(key, stats);
}

/**
 * Same-origin image proxy for local folder artwork (posters/fanart) so that
 * the UI does not depend on CORS or mixed-content exceptions.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const relativePath = url.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (relativePath.split("/").some((segment) => segment === ".." || segment === ".")) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
  }

  // Only serve files that belong to known local artwork, or artwork inside a
  // curated live-catalog section on one of the configured extra servers.
  const db = getDb();
  const known = db
    .prepare(
      `SELECT 1 FROM titles WHERE local_poster = ? OR local_backdrop = ? LIMIT 1`,
    )
    .get(relativePath, relativePath);
  const liveArtwork = isImageFile(relativePath) && sectionForPath(relativePath) !== null;
  if (!known && !liveArtwork) {
    return NextResponse.json({ error: "Image not part of the local library" }, { status: 404 });
  }

  if (isRecentMiss(relativePath)) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // A grid can request dozens of posters at once. When the owning server is
  // off the network, fail fast instead of holding every image request open for
  // the full connection timeout.
  if (!(await isPathReachableFast(relativePath))) {
    return NextResponse.json(
      { error: "The media server for this artwork is offline" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }

  const deadline = Date.now() + POSTER_BUDGET_MS;
  const remaining = () => Math.max(400, deadline - Date.now());
  const signalFor = (cap: number) => AbortSignal.timeout(Math.min(cap, remaining()));

  const fetchImage = (target: string, signal: AbortSignal) =>
    fetch(mediaUrlForPath(target), {
      headers: { "User-Agent": "LocalStream/1.0 (+artwork proxy)", Accept: "image/*" },
      signal,
      cache: "no-store",
    });

  let upstream: Response | null = null;
  let lastError: "timeout" | "network" | null = null;

  const attempt = async (target: string, cap: number) => {
    try {
      return await fetchImage(target, signalFor(cap));
    } catch (error) {
      lastError =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
          ? "timeout"
          : "network";
      return null;
    }
  };

  const alias = posterAlias.get(relativePath);
  if (alias === null) {
    // This folder is known to contain no artwork; skip the doomed upstream call.
    rememberMiss(relativePath);
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  let servedPath = alias ?? relativePath;
  const isGuess = alias === undefined && /\/a_AL_\.jpg$/i.test(relativePath);
  const skipGuess = isGuess && shouldSkipGuess(relativePath);

  if (!skipGuess) {
    // Probe the guessed filename briefly. A stalled file request is treated the
    // same as a 404 so the folder fallback below still gets a chance.
    upstream = await attempt(servedPath, 3_000);
    if (isGuess) recordGuess(relativePath, Boolean(upstream && upstream.ok));
  }

  const guessMissed = upstream === null || upstream.status === 404;
  let listingFailed = false;
  if (isGuess && (skipGuess || guessMissed)) {
    if (upstream) await upstream.body?.cancel().catch(() => undefined);
    const real = await findRealPoster(relativePath, signalFor(4_000));
    if (real === undefined) {
      listingFailed = true;
    } else if (real && real !== relativePath) {
      servedPath = real;
      upstream = await attempt(real, 4_000);
    }
  }

  if (!upstream) {
    // A failed folder listing or a hard connection failure is server-wide. A
    // single stalled/404 file is not, so it only remembers this path.
    if (listingFailed || lastError === "network") {
      markPathOffline(relativePath);
      return NextResponse.json({ error: "Could not fetch artwork" }, { status: 502 });
    }
    rememberMiss(relativePath);
    return NextResponse.json(
      { error: lastError === "timeout" ? "Artwork request timed out" : "Artwork not found" },
      { status: lastError === "timeout" ? 502 : 404 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    rememberMiss(relativePath);
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", mimeTypeForPath(servedPath) ?? upstream.headers.get("content-type") ?? "image/jpeg");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "private, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");

  return new NextResponse(upstream.body, { status: 200, headers });
}
