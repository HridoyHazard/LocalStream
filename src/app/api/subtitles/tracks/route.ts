import { NextRequest, NextResponse } from "next/server";
import { probeEmbeddedSubtitles } from "@/lib/server/subtitles";
import { normalizeMediaPath } from "@/lib/server/paths";
import { isPathReachableFast } from "@/lib/server/reachability";

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

  // ffprobe reads the remote file directly. If the server is off the network
  // that call would block for a minute, so answer immediately instead.
  if (!(await isPathReachableFast(relativePath))) {
    return NextResponse.json(
      {
        available: false,
        error: "The media server is offline, so subtitle tracks cannot be inspected right now.",
        tracks: [],
        duration: null,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
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
