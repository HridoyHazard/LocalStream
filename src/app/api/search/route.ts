import { NextRequest, NextResponse } from "next/server";
import { searchTitles } from "@/lib/server/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q") ?? params.get("query") ?? "";
  const kindParam = params.get("kind");
  const kind = kindParam === "movie" || kindParam === "series" ? kindParam : "all";
  const limit = Math.min(80, Math.max(1, Number(params.get("limit") ?? 40) || 40));
  const year = Number(params.get("year")) || null;

  const response = searchTitles({
    query,
    limit,
    kind,
    genre: params.get("genre"),
    year,
    language: params.get("language"),
    category: params.get("category"),
    actor: params.get("actor"),
    director: params.get("director"),
  });

  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
}
