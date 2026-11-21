import { NextResponse } from "next/server";
import { mediaUrlForPath, mimeTypeForPath } from "@/lib/server/config";
import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  // Only serve files that belong to known local artwork.
  const db = getDb();
  const known = db
    .prepare(
      `SELECT 1 FROM titles WHERE local_poster = ? OR local_backdrop = ? LIMIT 1`,
    )
    .get(relativePath, relativePath);
  if (!known) {
    return NextResponse.json({ error: "Image not part of the local library" }, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(mediaUrlForPath(relativePath), {
      headers: { "User-Agent": "LocalStream/1.0 (+artwork proxy)", Accept: "image/*" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch artwork" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Artwork not found" }, { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", mimeTypeForPath(relativePath) ?? upstream.headers.get("content-type") ?? "image/jpeg");
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  headers.set("Cache-Control", "private, max-age=86400");
  headers.set("X-Content-Type-Options", "nosniff");

  return new NextResponse(upstream.body, { status: 200, headers });
}
