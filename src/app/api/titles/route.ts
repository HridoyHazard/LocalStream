import { NextRequest, NextResponse } from "next/server";
import { getBrowse, getTitlesByIds, type BrowseParams } from "@/lib/server/queries";
import { ensureScanScheduled } from "@/lib/server/scanner";
import {
  browseLiveSection,
  getLiveFacets,
  getLiveTitleSummary,
  isLiveTitleId,
  liveSectionForCategory,
  ensureLiveCatalogs,
  type LiveSort,
} from "@/lib/server/live-catalog";
import type { BrowseResponse } from "@/lib/media/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mergeFacets(base: BrowseResponse["facets"], extra: BrowseResponse["facets"]): BrowseResponse["facets"] {
  return {
    years: [...new Set([...base.years, ...extra.years])].sort((a, b) => b - a),
    genres: [...new Set([...base.genres, ...extra.genres])].sort(),
    categories: [...new Set([...base.categories, ...extra.categories])].sort(),
  };
}

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
    const requested = ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);
    if (!requested.length) return NextResponse.json({ items: [], total: 0 });

    const databaseIds = requested.filter((id) => !isLiveTitleId(id));
    const liveIds = requested.filter((id) => isLiveTitleId(id));
    const dbItems = new Map(getTitlesByIds(databaseIds).map((item) => [item.id, item]));

    const liveItems = await Promise.all(liveIds.map((id) => getLiveTitleSummary(id)));
    const liveMap = new Map(
      liveItems.filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => [item.id, item]),
    );

    const items = requested
      .map((id) => dbItems.get(id) ?? liveMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
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

  const category = params.get("category");
  if (category && liveSectionForCategory(category)) {
    void ensureLiveCatalogs();
    const live = await browseLiveSection({
      category,
      kind,
      page: numberParam(params.get("page")) ?? 1,
      pageSize: numberParam(params.get("pageSize")) ?? 48,
      query: params.get("q"),
      year: numberParam(params.get("year")),
      decade: numberParam(params.get("decade")),
      language: params.get("language"),
      sort: sort as LiveSort,
    });
    if (live) {
      return NextResponse.json(
        {
          ...live,
          filters: {
            kind,
            genre: params.get("genre"),
            year: numberParam(params.get("year")),
            decade: numberParam(params.get("decade")),
            category,
            language: params.get("language"),
            sort,
            q: params.get("q"),
            live: true,
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const response = getBrowse({
    kind,
    page: numberParam(params.get("page")) ?? 1,
    pageSize: numberParam(params.get("pageSize")) ?? 48,
    query: params.get("q") ?? undefined,
    genre: params.get("genre") ?? undefined,
    year: numberParam(params.get("year")),
    decade: numberParam(params.get("decade")),
    category,
    language: params.get("language"),
    minRating: numberParam(params.get("minRating")),
    sort,
  });

  void ensureLiveCatalogs();
  const facets = mergeFacets(response.facets, getLiveFacets(kind ?? "all"));

  return NextResponse.json(
    {
      ...response,
      facets,
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
