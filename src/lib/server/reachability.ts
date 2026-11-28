import { serverConfig, splitMount, type MediaMount } from "./config";

/**
 * Fast "is this server answering?" check. A server that is off the network
 * (for example when you are not on the ISP LAN) would otherwise cost every
 * request the full connection timeout and several retries.
 *
 * Any HTTP answer below 500 counts as online. Results are cached: a working
 * server for a few minutes, a dead one only briefly so recovery is noticed.
 * Concurrent probes share one request, so a grid of poster images cannot open
 * dozens of sockets to a dead host.
 */

const ONLINE_TTL_MS = 3 * 60_000;
const OFFLINE_TTL_MS = 30_000;

const globalKey = "__localstream_reachability__";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: Map<string, { online: boolean; checkedAt: number; error?: string | null }>;
};
const cache = globalStore[globalKey] ?? (globalStore[globalKey] = new Map());

const pendingKey = "__localstream_reachability_pending__";
const pendingStore = globalThis as typeof globalThis & {
  [pendingKey]?: Map<string, Promise<boolean>>;
};
const pending = pendingStore[pendingKey] ?? (pendingStore[pendingKey] = new Map());

function cacheKey(mount: MediaMount) {
  return mount.id || "primary";
}

/** The last known state without waiting for the network, or null if unknown. */
export function peekMountReachable(mount: MediaMount): boolean | null {
  if (serverConfig.reachabilityDisabled) return true;
  const key = cacheKey(mount);
  const hit = cache.get(key);
  if (!hit) {
    // Warm the cache in the background so the next request has an answer.
    void isMountReachable(mount);
    return null;
  }
  const ttl = hit.online ? ONLINE_TTL_MS : OFFLINE_TTL_MS;
  if (Date.now() - hit.checkedAt >= ttl) {
    // Stale-while-revalidate: keep showing the last known state (so a dead
    // server does not flicker back to "online" every TTL) and refresh it in
    // the background for the next request.
    void isMountReachable(mount);
  }
  return hit.online;
}

const USER_AGENT = "LocalStream/1.0 (+reachability check)";

/**
 * A single probe. Any HTTP answer below 500 means the host is serving, so a
 * 401/403/404 still counts as "online" — the server is up, the path may not be.
 * Only a network error, a timeout, or a 5xx is treated as a failure.
 */
async function probeMount(mount: MediaMount) {
  const attempt = async (method: "HEAD" | "GET") => {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "*/*" };
    // Ask for a single byte so a GET fallback stays cheap on big directory views.
    if (method === "GET") headers.Range = "bytes=0-0";
    const response = await fetch(mount.url, {
      method,
      headers,
      signal: AbortSignal.timeout(serverConfig.reachabilityTimeoutMs),
      cache: "no-store",
      redirect: "follow",
    });
    const online = response.status < 500;
    // Consume/cancel the body so the socket is released immediately.
    if (response.body) await response.body.cancel().catch(() => undefined);
    return online;
  };

  let lastError: string | null = null;
  try {
    if (await attempt("HEAD")) return { online: true, error: null };
  } catch (error) {
    lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  try {
    // Some h5ai/nginx setups reject, mangle or starve HEAD requests. A tiny
    // ranged GET is the definitive check, so never declare a server offline
    // until a real GET also fails.
    if (await attempt("GET")) return { online: true, error: null };
    lastError = `HTTP ${lastError ?? "5xx"}`;
  } catch (error) {
    lastError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
  return { online: false, error: lastError ?? "unreachable" };
}

export async function isMountReachable(mount: MediaMount, force = false): Promise<boolean> {
  if (serverConfig.reachabilityDisabled) return true;
  const key = cacheKey(mount);
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.checkedAt < (hit.online ? ONLINE_TTL_MS : OFFLINE_TTL_MS)) {
    return hit.online;
  }

  const existing = pending.get(key);
  if (existing) return existing;

  const task = (async () => {
    const result = await probeMount(mount);
    cache.set(key, { online: result.online, checkedAt: Date.now(), error: result.error });
    return result.online;
  })().finally(() => {
    if (pending.get(key) === task) pending.delete(key);
  });

  pending.set(key, task);
  return task;
}

/** Last known probe details for diagnostics; does not touch the network. */
export function peekMountStatus(mount: MediaMount): { online: boolean; checkedAt: number; error: string | null } | null {
  const hit = cache.get(cacheKey(mount));
  return hit ? { online: hit.online, checkedAt: hit.checkedAt, error: hit.error ?? null } : null;
}

/** Whether the server that owns a library path is currently answering. */
export function isPathReachable(relativePath: string, force = false): Promise<boolean> {
  return isMountReachable(splitMount(relativePath).mount, force);
}

/** Cached, non-blocking variant of {@link isPathReachable}. */
export function peekPathReachable(relativePath: string): boolean | null {
  return peekMountReachable(splitMount(relativePath).mount);
}

function withBudget<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(fallback))
      .finally(() => clearTimeout(timer));
  });
}

/**
 * Reachability for latency-sensitive routes (posters, streams, subtitles).
 *
 * The full probe can spend a couple of seconds on a dead host before it gives
 * up, and a cold poster grid must not queue behind it. This uses the cached
 * state instantly and, only when nothing is cached yet, waits a short budget.
 * The real probe keeps running in the background and caches its result, so the
 * next request (and the UI retry) get the truth.
 */
export async function isPathReachableFast(relativePath: string, budgetMs = 750): Promise<boolean> {
  if (serverConfig.reachabilityDisabled) return true;
  const mount = splitMount(relativePath).mount;
  const hit = cache.get(cacheKey(mount));
  if (hit) {
    const ttl = hit.online ? ONLINE_TTL_MS : OFFLINE_TTL_MS;
    if (Date.now() - hit.checkedAt >= ttl) void isMountReachable(mount);
    return hit.online;
  }
  const result = await withBudget(isMountReachable(mount), budgetMs, null);
  return result === true;
}

/**
 * Record a failed request immediately, so a grid of images or a burst of
 * metadata requests stops hammering a host that just went away.
 */
export function markMountOffline(mount: MediaMount) {
  cache.set(cacheKey(mount), { online: false, checkedAt: Date.now() });
}

export function markPathOffline(relativePath: string) {
  markMountOffline(splitMount(relativePath).mount);
}

export async function getMountStatuses() {
  return Promise.all(
    serverConfig.mounts.map(async (mount) => ({
      id: mount.id || "primary",
      label: mount.label,
      url: mount.url,
      online: await isMountReachable(mount),
    })),
  );
}
