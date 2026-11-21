import { NextRequest, NextResponse } from "next/server";
import { ensureScanScheduled, getScanStatus, startScan } from "@/lib/server/scanner";
import { metadataEnabled, metadataStatus } from "@/lib/server/metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ensureScanScheduled();
  return NextResponse.json(
    { scan: getScanStatus(), metadataEnabled: metadataEnabled(), metadata: metadataStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  ensureScanScheduled();
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean } | null;
    force = Boolean(body?.force);
  } catch {
    force = false;
  }

  if (getScanStatus().running) {
    return NextResponse.json({ started: false, scan: getScanStatus() }, { status: 202 });
  }

  void startScan({ force, reason: force ? "manual-full" : "manual" });
  return NextResponse.json({ started: true, scan: getScanStatus() }, { status: 202 });
}
