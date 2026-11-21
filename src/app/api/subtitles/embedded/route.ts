import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { ensureEmbeddedSubtitle } from "@/lib/server/subtitles";
import { normalizeMediaPath } from "@/lib/server/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, If-Range, Content-Type",
  "Access-Control-Expose-Headers": "Content-Length, Content-Type",
};

/**
 * Returns a WebVTT version of an embedded subtitle track.
 *
 * The first request starts an ffmpeg extraction and answers 202 while it runs
 * (the player polls until the VTT is ready). Extracted tracks are cached under
 * data/subtitles, so later requests return the file immediately.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const relativePath = normalizeMediaPath(params.get("path"));
  if (!relativePath) {
    return NextResponse.json({ error: "A valid media path is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const streamIndex = Number(params.get("track"));
  if (!Number.isInteger(streamIndex) || streamIndex < 0) {
    return NextResponse.json({ error: "A valid track index is required" }, { status: 400, headers: CORS_HEADERS });
  }

  const sizeValue = Number(params.get("size"));
  const size = Number.isFinite(sizeValue) && sizeValue > 0 ? Math.round(sizeValue) : null;

  const result = await ensureEmbeddedSubtitle(relativePath, streamIndex, size);
  if (result.state === "ready" && result.output) {
    try {
      const body = await readFile(result.output);
      return new NextResponse(body, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/vtt; charset=utf-8",
          "Content-Disposition": 'inline; filename="embedded-subtitles.vtt"',
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json(
        { state: "error", progress: null, error: "The extracted subtitle file could not be read." },
        { status: 500, headers: CORS_HEADERS },
      );
    }
  }

  const status = result.state === "error" ? 422 : 202;
  return NextResponse.json(
    { state: result.state, progress: result.progress, error: result.error },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        "Retry-After": "1",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
