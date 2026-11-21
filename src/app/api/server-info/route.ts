import { NextResponse } from "next/server";
import { getSetting, getLibraryVersion } from "@/lib/server/db";
import { ensureScanScheduled, getScanStatus, getStoredServerInfo } from "@/lib/server/scanner";
import { serverConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureScanScheduled();
  let streaming: unknown = null;
  const raw = getSetting("streaming_capabilities");
  if (raw) {
    try {
      streaming = JSON.parse(raw);
    } catch {
      streaming = null;
    }
  }

  return NextResponse.json(
    {
      mediaServerUrl: serverConfig.mediaServerUrl,
      protocol: getSetting("server_protocol") ?? "unknown",
      scan: getScanStatus(),
      streaming,
      server: getStoredServerInfo(),
      libraryVersion: getLibraryVersion(),
      lastScanStatus: getSetting("last_scan_status"),
      lastScanError: getSetting("last_scan_error"),
      proxy: {
        streamEndpoint: "/api/stream/<path>",
        rangeRequests: true,
        reason: "The media server does not send CORS headers, so playback is proxied by LocalStream.",
      },
      vlc: {
        playlistEndpoint: "/api/vlc",
        companionUrl: serverConfig.vlcCompanionUrl,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
