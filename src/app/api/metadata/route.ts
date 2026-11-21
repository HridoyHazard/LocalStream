import { NextRequest, NextResponse } from "next/server";
import { enrichPendingTitles, enrichTitleById, metadataEnabled, metadataStatus } from "@/lib/server/metadata";
import { getScanStatus } from "@/lib/server/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { enabled: metadataEnabled(), status: metadataStatus(), scan: getScanStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (!metadataEnabled()) {
    return NextResponse.json(
      { error: "TMDB metadata is disabled. Set TMDB_API_KEY in .env.local to enable it." },
      { status: 400 },
    );
  }

  let id: string | null = null;
  let limit = 40;
  try {
    const body = (await request.json()) as { id?: string; limit?: number } | null;
    id = body?.id ?? null;
    if (typeof body?.limit === "number") limit = Math.min(200, Math.max(1, body.limit));
  } catch {
    // Empty body means "enrich a default batch".
  }

  if (id) {
    const result = await enrichTitleById(id);
    return NextResponse.json({ result, status: metadataStatus() });
  }

  const result = await enrichPendingTitles(limit);
  return NextResponse.json({ result, status: metadataStatus() });
}
