import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/server/db";
import { mediaUrlForPath } from "@/lib/server/config";
import {
  getLiveTitleAvailability,
  isLiveEpisodeId,
  isLiveTitleId,
  resolveLiveEpisode,
  resolveLiveTitle,
} from "@/lib/server/live-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PlaylistEntry {
  path: string;
  label: string;
}

interface Playlist {
  name: string;
  entries: PlaylistEntry[];
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "localstream";
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function code(season: number, episode: number) {
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

function encodePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function isSafePath(path: string) {
  return !path.split("/").some((segment) => segment === ".." || segment === ".");
}

async function resolvePlaylist(params: URLSearchParams): Promise<Playlist | null> {
  const db = getDb();
  const episodeId = params.get("episodeId");
  const titleId = params.get("titleId");
  const directPath = params.get("path");
  const suppliedTitle = params.get("title")?.trim();
  const scope = params.get("scope");
  const seasonParam = Number.parseInt(params.get("season") ?? "", 10);

  if (episodeId) {
    if (isLiveEpisodeId(episodeId)) {
      const episode = await resolveLiveEpisode(episodeId);
      if (!episode) return null;
      const label = `${episode.title} ${code(episode.season, episode.episode)}`;
      return { name: label, entries: [{ path: episode.path, label }] };
    }
    const row = db
      .prepare(
        `SELECT e.path, e.season, e.episode, t.title FROM episodes e
         JOIN titles t ON t.id = e.title_id WHERE e.id = ?`,
      )
      .get(episodeId) as { path: string; season: number; episode: number; title: string } | undefined;
    if (!row) return null;
    const label = `${row.title} ${code(row.season, row.episode)}`;
    return { name: label, entries: [{ path: row.path, label }] };
  }

  if (titleId) {
    if (isLiveTitleId(titleId)) {
      const title = await resolveLiveTitle(titleId);
      if (!title) return null;

      if (scope === "season" || scope === "series") {
        const bySeason = scope === "season" && Number.isFinite(seasonParam);
        const episodes = bySeason
          ? title.episodes.filter((episode) => episode.season === seasonParam)
          : title.episodes;
        if (episodes.length) {
          return {
            name: bySeason ? `${title.title} Season ${seasonParam}` : title.title,
            entries: episodes.map((episode) => ({
              path: episode.path,
              label: `${title.title} ${code(episode.season, episode.episode)}`,
            })),
          };
        }
      }

      if (title.filePath) return { name: title.title, entries: [{ path: title.filePath, label: title.title }] };
      const first = title.episodes[0];
      if (!first) return null;
      const label = `${title.title} ${code(first.season, first.episode)}`;
      return { name: label, entries: [{ path: first.path, label }] };
    }

    const title = db
      .prepare("SELECT id, kind, title, file_path FROM titles WHERE id = ?")
      .get(titleId) as { id: string; kind: string; title: string; file_path: string } | undefined;
    if (!title) return null;

    if (scope === "season" || scope === "series") {
      const bySeason = scope === "season" && Number.isFinite(seasonParam);
      const rows = (
        bySeason
          ? db
              .prepare("SELECT path, season, episode FROM episodes WHERE title_id = ? AND season = ? ORDER BY season, episode")
              .all(titleId, seasonParam)
          : db
              .prepare("SELECT path, season, episode FROM episodes WHERE title_id = ? ORDER BY season, episode")
              .all(titleId)
      ) as { path: string; season: number; episode: number }[];
      if (!rows.length) return null;
      return {
        name: bySeason ? `${title.title} Season ${seasonParam}` : title.title,
        entries: rows.map((row) => ({
          path: row.path,
          label: `${title.title} ${code(row.season, row.episode)}`,
        })),
      };
    }

    if (title.file_path) return { name: title.title, entries: [{ path: title.file_path, label: title.title }] };
    const episode = db
      .prepare("SELECT path, season, episode FROM episodes WHERE title_id = ? ORDER BY season, episode LIMIT 1")
      .get(titleId) as { path: string; season: number; episode: number } | undefined;
    if (!episode) return null;
    const label = `${title.title} ${code(episode.season, episode.episode)}`;
    return { name: label, entries: [{ path: episode.path, label }] };
  }

  if (directPath) {
    if (!isSafePath(directPath)) return null;
    const label = suppliedTitle || directPath.split("/").pop() || "LocalStream";
    return { name: label, entries: [{ path: directPath, label }] };
  }

  return null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const playlist = await resolvePlaylist(params);
  if (!playlist) {
    const titleId = params.get("titleId");
    if (titleId && isLiveTitleId(titleId) && getLiveTitleAvailability(titleId) === "offline") {
      return NextResponse.json(
        {
          error:
            "The media server for this title is offline. Reconnect to the ISP network, then reload this playlist.",
        },
        { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
      );
    }
    return NextResponse.json(
      {
        error:
          "Pass titleId, episodeId or path. LocalStream needs a known media file so VLC can stream it directly.",
      },
      { status: 400 },
    );
  }

  // direct=1 points VLC straight at the media server; otherwise it goes through LocalStream.
  const direct = params.get("direct") === "1";
  const origin = request.nextUrl.origin;
  const urlFor = (path: string) => (direct ? mediaUrlForPath(path) : `${origin}/api/stream/${encodePath(path)}`);

  const lines = ["#EXTM3U", `#PLAYLIST:${oneLine(playlist.name)}`];
  for (const entry of playlist.entries) {
    lines.push(`#EXTINF:-1,${oneLine(entry.label)}`, urlFor(entry.path));
  }
  const body = `${lines.join("\n")}\n`;

  const disposition = params.get("download") === "1" ? "attachment" : "inline";
  const headers: Record<string, string> = {
    "Content-Type": "audio/x-mpegurl; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${disposition}; filename="${safeFileName(playlist.name)}.m3u"`,
  };

  return new NextResponse(body, { status: 200, headers });
}
