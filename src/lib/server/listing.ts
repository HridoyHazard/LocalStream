import { decodeEntities } from "@/lib/media/normalize";
import { serverConfig } from "./config";

export interface ListingItem {
  name: string;
  path: string;
  isDir: boolean;
  mtime: string;
  sizeLabel: string;
  size: number;
}

export interface DirectoryListing {
  protocol: "h5ai" | "autoindex";
  items: ListingItem[];
  url: string;
  htmlBytes: number;
}

export class MediaServerError extends Error {
  status?: number;
  code: "unreachable" | "unauthorized" | "not-a-listing" | "not-found";
  constructor(message: string, code: MediaServerError["code"], status?: number) {
    super(message);
    this.name = "MediaServerError";
    this.code = code;
    this.status = status;
  }
}

function parseSize(label: string): number {
  const text = label.trim().replace(/,/g, "");
  if (!text) return 0;
  const match = text.match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = (match[2] || "B").toUpperCase();
  const factor = unit === "TB" ? 1024 ** 4 : unit === "GB" ? 1024 ** 3 : unit === "MB" ? 1024 ** 2 : unit === "KB" ? 1024 : 1;
  return Math.round(value * factor);
}

export function parseDirectoryIndexDate(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.replace(" ", "T");
  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
  const ms = Date.parse(withSeconds);
  return Number.isFinite(ms) ? ms : 0;
}

function directoryUrl(relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded ? `${encoded}/` : "", serverConfig.mediaServerUrl).toString();
}

function resolveItemPath(href: string, pageUrl: string): { path: string; isExternal: boolean } | null {
  try {
    const url = new URL(href, pageUrl);
    const base = new URL(serverConfig.mediaServerUrl);
    if (url.origin !== base.origin) return { path: "", isExternal: true };
    const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    if (!url.pathname.startsWith(basePath)) return { path: "", isExternal: true };
    const relative = decodeURIComponent(url.pathname.slice(basePath.length)).replace(/\/+$/, "");
    if (!relative || relative.split("/").some((part) => part === "..")) return null;
    return { path: relative, isExternal: false };
  } catch {
    return null;
  }
}

function parseH5ai(html: string, pageUrl: string): ListingItem[] {
  const items: ListingItem[] = [];
  const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];
    const hrefMatch = row.match(/href="([^"]+)"/);
    if (!hrefMatch) continue;
    const href = decodeEntities(hrefMatch[1]);
    if (!href || href === ".." || href === "./" || href.startsWith("?") || href.startsWith("#")) continue;
    const resolved = resolveItemPath(href, pageUrl);
    if (!resolved || resolved.isExternal) continue;

    const rawName = row.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    const name = decodeEntities(rawName.replace(/<[^>]+>/g, "")).trim() || resolved.path.split("/").pop() || "";
    if (!name) continue;
    if (name === "Parent Directory" || resolved.path === "" || resolved.path.endsWith("_h5ai")) continue;

    const isDir = /\/$/.test(href) || /folder(?:-parent)?\.png/i.test(row);
    const mtime = row.match(/<td class="fb-d">([\s\S]*?)<\/td>/)?.[1]?.trim() || "";
    const sizeLabel = row.match(/<td class="fb-s">([\s\S]*?)<\/td>/)?.[1]?.trim() || "";
    items.push({ name, path: resolved.path, isDir, mtime, size: isDir ? 0 : parseSize(sizeLabel), sizeLabel });
  }
  return items;
}

function parseAutoindex(html: string, pageUrl: string): ListingItem[] {
  const items: ListingItem[] = [];
  const anchorRegex = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeEntities(match[1]);
    if (!href || href === "../" || href === ".." || href.startsWith("?") || href.startsWith("#") || href.startsWith("/_h5ai")) continue;
    const resolved = resolveItemPath(href, pageUrl);
    if (!resolved || resolved.isExternal || !resolved.path) continue;
    const name = decodeEntities(match[2].replace(/<[^>]+>/g, "")).trim() || resolved.path.split("/").pop() || "";
    if (!name || name === "Parent Directory") continue;
    const tail = html.slice(match.index, Math.min(html.length, match.index + 600));
    const isDir = /\/$/.test(href) || /\[DIR\]/i.test(tail);
    const sizeMatch = tail.match(/([\d.]+\s*(?:B|KB|MB|GB|TB))/i);
    const dateMatch = tail.match(/(\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
    items.push({
      name,
      path: resolved.path,
      isDir,
      mtime: dateMatch?.[1] || "",
      sizeLabel: sizeMatch?.[1] || "",
      size: isDir ? 0 : parseSize(sizeMatch?.[1] || ""),
    });
  }
  // Deduplicate anchors that share a target.
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

export async function fetchDirectoryListing(relativePath: string, signal?: AbortSignal): Promise<DirectoryListing> {
  const url = directoryUrl(relativePath);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "LocalStream/1.0 (+local media indexer)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: signal ?? AbortSignal.timeout(serverConfig.scanRequestTimeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    throw new MediaServerError(
      `Cannot reach ${url}: ${error instanceof Error ? error.message : String(error)}`,
      "unreachable",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MediaServerError(`Media server authentication required (${response.status})`, "unauthorized", response.status);
  }
  if (response.status === 404) {
    throw new MediaServerError(`Directory not found: ${url}`, "not-found", 404);
  }
  if (!response.ok) {
    throw new MediaServerError(`Media server returned HTTP ${response.status}`, "unreachable", response.status);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("html") && !contentType.includes("text")) {
    throw new MediaServerError(`Unsupported media server response (${contentType || "unknown"})`, "not-a-listing");
  }

  const html = await response.text();
  const isH5ai = /h5ai/i.test(html) || /fb-n/.test(html);
  let items = isH5ai ? parseH5ai(html, url) : parseAutoindex(html, url);
  if (!isH5ai && items.length === 0) {
    // Some servers render a table identical to h5ai's fallback without branding.
    items = parseH5ai(html, url);
  }
  if (items.length === 0 && !isH5ai && !/<a\s/i.test(html)) {
    throw new MediaServerError(
      "The URL is not an HTTP directory index. LocalStream detected an unsupported server protocol.",
      "not-a-listing",
    );
  }

  return { protocol: isH5ai ? "h5ai" : "autoindex", items, url, htmlBytes: html.length };
}

export function rootUrl() {
  return serverConfig.mediaServerUrl;
}
