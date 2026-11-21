import { NextRequest, NextResponse } from "next/server";
import { probeEmbeddedSubtitles } from "@/lib/server/subtitles";
import { normalizeMediaPath } from "@/lib/server/paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lists the subtitle streams muxed inside a video file. Browsers cannot read
 * these directly; the player uses this list and asks /api/subtitles/embedded
 * to convert a chosen track to WebVTT.
 */
export async function GET(request: NextRequest) {
  const relativePath = normalizeMediaPath(request.nextUrl.searchParams.get("path"));
  if (!relativePath) {
    return NextResponse.json({ error: "A valid media path is required" }, { status: 400 });
  }

  const result = await probeEmbeddedSubtitles(relativePath);
  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
