import { NextRequest, NextResponse } from "next/server";
import { getBrowse, getFacets, getTitlesByIds, type BrowseParams } from "@/lib/server/queries";
import { ensureScanScheduled } from "@/lib/server/scanner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function numberParam(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  ensureScanScheduled();
  const params = request.nextUrl.searchParams;

  const ids = params.get("ids");
  if (ids) {
    const items = getTitlesByIds(ids.split(",").map((id) => id.trim()).filter(Boolean));
    return NextResponse.json({ items, total: items.length });
  }

  const kindParam = params.get("kind");
  const kind: BrowseParams["kind"] =
    kindParam === "movie" || kindParam === "series" || kindParam === "all" ? kindParam : "all";
  const sortParam = params.get("sort");
  const sort: BrowseParams["sort"] = ["recent", "title", "year", "rating", "popular", "size"].includes(
    sortParam ?? "",
  )
    ? (sortParam as BrowseParams["sort"])
    : "recent";

  const response = getBrowse({
    kind,
    page: numberParam(params.get("page")) ?? 1,
    pageSize: numberParam(params.get("pageSize")) ?? 48,
    query: params.get("q") ?? undefined,
    genre: params.get("genre") ?? undefined,
    year: numberParam(params.get("year")),
    decade: numberParam(params.get("decade")),
    category: params.get("category"),
    language: params.get("language"),
    minRating: numberParam(params.get("minRating")),
    sort,
  });

  return NextResponse.json(
    {
      ...response,
      facets: params.get("facets") === "false" ? response.facets : getFacets(kind),
      filters: {
        kind,
        genre: params.get("genre"),
        year: numberParam(params.get("year")),
        decade: numberParam(params.get("decade")),
        category: params.get("category"),
        language: params.get("language"),
        sort,
        q: params.get("q"),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
