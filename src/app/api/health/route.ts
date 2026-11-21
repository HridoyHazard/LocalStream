import { NextResponse } from "next/server";
import { getScanStatus } from "@/lib/server/scanner";
import { getStats } from "@/lib/server/queries";
import { serverConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      app: serverConfig.appName,
      time: Date.now(),
      scan: getScanStatus(),
      stats: getStats(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
