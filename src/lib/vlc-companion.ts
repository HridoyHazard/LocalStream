/**
 * Optional bridge to the LocalStream VLC companion (scripts/vlc-companion.mjs).
 *
 * Browsers cannot start native applications. When the companion is running on
 * this machine, it opens the same local stream in VLC; otherwise callers fall
 * back to an M3U playlist or the copied stream link.
 */
const COMPANION_BASES = ['http://127.0.0.1:8642', 'http://localhost:8642'];
const TIMEOUT_MS = 1200;

export type VlcOpenResult = 'started' | 'vlc-missing' | 'unavailable';

export async function tryOpenInVlc(streamUrl: string, title?: string): Promise<VlcOpenResult> {
  for (const base of COMPANION_BASES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: streamUrl, title }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (response.ok) return 'started';
      if (response.status === 503) return 'vlc-missing';
    } catch {
      // Companion is not running (connection refused), timed out, or blocked.
    } finally {
      clearTimeout(timer);
    }
  }
  return 'unavailable';
}
