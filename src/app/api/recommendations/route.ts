import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/server/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 30);
  const limit = Math.min(48, Math.max(1, Number(params.get("limit") ?? 20) || 20));
  return NextResponse.json(
    { items: getRecommendations(ids, limit) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
