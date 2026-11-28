export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiGetOptions {
  /** Cache lifetime in ms for identical GET requests. 0 disables caching. */
  ttl?: number;
  /** Skip the cache and any in-flight request, and fetch fresh data. */
  force?: boolean;
  /** Abort the request after this many ms. */
  timeout?: number;
}

const DEFAULT_TTL = 20_000;
const DEFAULT_TIMEOUT = 25_000;

interface CacheEntry {
  at: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

/** Drops every cached GET. Called after scans and other writes. */
export function clearApiCache() {
  cache.clear();
  inflight.clear();
}

if (typeof window !== 'undefined') {
  window.addEventListener('localstream:refresh', clearApiCache);
}

function abortError() {
  return new DOMException('The request was aborted', 'AbortError');
}

async function readError(response: Response) {
  let message = `Request failed (${response.status})`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) message = payload.error;
  } catch {
    // Keep the status-based message.
  }
  return new ApiError(message, response.status);
}

async function fetchJson<T>(path: string, timeout: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw await readError(response);
    return (await response.json()) as T;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Check your connection and try again.', 408);
    }
    throw new ApiError('Could not reach LocalStream. Check that the app is running and try again.', 0);
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchWithRetry<T>(path: string, timeout: number): Promise<T> {
  try {
    return await fetchJson<T>(path, timeout);
  } catch (cause) {
    // Retry once for dropped connections and 5xx responses; never for 4xx.
    if (cause instanceof ApiError && (cause.status === 0 || cause.status >= 500)) {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      return fetchJson<T>(path, timeout);
    }
    throw cause;
  }
}

/**
 * GET JSON with request de-duplication, a short cache and a timeout.
 * The caller's AbortSignal only cancels this caller; a shared request keeps
 * running so other components waiting on the same URL still get their data.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal, options: ApiGetOptions = {}): Promise<T> {
  const { ttl = DEFAULT_TTL, force = false, timeout = DEFAULT_TIMEOUT } = options;
  if (signal?.aborted) throw abortError();

  if (!force) {
    const hit = cache.get(path);
    if (hit && ttl > 0 && Date.now() - hit.at < ttl) return hit.value as T;
  }

  let request = force ? undefined : (inflight.get(path) as Promise<T> | undefined);
  if (!request) {
    const created: Promise<T> = fetchWithRetry<T>(path, timeout)
      .then((value) => {
        if (ttl > 0) cache.set(path, { at: Date.now(), value });
        return value;
      })
      .finally(() => {
        if (inflight.get(path) === created) inflight.delete(path);
      });
    inflight.set(path, created);
    request = created;
  }

  if (!signal) return request;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    request!.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (cause) => {
        signal.removeEventListener('abort', onAbort);
        reject(cause);
      },
    );
  });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw await readError(response);
    clearApiCache();
    return (await response.json()) as T;
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Try again.', 408);
    }
    throw new ApiError('Could not reach LocalStream. Check that the app is running and try again.', 0);
  } finally {
    window.clearTimeout(timer);
  }
}
