# LocalStream

A Netflix-style personal cinema for an ISP-hosted h5ai media server. LocalStream scans the real library over HTTP, indexes it in SQLite, and streams every file through a Range-aware same-origin proxy — direct play, no downloads, no transcode.

## What it does

- Scans MP4, MKV, AVI, MOV, WMV, WEBM, M4V and TS files from the h5ai tree into a persistent SQLite index.
- Fuzzy, typo-tolerant search (`Avngers Endgame` → *Avengers-Endgame*) with did-you-mean suggestions, plus filters for year, genre, language, category, actor and director.
- Movies, TV series and multi-part files, with automatic episode/season detection.
- Cinematic hero carousel, continue-watching and recommendation rails, browse grids, recently added, genres/collections, infinite scroll and skeletons.
- Resume playback, seek, speed, picture-in-picture, subtitles, audio tracks, keyboard shortcuts, next-episode autoplay, watchlist and watch history.
- Embedded (in-file) subtitle support: text tracks are extracted to WebVTT on demand and cached; bitmap tracks are detected and redirected to VLC.
- Optional TMDB artwork/metadata when an API key is configured; local folder artwork otherwise.
- Responsive layout with a mobile bottom nav, glass sheets, mega menu, progress-ring back-to-top and reduced-motion support.

## Requirements

- Node.js 20 or newer
- Access to the media server (default `http://172.16.50.7/DHAKA-FLIX-7/`)
- VLC (optional, for files browsers cannot decode)

## Quick start

```powershell
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Open <http://localhost:3000>. The first scan starts automatically. For a production build:

```powershell
npm run build
npm run start
```

## Configuration

`.env.local` is read by both the Next.js app and the CLI scripts.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEDIA_SERVER_URL` | `http://172.16.50.7/DHAKA-FLIX-7/` | Root of the h5ai index |
| `DATABASE_PATH` | `data/localstream.db` | SQLite index location |
| `SCAN_ON_START` | `true` | Start a scan when the server boots |
| `SCAN_INTERVAL_MINUTES` | `45` | Background rescan interval (minimum 5) |
| `SCAN_CONCURRENCY` | `8` | Parallel directory requests (1–16) |
| `SCAN_REQUEST_TIMEOUT_MS` | `20000` | Per-request timeout |
| `TMDB_API_KEY` | empty | Enables TMDB metadata and posters |
| `TMDB_LANGUAGE` | `en-US` | TMDB language |
| `TMDB_AUTO_ENRICH` | `true` | Match new titles against TMDB automatically |
| `VLC_COMPANION_URL` | `http://127.0.0.1:8642` | Companion URL shown in server info |
| `VLC_COMPANION_HOST` | `127.0.0.1` | Companion bind address (keep loopback) |
| `VLC_COMPANION_PORT` | `8642` | Companion port |
| `VLC_PATH` | auto-detect | VLC executable for the companion |
| `FFMPEG_PATH` | bundled | Override the ffmpeg binary used for subtitle extraction |
| `FFPROBE_PATH` | bundled | Override the ffprobe binary used to inspect tracks |
| `SUBTITLE_CACHE_DIR` | `data/subtitles` | Where extracted WebVTT tracks are cached |
| `NEXT_PUBLIC_APP_NAME` | `LocalStream` | Display name |

## Scripts

| Command | Action |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm run start` | Production build and server |
| `npm run scan` | Incremental scan |
| `npm run scan:full` | Full rescan; prunes titles only if the walk completes without errors |
| `npm run verify` | Prints index counts and sanity checks |
| `npm run vlc` | Starts the loopback VLC companion |

A scan lock (`data/.scan.lock`) keeps the dev server and a CLI scan from writing at the same time. The index stays readable while scanning.

## Playback and VLC

The browser player uses `/api/stream/...`, which forwards HTTP Range requests, preserves `206 Partial Content`, corrects generic MIME types and adds CORS. Seeking is immediate and the browser only buffers what it needs.

Browsers cannot decode every codec. MKV containers, HEVC video and AC3 audio commonly fail; for those, use **Open in VLC**:

- With the companion running (`npm run vlc`), the button launches VLC directly with the same local stream URL.
- Without the companion, or without VLC installed, it downloads a small `.m3u` playlist instead. The playlist points at the stream — it does not download the video.
- You can also copy the stream link and use **Media → Open Network Stream** in VLC.

The companion binds to loopback by default and only accepts private/local `/api/stream/` URLs, so it cannot be used as an open launcher by other machines.

## Embedded subtitles

`npm install` bundles `ffmpeg-static` and `@ffprobe-installer/ffprobe`, so no system ffmpeg is required. Set `FFMPEG_PATH` / `FFPROBE_PATH` if you prefer a system build.

1. The player asks `/api/subtitles/tracks?path=…` for the subtitle streams inside the current file.
2. Selecting a text track calls `/api/subtitles/embedded?path=…&track=…&size=…`. The first request starts an ffmpeg extraction and answers `202` while the player polls with the job's progress.
3. When extraction finishes, the API returns WebVTT (`200 text/vtt`), the player activates it as a Blob text track and the result stays cached in `SUBTITLE_CACHE_DIR`.
4. The cache stores a sidecar with the source file size, so a replaced file at the same path is re-extracted instead of serving stale subtitles. Jobs run two at a time with a 30-minute timeout; failed or stale jobs are dropped after 15 minutes.

Supported text codecs include SRT/SubRip, ASS/SSA, `mov_text` (MP4), WebVTT, TTML, SAMI, MicroDVD and similar. Bitmap formats — PGS (Blu-ray), VobSub/DVD, DVB, XSUB and Teletext — cannot be rendered by browsers; the menu marks them **VLC** and explains that the file should be opened in VLC for those tracks. One embedded track can be active at a time, alongside any local subtitle files you load in the player.

## Notes and limitations

- No transcoding: files play in their native format. Install VLC for unsupported codecs.
- Skip-intro is not implemented because the library exposes no chapter/intro metadata; it is better absent than faked.
- Embedded text subtitles are extracted on demand (the first play of a track can take a while on large files); later plays use the cache. Bitmap subtitles are VLC-only.
- The library has no subtitle sidecar files today, so the player's **Load subtitle file** option is there for files you supply yourself.
- Playback progress and the watchlist live in the browser (`localStorage`); nothing is uploaded.
- TMDB enrichment is optional and degrades gracefully to local artwork and folder-derived metadata.
