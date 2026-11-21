import { NextRequest, NextResponse } from "next/server";
import { mediaUrlForPath } from "@/lib/server/config";
import { extensionOf } from "@/lib/media/normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Convert SRT timestamps and structure to WebVTT. */
function srtToVtt(input: string) {
  return `WEBVTT\n\n${input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .trim()}`;
}

/** Best-effort ASS/SSA to WebVTT conversion (styling is intentionally dropped). */
function assToVtt(input: string) {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  let inEvents = false;
  let format: string[] = [];
  const cues: string[] = [];

  const convertTime = (value: string) => {
    const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/);
    if (!match) return null;
    const [, h, m, s, cs] = match;
    return `${h.padStart(2, "0")}:${m}:${s}.${cs.padEnd(3, "0").slice(0, 3)}`;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[events\]$/i.test(trimmed)) {
      inEvents = true;
      continue;
    }
    if (/^\[/.test(trimmed)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(trimmed)) {
      format = trimmed
        .slice(trimmed.indexOf(":") + 1)
        .split(",")
        .map((part) => part.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(trimmed)) continue;
    const payload = trimmed.slice(trimmed.indexOf(":") + 1);
    const parts = payload.split(",");
    if (!format.length || parts.length < format.length) continue;
    const values: Record<string, string> = {};
    format.forEach((name, index) => {
      values[name] = index === format.length - 1 ? parts.slice(index).join(",") : parts[index];
    });
    const start = convertTime(values.start ?? "");
    const end = convertTime(values.end ?? "");
    if (!start || !end) continue;
    const text = (values.text ?? "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\N/gi, "\n")
      .replace(/\\h/gi, " ")
      .trim();
    if (!text) continue;
    cues.push(`${start} --> ${end}\n${text}`);
    if (cues.length >= 6000) break;
  }

  return `WEBVTT\n\n${cues.join("\n\n")}`;
}

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath || relativePath.split("/").some((segment) => segment === ".." || segment === ".")) {
    return NextResponse.json({ error: "A valid subtitle path is required" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(mediaUrlForPath(relativePath), {
      headers: { "User-Agent": "LocalStream/1.0 (+subtitle proxy)", Accept: "*/*" },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Could not reach the subtitle on the media server", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: `Subtitle request returned HTTP ${upstream.status}` }, { status: 404 });
  }

  const format = extensionOf(relativePath);
  const raw = await upstream.text();
  let body: string;
  if (format === "vtt") body = raw;
  else if (format === "ass" || format === "ssa") body = assToVtt(raw);
  else body = srtToVtt(raw);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
