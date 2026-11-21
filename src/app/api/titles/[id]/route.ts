import { NextRequest, NextResponse } from "next/server";
import { getRecommendations, getRelatedTitles, getTitleDetail } from "@/lib/server/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const title = getTitleDetail(decodeURIComponent(id));
  if (!title) {
    return NextResponse.json({ error: "Title not found" }, { status: 404 });
  }

  const seedIds = [title.id, ...getRecommendations([title.id], 6).map((item) => item.id)];
  const related = getRelatedTitles(title, 18);
  const recommendations = getRecommendations(seedIds, 18);

  return NextResponse.json(
    { title, related, recommendations },
    { headers: { "Cache-Control": "no-store" } },
  );
}
