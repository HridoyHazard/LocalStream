import { NextRequest, NextResponse } from "next/server";
import { mediaUrlForPath, mimeTypeForPath } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Range-aware streaming proxy.
 *
 * h5ai supports HTTP Range (206) but sends no CORS headers, which prevents
 * direct playback in browsers. Proxying through the same origin keeps seeking
 * instant while remaining a byte-for-byte passthrough (no transcoding).
 */

function isValidPath(segments: string[]) {
  if (!segments.length) return false;
  return segments.every(
    (segment) => segment && segment !== "." && segment !== ".." && !segment.includes("\\") && !segment.includes("/"),
  );
}

function copyHeader(headers: Headers, source: Headers, name: string, fallback?: string) {
  const value = source.get(name) ?? fallback;
  if (value) headers.set(name, value);
}

function corsHeaders(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, If-Range, Content-Type");
  headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Type");
}

/** Build response headers, preferring a real MIME type over nginx's generic one. */
function responseHeaders(upstream: Response, relativePath: string) {
  const headers = new Headers();
  const inferredType = mimeTypeForPath(relativePath);
  const upstreamType = upstream.headers.get("content-type");
  headers.set("Content-Type", inferredType ?? upstreamType ?? "application/octet-stream");

  copyHeader(headers, upstream.headers, "content-length");
  copyHeader(headers, upstream.headers, "content-range");
  copyHeader(headers, upstream.headers, "accept-ranges", "bytes");
  copyHeader(headers, upstream.headers, "last-modified");
  copyHeader(headers, upstream.headers, "etag");
  copyHeader(headers, upstream.headers, "cache-control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Accel-Buffering", "no");
  corsHeaders(headers);
  return headers;
}

function badUpstream(error: unknown, upstreamUrl: string) {
  return NextResponse.json(
    {
      error: "The media server could not be reached",
      detail: error instanceof Error ? error.message : String(error),
      upstream: upstreamUrl,
    },
    { status: 502 },
  );
}

export async function OPTIONS() {
  const headers = new Headers();
  corsHeaders(headers);
  return new NextResponse(null, { status: 204, headers });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const decoded = path.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment; // already decoded, e.g. a literal "%" in the file name
    }
  });
  if (!isValidPath(path) || !isValidPath(decoded)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  const relativePath = decoded.join("/");
  const upstreamUrl = mediaUrlForPath(relativePath);
  const range = request.headers.get("range");

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "LocalStream/1.0 (+local media proxy)",
    Accept: "*/*",
    "Accept-Encoding": "identity",
  };
  if (range) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: upstreamHeaders,
      cache: "no-store",
      redirect: "follow",
      signal: request.signal, // stop pulling from the ISP server when the viewer leaves or seeks
    });
  } catch (error) {
    return badUpstream(error, upstreamUrl);
  }

  if (upstream.status === 404) {
    return NextResponse.json({ error: "Media file not found on the server", upstream: upstreamUrl }, { status: 404 });
  }
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416) {
    if (upstream.body) await upstream.body.cancel().catch(() => undefined);
    return NextResponse.json(
      { error: `Media server returned HTTP ${upstream.status}`, upstream: upstreamUrl },
      { status: 502 },
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders(upstream, relativePath),
  });
}

/**
 * HEAD returns the same metadata a Range probe would, without downloading a
 * byte. The upstream server natively supports HEAD, so no body has to be
 * opened (and then cancelled) for this response.
 */
export async function HEAD(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!isValidPath(path)) {
    return NextResponse.json({ error: "Invalid media path" }, { status: 400 });
  }

  const relativePath = path.map((segment) => decodeURIComponent(segment)).join("/");
  const upstreamUrl = mediaUrlForPath(relativePath);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "HEAD",
      headers: {
        "User-Agent": "LocalStream/1.0 (+local media proxy)",
        Accept: "*/*",
        "Accept-Encoding": "identity",
      },
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    return badUpstream(error, upstreamUrl);
  }

  if (upstream.status === 404) {
    return NextResponse.json({ error: "Media file not found on the server", upstream: upstreamUrl }, { status: 404 });
  }
  if (!upstream.ok) {
    if (upstream.body) await upstream.body.cancel().catch(() => undefined);
    return NextResponse.json(
      { error: `Media server returned HTTP ${upstream.status}`, upstream: upstreamUrl },
      { status: 502 },
    );
  }

  return new NextResponse(null, { status: 200, headers: responseHeaders(upstream, relativePath) });
}
