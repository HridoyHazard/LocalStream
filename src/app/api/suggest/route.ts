import { NextRequest, NextResponse } from "next/server";
import { searchTitles } from "@/lib/server/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? "";
  const limit = Math.min(12, Math.max(1, Number(params.get("limit") ?? 7) || 7));
  const response = searchTitles({ query, limit });
  return NextResponse.json(
    {
      query,
      suggestions: response.results,
      didYouMean: response.didYouMean,
      tookMs: response.tookMs,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
