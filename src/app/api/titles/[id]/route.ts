import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, getRelatedTitles, getTitleDetail } from "@/lib/server/queries";
import { getLiveRelated, isLiveTitleId, resolveLiveTitle } from "@/lib/server/live-catalog";
import { peekPathReachable } from "@/lib/server/reachability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const titleId = decodeURIComponent(id);

  if (isLiveTitleId(titleId)) {
    const title = await resolveLiveTitle(titleId);
    if (!title) {
      return NextResponse.json({ error: "Title not found" }, { status: 404 });
    }
    const related = getLiveRelated(titleId, 18);
    return NextResponse.json(
      { title, related, recommendations: related },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const stored = getTitleDetail(titleId);
  if (!stored) {
    return NextResponse.json({ error: "Title not found" }, { status: 404 });
  }

  // Indexed titles are just as unplayable as live ones when their mount is
  // offline. Reuse the cached reachability probe so this stays fast.
  const probePath = stored.filePath || stored.folderPath;
  const reachable = probePath ? peekPathReachable(probePath) : null;
  const title = reachable === false ? { ...stored, availability: "offline" as const } : stored;

  const seedIds = [title.id, ...getRecommendations([title.id], 6).map((item) => item.id)];
  const related = getRelatedTitles(title, 18);
  const recommendations = getRecommendations(seedIds, 18);

  return NextResponse.json(
    { title, related, recommendations },
    { headers: { "Cache-Control": "no-store" } },
  );
}
