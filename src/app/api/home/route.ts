import { NextResponse } from "next/server";
import { getHomeData } from "@/lib/server/queries";
import { ensureScanScheduled, getScanStatus } from "@/lib/server/scanner";
import { metadataStatus } from "@/lib/server/metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureScanScheduled();
  const data = getHomeData();
  return NextResponse.json(
    {
      ...data,
      scan: getScanStatus(),
      metadata: metadataStatus(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
