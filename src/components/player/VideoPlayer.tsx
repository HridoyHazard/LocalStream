'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AudioLines,
  FileUp,
  Minus,
  Plus,
  Captions,
  CaptionsOff,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gauge,
  Keyboard,
  ListVideo,
  LoaderCircle,
  Maximize,
  Minimize,
  MonitorPlay,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  SkipForward,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  EmbeddedSubtitleTrack,
  Episode,
  SubtitleExtractionStatus,
  TitleDetail,
  TitleDetailResponse,
} from '@/lib/media/types';
import { useApi } from '@/lib/use-api';
import {
  detailsHref,
  episodeCode,
  formatBytes,
  formatRuntime,
  streamUrl,
  subtitleUrl,
  vlcUrl,
  watchHref,
} from '@/lib/media-links';
import { getPosterPalette, paletteStyle } from '@/lib/design/palette';
import { getProgress, removeProgress, saveProgress, type ProgressRecord } from '@/lib/watch-progress';
import { tryOpenInVlc } from '@/lib/vlc-companion';
import { cn, formatTime } from '@/lib/utils';
import { decodeSubtitleBytes, subtitleTextToVtt } from '@/lib/media/subtitle-convert';
import Logo from '@/components/ui/Logo';

interface VideoPlayerProps {
  titleId: string;
  episodeId?: string | null;
  restart?: boolean;
}

interface AudioTrackLike {
  label?: string;
  language?: string;
  enabled: boolean;
}

interface AudioTrackListLike {
  length: number;
  [index: number]: AudioTrackLike;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** A subtitle file the viewer loaded from their own device. */
interface LocalSubtitle {
  id: string;
  label: string;
  url: string;
  format: string;
}

interface EmbeddedTracksResponse {
  available: boolean;
  error: string | null;
  tracks: EmbeddedSubtitleTrack[];
}

interface ActiveEmbeddedSubtitle {
  track: EmbeddedSubtitleTrack;
  url: string;
}

interface EmbeddedJobState {
  trackId: string;
  state: SubtitleExtractionStatus['state'];
  progress: number | null;
}

const shortcuts = [
  { keys: 'Space / K', label: 'Play or pause' },
  { keys: '← / →', label: 'Seek 10 seconds' },
  { keys: 'J / L', label: 'Seek 10 seconds' },
  { keys: '↑ / ↓', label: 'Volume' },
  { keys: '0 – 9', label: 'Jump through the file' },
  { keys: 'F', label: 'Fullscreen' },
  { keys: 'M', label: 'Mute' },
  { keys: 'C', label: 'Subtitles on / off' },
  { keys: 'P', label: 'Picture in picture' },
  { keys: 'N', label: 'Next episode' },
  { keys: 'Esc', label: 'Close menus' },
];

function sortEpisodes(episodes: Episode[]) {
  return [...episodes].sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function mediaErrorMessage(video: HTMLVideoElement) {
  const code = video.error?.code;
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was interrupted before the stream could start. Try again, or open the file in VLC.';
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The local media server stopped responding while streaming. Check the connection and try again.';
    case MediaError.MEDIA_ERR_DECODE:
      return 'The browser could not decode this file. It may use HEVC, AC3 or another codec that browsers do not support — VLC can play it directly.';
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This file format or codec is not supported by your browser (common for MKV, HEVC and AC3). Open it in VLC to stream the original file.';
    default:
      return 'The media server did not return a playable file. Check that the file still exists and the server is online.';
  }
}

export default function VideoPlayer({ titleId, episodeId, restart = false }: VideoPlayerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const resumedForRef = useRef<string | null>(null);
  const saveTickRef = useRef(0);

  const { data, error: loadError, loading: loadingTitle, refresh } = useApi<TitleDetailResponse>(
    `/api/titles/${encodeURIComponent(titleId)}`,
  );
  const title: TitleDetail | null = data?.title ?? null;

  const [initialRecord, setInitialRecord] = useState<ProgressRecord | null | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [streamLoading, setStreamLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<'subtitles' | 'speed' | 'audio' | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [subtitleIndex, setSubtitleIndex] = useState(-1);
  const [localSubs, setLocalSubs] = useState<LocalSubtitle[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const [subtitleNotice, setSubtitleNotice] = useState<string | null>(null);
  const [embeddedTracks, setEmbeddedTracks] = useState<EmbeddedSubtitleTrack[]>([]);
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const [embeddedError, setEmbeddedError] = useState<string | null>(null);
  const [embeddedSub, setEmbeddedSub] = useState<ActiveEmbeddedSubtitle | null>(null);
  const [embeddedJob, setEmbeddedJob] = useState<EmbeddedJobState | null>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);
  const subtitleOffsetsRef = useRef<Record<number, number>>({});
  const localSubsRef = useRef<LocalSubtitle[]>([]);
  const embeddedSubRef = useRef<ActiveEmbeddedSubtitle | null>(null);
  const embeddedTaskRef = useRef(0);
  const embeddedRequestRef = useRef<string | null>(null);
  const [audioIndex, setAudioIndex] = useState(0);
  const [audioTracks, setAudioTracks] = useState<AudioTrackLike[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPip, setIsPip] = useState(false);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [episodeMenuOpen, setEpisodeMenuOpen] = useState(false);
  const [canPip, setCanPip] = useState(false);
  const [vlcOpening, setVlcOpening] = useState(false);
  const [vlcHint, setVlcHint] = useState<string | null>(null);
  const copyTimer = useRef<number | null>(null);
  const vlcTimer = useRef<number | null>(null);
  const menuOpenRef = useRef(false);

  const sortedEpisodes = useMemo(() => (title ? sortEpisodes(title.episodes) : []), [title]);

  // Read the locally stored resume point once, so ongoing progress updates do
  // not suddenly move the player to a different episode mid-playback.
  useEffect(() => {
    if (restart) removeProgress(titleId);
    setInitialRecord(getProgress(titleId) ?? null);
  }, [restart, titleId]);

  const requestedEpisodeId = episodeId ?? (initialRecord?.completed ? null : initialRecord?.episodeId ?? null);
  const activeEpisode = useMemo(() => {
    if (!title || title.kind !== 'series') return null;
    return sortedEpisodes.find((episode) => episode.id === requestedEpisodeId) ?? sortedEpisodes[0] ?? null;
  }, [requestedEpisodeId, sortedEpisodes, title]);

  const activeIndex = activeEpisode ? sortedEpisodes.findIndex((episode) => episode.id === activeEpisode.id) : -1;
  const nextEpisode = activeIndex >= 0 ? sortedEpisodes[activeIndex + 1] ?? null : null;

  const sourcePath = activeEpisode?.path ?? title?.filePath ?? '';
  const sourceExtension = activeEpisode?.extension ?? title?.extension ?? '';
  const sourceSize = activeEpisode?.size ?? (title?.kind === 'movie' ? title.totalSize : 0);
  const subtitles = activeEpisode?.subtitles ?? title?.subtitles ?? [];
  const localSubtitleBase = subtitles.length + (embeddedSub ? 1 : 0);
  const totalTracks = subtitles.length + (embeddedSub ? 1 : 0) + localSubs.length;
  const availableSubtitleCount = subtitles.length + embeddedTracks.length + localSubs.length;
  const displayTitle = title?.title ?? 'LocalStream';
  const episodeLabel = activeEpisode ? episodeCode(activeEpisode.season, activeEpisode.episode) : null;
  const palette = useMemo(
    () => getPosterPalette(`${displayTitle}-${title?.year ?? ''}`),
    [displayTitle, title?.year],
  );
  const ready = Boolean(title) && initialRecord !== undefined;

  const resumeTime = useMemo(() => {
    if (!title || !initialRecord || restart || initialRecord.completed) return 0;
    if (title.kind === 'series' && initialRecord.episodeId && activeEpisode?.id !== initialRecord.episodeId) return 0;
    return initialRecord.currentTime >= 5 ? initialRecord.currentTime : 0;
  }, [activeEpisode?.id, initialRecord, restart, title]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused && !menuOpenRef.current) {
        setControlsVisible(false);
        setMenu(null);
        setShortcutsOpen(false);
        setEpisodeMenuOpen(false);
      }
    }, 3400);
  }, []);

  useEffect(() => {
    menuOpenRef.current = menu !== null || shortcutsOpen || episodeMenuOpen;
  }, [episodeMenuOpen, menu, shortcutsOpen]);

  // A subtitle warning should not linger over the picture forever once the
  // subtitle menu has been closed.
  useEffect(() => {
    if (menu !== null || !subtitleNotice) return;
    const timer = window.setTimeout(() => setSubtitleNotice(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [menu, subtitleNotice]);

  useEffect(() => {
    revealControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [revealControls]);

  useEffect(() => {
    setCanPip(Boolean(document.pictureInPictureEnabled));
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnter = () => setIsPip(true);
    const onLeave = () => setIsPip(false);
    video.addEventListener('enterpictureinpicture', onEnter);
    video.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      video.removeEventListener('enterpictureinpicture', onEnter);
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      if (vlcTimer.current) window.clearTimeout(vlcTimer.current);
    };
  }, []);

  // Reset per-source UI state when switching episodes or titles.
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setStreamLoading(true);
    setBuffering(false);
    setError(null);
    setResumedAt(null);
    setNextCountdown(null);
    setFinished(false);
    setSubtitleIndex(-1);
    localSubsRef.current.forEach((sub) => URL.revokeObjectURL(sub.url));
    localSubsRef.current = [];
    setLocalSubs([]);
    embeddedTaskRef.current += 1;
    embeddedRequestRef.current = null;
    if (embeddedSubRef.current) URL.revokeObjectURL(embeddedSubRef.current.url);
    embeddedSubRef.current = null;
    setEmbeddedSub(null);
    setEmbeddedTracks([]);
    setEmbeddedError(null);
    setEmbeddedJob(null);
    setEmbeddedLoading(Boolean(sourcePath));
    setSubtitleOffset(0);
    subtitleOffsetsRef.current = {};
    setSubtitleNotice(null);
    setAudioTracks([]);
    setAudioIndex(0);

    const video = videoRef.current;
    if (!video) return;
    try {
      const storedVolume = Number.parseFloat(window.localStorage.getItem('localstream.volume') ?? '');
      if (Number.isFinite(storedVolume)) {
        video.volume = Math.max(0, Math.min(1, storedVolume));
        video.muted = storedVolume === 0;
        setVolume(video.volume);
        setMuted(video.muted);
      }
      const storedRate = Number.parseFloat(window.localStorage.getItem('localstream.rate') ?? '');
      if (SPEEDS.includes(storedRate as (typeof SPEEDS)[number])) {
        video.playbackRate = storedRate;
        setRate(storedRate);
      }
    } catch {
      // Storage can be unavailable; defaults are fine.
    }
  }, [sourcePath]);

  // Probe the container for muxed subtitle streams. This is a header-only
  // ffprobe call, so it is cheap enough to run whenever the source changes.
  useEffect(() => {
    if (!sourcePath) {
      setEmbeddedLoading(false);
      return;
    }
    let cancelled = false;
    setEmbeddedLoading(true);
    setEmbeddedError(null);
    const params = new URLSearchParams({ path: sourcePath });
    fetch(`/api/subtitles/tracks?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Subtitle probe returned HTTP ${response.status}`);
        return (await response.json()) as EmbeddedTracksResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setEmbeddedTracks(Array.isArray(data.tracks) ? data.tracks : []);
        if (!data.available) {
          setEmbeddedError(data.error || 'Embedded subtitle extraction is unavailable on this server.');
        } else if (data.error) {
          setEmbeddedError(data.error);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setEmbeddedTracks([]);
        setEmbeddedError('This file could not be checked for embedded subtitles.');
      })
      .finally(() => {
        if (!cancelled) setEmbeddedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourcePath]);

  const writeProgress = useCallback(
    (video: HTMLVideoElement, completed = false) => {
      if (!title || !sourcePath) return;
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      saveProgress({
        titleId: title.id,
        title: title.title,
        kind: title.kind,
        year: title.year,
        posterUrl: title.posterUrl,
        backdropUrl: title.backdropUrl,
        path: sourcePath,
        extension: sourceExtension,
        episodeId: activeEpisode?.id ?? null,
        season: activeEpisode?.season ?? null,
        episode: activeEpisode?.episode ?? null,
        currentTime: completed ? Math.max(total, video.currentTime) : video.currentTime,
        duration: total,
        completed,
      });
    },
    [activeEpisode, sourceExtension, sourcePath, title],
  );

  const saveCurrent = useCallback(() => {
    const video = videoRef.current;
    if (!video || !title || !sourcePath) return;
    if (!Number.isFinite(video.currentTime) || video.currentTime < 3) return;
    writeProgress(video);
  }, [sourcePath, title, writeProgress]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (video && !video.paused && !video.ended) saveCurrent();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [saveCurrent]);

  useEffect(() => {
    const onHide = () => saveCurrent();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      saveCurrent();
    };
  }, [saveCurrent]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        // Autoplay policies can block unmuted playback; the center play button
        // remains visible for a user gesture.
        setControlsVisible(true);
      });
    } else {
      video.pause();
    }
    revealControls();
  }, [revealControls]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const total = Number.isFinite(video.duration) ? video.duration : seconds;
    video.currentTime = Math.max(0, Math.min(total, seconds));
    setCurrentTime(video.currentTime);
    setFinished(false);
    setNextCountdown(null);
    revealControls();
  }, [revealControls]);

  const seekBy = useCallback(
    (amount: number) => {
      const video = videoRef.current;
      if (!video) return;
      seekTo(video.currentTime + amount);
    },
    [seekTo],
  );

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current;
    const video = videoRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (shell?.requestFullscreen) {
        await shell.requestFullscreen();
        return;
      }
      const legacy = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      legacy?.webkitEnterFullscreen?.();
    } catch {
      // Fullscreen can be restricted; native controls stay usable.
    }
  }, []);

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Ignore unsupported PiP implementations.
    }
  }, []);

  const changeRate = useCallback((value: number) => {
    setRate(value);
    const video = videoRef.current;
    if (video) video.playbackRate = value;
    try {
      window.localStorage.setItem('localstream.rate', String(value));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }, []);

  const applySubtitleMode = useCallback((index: number) => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      tracks[i].mode = i === index ? 'showing' : 'disabled';
    }
  }, []);

  useEffect(() => {
    applySubtitleMode(subtitleIndex);
  }, [applySubtitleMode, sourcePath, subtitleIndex]);

  const changeSubtitle = useCallback(
    (index: number) => {
      // Choosing any other track (or Off) abandons a pending extraction in the
      // UI. The server-side job keeps running so its result is cached.
      embeddedTaskRef.current += 1;
      embeddedRequestRef.current = null;
      setEmbeddedJob(null);
      setSubtitleIndex(index);
      setSubtitleOffset(subtitleOffsetsRef.current[index] ?? 0);
      setSubtitleNotice(null);
      applySubtitleMode(index);
      setMenu(null);
    },
    [applySubtitleMode],
  );

  const activateEmbeddedSubtitle = useCallback(
    (track: EmbeddedSubtitleTrack, vtt: string) => {
      if (embeddedSubRef.current) URL.revokeObjectURL(embeddedSubRef.current.url);
      const active: ActiveEmbeddedSubtitle = {
        track,
        url: URL.createObjectURL(new Blob([vtt], { type: 'text/vtt;charset=utf-8' })),
      };
      embeddedSubRef.current = active;
      embeddedRequestRef.current = null;
      setEmbeddedSub(active);
      setEmbeddedJob(null);
      setSubtitleIndex(subtitles.length);
      setSubtitleOffset(0);
      setSubtitleNotice(null);
      setMenu(null);
    },
    [subtitles.length],
  );

  /**
   * Extracts an embedded track on the server the first time it is selected.
   * ffmpeg has to walk the container to find its subtitle packets, so the API
   * answers 202 and this loop polls until the cached VTT is ready.
   */
  const selectEmbeddedSubtitle = useCallback(
    async (track: EmbeddedSubtitleTrack) => {
      if (!track.supported) {
        setSubtitleNotice(track.reason ?? 'This subtitle track cannot be displayed in a browser.');
        return;
      }
      if (embeddedSubRef.current?.track.id === track.id) {
        changeSubtitle(subtitles.length);
        return;
      }
      if (embeddedRequestRef.current === track.id) return;

      embeddedTaskRef.current += 1;
      const task = embeddedTaskRef.current;
      embeddedRequestRef.current = track.id;
      setEmbeddedJob({ trackId: track.id, state: 'queued', progress: null });
      setSubtitleNotice(null);

      const params = new URLSearchParams({ path: sourcePath, track: String(track.streamIndex) });
      if (sourceSize > 0) params.set('size', String(sourceSize));
      const endpoint = `/api/subtitles/embedded?${params.toString()}`;

      try {
        for (let attempt = 0; attempt < 1600; attempt += 1) {
          if (embeddedTaskRef.current !== task) return;
          const response = await fetch(endpoint, { cache: 'no-store' });
          if (embeddedTaskRef.current !== task) return;
          const contentType = response.headers.get('content-type') ?? '';

          if (response.ok && contentType.includes('text/vtt')) {
            const vtt = await response.text();
            if (embeddedTaskRef.current !== task) return;
            if (!vtt.includes('-->')) throw new Error('This subtitle track contains no text cues.');
            activateEmbeddedSubtitle(track, vtt);
            return;
          }

          let data: Partial<SubtitleExtractionStatus> & { error?: string | null } = {};
          try {
            data = (await response.json()) as typeof data;
          } catch {
            // A non-JSON error response is handled below.
          }
          if (embeddedTaskRef.current !== task) return;
          if (data.state === 'error') {
            throw new Error(data.error || 'This subtitle track could not be prepared.');
          }
          if (!response.ok) {
            throw new Error(data.error || `Subtitle extraction returned HTTP ${response.status}.`);
          }

          setEmbeddedJob({
            trackId: track.id,
            state: data.state ?? 'running',
            progress: data.progress ?? null,
          });
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        throw new Error('Subtitle preparation took too long. Try again.');
      } catch (error) {
        if (embeddedTaskRef.current !== task) return;
        embeddedRequestRef.current = null;
        setEmbeddedJob(null);
        setSubtitleNotice(error instanceof Error ? error.message : 'Could not prepare embedded subtitles.');
      }
    },
    [activateEmbeddedSubtitle, changeSubtitle, sourcePath, sourceSize, subtitles.length],
  );

  /** Moves every cue of the active track; positive values show subtitles later. */
  const shiftSubtitles = useCallback(
    (delta: number) => {
      const video = videoRef.current;
      if (!video || subtitleIndex < 0) return;
      const cues = video.textTracks[subtitleIndex]?.cues;
      if (!cues || cues.length === 0) {
        setSubtitleNotice('Subtitles are still loading. Try again in a moment.');
        return;
      }
      for (let i = 0; i < cues.length; i += 1) {
        cues[i].startTime = Math.max(0, cues[i].startTime + delta);
        cues[i].endTime = Math.max(0, cues[i].endTime + delta);
      }
      const next = Math.round(((subtitleOffsetsRef.current[subtitleIndex] ?? 0) + delta) * 10) / 10;
      subtitleOffsetsRef.current[subtitleIndex] = next;
      setSubtitleOffset(next);
      setSubtitleNotice(null);
    },
    [subtitleIndex],
  );

  /** Converts a subtitle file from the viewer's device to WebVTT and turns it on. */
  const loadSubtitleFile = useCallback(
    async (file: File) => {
      try {
        const text = decodeSubtitleBytes(await file.arrayBuffer());
        const format = (file.name.split('.').pop() ?? '').toLowerCase();
        const vtt = subtitleTextToVtt(text, format);
        const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
        const sub: LocalSubtitle = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          label: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Loaded subtitles',
          url,
          format,
        };
        const next = [...localSubsRef.current, sub];
        localSubsRef.current = next;
        setLocalSubs(next);
        setSubtitleNotice(null);
        setSubtitleIndex(localSubtitleBase + next.length - 1);
        setSubtitleOffset(0);
        setMenu(null);
      } catch (error) {
        setSubtitleNotice(error instanceof Error ? error.message : 'Could not read that subtitle file.');
      }
    },
    [localSubtitleBase],
  );

  useEffect(() => {
    return () => {
      localSubsRef.current.forEach((sub) => URL.revokeObjectURL(sub.url));
      if (embeddedSubRef.current) URL.revokeObjectURL(embeddedSubRef.current.url);
      embeddedTaskRef.current += 1;
    };
  }, []);

  const changeAudio = useCallback((index: number) => {
    const video = videoRef.current as (HTMLVideoElement & { audioTracks?: AudioTrackListLike }) | null;
    const list = video?.audioTracks;
    if (!video || !list) return;
    for (let i = 0; i < list.length; i += 1) list[i].enabled = i === index;
    setAudioIndex(index);
    setMenu(null);
  }, []);

  const goToEpisode = useCallback(
    (episode: Episode) => {
      saveCurrent();
      setNextCountdown(null);
      setFinished(false);
      router.replace(watchHref(titleId, { episode: episode.id }));
    },
    [router, saveCurrent, titleId],
  );

  useEffect(() => {
    if (nextCountdown === null) return;
    if (nextCountdown <= 0) {
      if (nextEpisode) goToEpisode(nextEpisode);
      return;
    }
    const timer = window.setTimeout(() => setNextCountdown((value) => (value ?? 1) - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [goToEpisode, nextCountdown, nextEpisode]);

  useEffect(() => {
    if (resumedAt === null) return;
    const timer = window.setTimeout(() => setResumedAt(null), 8000);
    return () => window.clearTimeout(timer);
  }, [resumedAt]);

  const retry = useCallback(() => {
    setError(null);
    setStreamLoading(true);
    setBuffering(true);
    setFinished(false);
    setNextCountdown(null);
    const video = videoRef.current;
    if (!video) return;
    video.load();
    void video.play().catch(() => undefined);
  }, []);

  const copyStreamLink = useCallback(async () => {
    if (!sourcePath) return;
    const value = `${window.location.origin}${streamUrl(sourcePath)}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(value);
      copied = true;
    } catch {
      copied = false;
    }
    setCopyState(copied ? 'copied' : 'failed');
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyState('idle'), 2400);
  }, [sourcePath]);

  const openInVlc = useCallback(async () => {
    if (!sourcePath || !title) return;
    setVlcOpening(true);
    setVlcHint(null);
    if (vlcTimer.current) window.clearTimeout(vlcTimer.current);
    const absolute = `${window.location.origin}${streamUrl(sourcePath)}`;
    const result = await tryOpenInVlc(absolute, `${displayTitle}${episodeLabel ? ` ${episodeLabel}` : ''}`);
    setVlcOpening(false);
    if (result === 'started') {
      setVlcHint('VLC is opening the stream from your local server.');
    } else {
      setVlcHint(
        result === 'vlc-missing'
          ? 'The VLC companion is running, but VLC was not found on this computer — downloading the playlist instead. Install VLC or set VLC_PATH.'
          : 'VLC companion not detected — downloading the playlist instead. Run “npm run vlc” for one-click playback.',
      );
      window.location.href = vlcUrl({
        titleId: title.id,
        ...(activeEpisode ? { episodeId: activeEpisode.id } : {}),
        download: true,
      });
    }
    vlcTimer.current = window.setTimeout(() => setVlcHint(null), 9000);
  }, [activeEpisode, displayTitle, episodeLabel, sourcePath, title]);

  // Keyboard shortcuts. Ignore typing targets and browser-modified keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const video = videoRef.current;
      if (!video) return;

      switch (event.key.toLowerCase()) {
        case ' ':
        case 'k':
          event.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
        case 'j':
          event.preventDefault();
          seekBy(-10);
          break;
        case 'arrowright':
        case 'l':
          event.preventDefault();
          seekBy(10);
          break;
        case 'arrowup':
          event.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          video.muted = false;
          break;
        case 'arrowdown':
          event.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case 'f':
          event.preventDefault();
          void toggleFullscreen();
          break;
        case 'm':
          event.preventDefault();
          toggleMute();
          break;
        case 'p':
          event.preventDefault();
          void togglePip();
          break;
        case 'c':
          event.preventDefault();
          if (totalTracks > 0) changeSubtitle(subtitleIndex >= 0 ? -1 : 0);
          else setMenu('subtitles');
          break;
        case 'n':
          event.preventDefault();
          if (nextEpisode) goToEpisode(nextEpisode);
          break;
        case 'escape':
          setMenu(null);
          setShortcutsOpen(false);
          setEpisodeMenuOpen(false);
          break;
        default:
          if (/^[0-9]$/.test(event.key) && Number.isFinite(video.duration)) {
            event.preventDefault();
            seekTo((Number(event.key) / 10) * video.duration);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    changeSubtitle,
    goToEpisode,
    nextEpisode,
    seekBy,
    seekTo,
    subtitleIndex,
    totalTracks,
    toggleMute,
    togglePip,
    togglePlay,
    toggleFullscreen,
  ]);

  if (loadingTitle && !title) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050506]">
        <div className="flex flex-col items-center gap-4">
          <LoaderCircle className="h-7 w-7 animate-spin text-accent-400" />
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.24em] text-white/30">Opening the stream</p>
        </div>
      </div>
    );
  }

  if (loadError || !title) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#050506] px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-300">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-white">This title could not be opened</h1>
        <p className="mt-2 max-w-md text-[0.8rem] leading-relaxed text-white/40">
          {loadError
            ? `LocalStream could not load this title (${loadError}). The library may still be scanning, or the title was removed.`
            : 'This title is not in the library index. Return to the collection and choose another title.'}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => void refresh()} className="btn btn-primary btn-sm">
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
          <Link href="/movies" className="btn btn-ghost btn-sm">
            Browse movies
          </Link>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050506]">
        <LoaderCircle className="h-7 w-7 animate-spin text-accent-400" />
      </div>
    );
  }

  const playedPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (buffered / duration) * 100) : 0;
  const isSeries = title.kind === 'series';
  const vlcTarget = { titleId: title.id, ...(activeEpisode ? { episodeId: activeEpisode.id } : {}) };
  const backHref = detailsHref(title);

  return (
    <div className="relative flex min-h-screen flex-col bg-[#050506]" style={paletteStyle(palette)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[45vh] opacity-25">
        <div className="absolute -top-44 left-1/2 h-[32rem] w-[58rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--p-glow),transparent_66%)] blur-[110px]" />
      </div>

      <header className="relative z-30 border-b border-white/[0.055] bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href={backHref}
              className="group flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] pl-2.5 pr-3 text-[0.68rem] font-semibold text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              aria-label="Back to title details"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>

            <Logo compact className="hidden md:flex" />
            <span className="hidden h-5 w-px bg-white/10 md:block" />

            <div className="min-w-0">
              <p className="truncate text-[0.78rem] font-semibold text-white/80">{title.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[0.56rem] font-semibold uppercase tracking-[0.16em] text-white/25">
                {isSeries && activeEpisode ? (
                  <>
                    <span className="text-accent-300/80">{episodeLabel}</span>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="truncate">{activeEpisode.name || `Episode ${activeEpisode.episode}`}</span>
                  </>
                ) : (
                  <>
                    <span className="h-1 w-1 rounded-full bg-emerald-400" />
                    Feature presentation
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isSeries && sortedEpisodes.length > 1 ? (
              <div className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => setEpisodeMenuOpen((value) => !value)}
                  className="inline-flex h-9 max-w-[15rem] items-center gap-1.5 rounded-full border border-white/[0.09] bg-white/[0.045] px-3 text-[0.66rem] font-semibold text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  aria-expanded={episodeMenuOpen}
                  aria-haspopup="listbox"
                >
                  <ListVideo className="h-3.5 w-3.5 text-accent-300/80" />
                  <span className="truncate">{episodeLabel}</span>
                  <ChevronDown className="h-3 w-3 text-white/30" />
                </button>

                {episodeMenuOpen && (
                  <div className="menu-panel absolute right-0 top-full z-40 mt-2 max-h-[60vh] w-80 overflow-y-auto p-2">
                    <p className="px-2 pb-2 pt-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/25">
                      Episodes
                    </p>
                    {sortedEpisodes.map((episode) => {
                      const active = episode.id === activeEpisode?.id;
                      return (
                        <button
                          key={episode.id}
                          type="button"
                          onClick={() => {
                            setEpisodeMenuOpen(false);
                            if (!active) goToEpisode(episode);
                          }}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors',
                            active ? 'bg-accent/[0.1] text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white',
                          )}
                        >
                          <span className="text-[0.62rem] font-bold tabular-nums text-white/30">
                            {episodeCode(episode.season, episode.episode)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[0.72rem] font-semibold">
                            {episode.name || `Episode ${episode.episode}`}
                          </span>
                          {active ? <Check className="h-3.5 w-3.5 text-accent-300" /> : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[0.56rem] font-bold uppercase tracking-[0.14em] text-white/30 md:inline-flex">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Local stream
              </span>
            )}

            <button
              type="button"
              onClick={() => setShortcutsOpen((value) => !value)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label="Keyboard shortcuts"
              aria-expanded={shortcutsOpen}
            >
              <Keyboard className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-sm"
            onClick={() => setShortcutsOpen(false)}
            aria-label="Close shortcuts"
            tabIndex={-1}
          />
          <div className="menu-panel relative mx-auto mt-[12vh] w-[min(92vw,30rem)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-white/35">Player shortcuts</p>
              <button
                type="button"
                onClick={() => setShortcutsOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Close shortcuts"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {shortcuts.map((shortcut) => (
                <li key={shortcut.keys} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5">
                  <span className="text-[0.68rem] text-white/45">{shortcut.label}</span>
                  <kbd className="shrink-0 rounded border border-white/10 bg-white/[0.045] px-1.5 py-0.5 text-[0.56rem] font-semibold text-white/40">
                    {shortcut.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto w-full max-w-[1600px] flex-1 px-0 pb-10 sm:px-6">
        <div
          ref={shellRef}
          className="group/shell relative aspect-video w-full overflow-hidden border-y border-white/[0.07] bg-black shadow-[0_50px_140px_-40px_rgba(0,0,0,0.95)] sm:mt-4 sm:max-h-[calc(100svh-11rem)] sm:rounded-[18px] sm:border sm:border-white/[0.09]"
          onMouseMove={revealControls}
          onTouchStart={revealControls}
        >
          {sourcePath ? (
            <video
              key={sourcePath}
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain"
              src={streamUrl(sourcePath)}
              playsInline
              autoPlay
              preload="metadata"
              crossOrigin="anonymous"
              onClick={togglePlay}
              onDoubleClick={() => void toggleFullscreen()}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const total = Number.isFinite(video.duration) ? video.duration : 0;
                setDuration(total);
                video.playbackRate = rate;
                const list = (video as HTMLVideoElement & { audioTracks?: AudioTrackListLike }).audioTracks;
                if (list && list.length > 0) {
                  const tracks = Array.from({ length: list.length }, (_, index) => ({
                    label: list[index]?.label || `Track ${index + 1}`,
                    language: list[index]?.language,
                    enabled: list[index]?.enabled ?? false,
                  }));
                  setAudioTracks(tracks);
                  const enabled = tracks.findIndex((track) => track.enabled);
                  if (enabled >= 0) setAudioIndex(enabled);
                }
                if (resumedForRef.current !== sourcePath) {
                  resumedForRef.current = sourcePath;
                  if (resumeTime > 5 && (!total || resumeTime < total - 10)) {
                    try {
                      video.currentTime = resumeTime;
                      setResumedAt(resumeTime);
                    } catch {
                      // Metadata is not seekable yet in rare browser cases.
                    }
                  }
                }
              }}
              onTimeUpdate={(event) => {
                const video = event.currentTarget;
                setCurrentTime(video.currentTime);
                const now = Date.now();
                if (now - saveTickRef.current > 5000 && !video.paused) {
                  saveTickRef.current = now;
                  saveCurrent();
                }
              }}
              onProgress={(event) => {
                const video = event.currentTarget;
                if (video.buffered.length > 0) {
                  setBuffered(video.buffered.end(video.buffered.length - 1));
                }
              }}
              onPlay={() => {
                setPlaying(true);
                setFinished(false);
                revealControls();
              }}
              onPause={() => {
                setPlaying(false);
                setBuffering(false);
                setControlsVisible(true);
                saveCurrent();
              }}
              onWaiting={() => setBuffering(true)}
              onCanPlay={() => {
                setStreamLoading(false);
                setBuffering(false);
              }}
              onPlaying={() => {
                setStreamLoading(false);
                setBuffering(false);
              }}
              onVolumeChange={(event) => {
                const video = event.currentTarget;
                setVolume(video.volume);
                setMuted(video.muted);
                try {
                  window.localStorage.setItem('localstream.volume', String(video.muted ? 0 : video.volume));
                } catch {
                  // Ignore storage failures.
                }
              }}
              onEnded={(event) => {
                setPlaying(false);
                setControlsVisible(true);
                setFinished(true);
                writeProgress(event.currentTarget, true);
                if (nextEpisode) setNextCountdown(8);
              }}
              onError={(event) => {
                setStreamLoading(false);
                setBuffering(false);
                setError(mediaErrorMessage(event.currentTarget));
              }}
            >
              {subtitles.map((track, index) => (
                <track
                  key={`${track.path}-${index}`}
                  kind="subtitles"
                  src={subtitleUrl(track.path)}
                  label={track.label}
                  srcLang={track.label.slice(0, 2).toLowerCase()}
                  onLoad={() => applySubtitleMode(subtitleIndex)}
                />
              ))}
              {embeddedSub ? (
                <track
                  key={embeddedSub.track.id}
                  kind="subtitles"
                  src={embeddedSub.url}
                  label={embeddedSub.track.label}
                  srcLang={embeddedSub.track.language ?? 'und'}
                  onLoad={() => applySubtitleMode(subtitleIndex)}
                />
              ) : null}
              {localSubs.map((sub) => (
                <track key={sub.id} kind="subtitles" src={sub.url} label={sub.label} srcLang="und" />
              ))}
            </video>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <TriangleAlert className="h-8 w-8 text-accent-300/70" />
              <p className="text-sm font-semibold text-white/80">No playable file for this title</p>
              <p className="max-w-sm text-[0.72rem] leading-relaxed text-white/35">
                The library index has no video file for this entry. Run a scan, or open the title details to check the
                source folder.
              </p>
              <Link href={backHref} className="btn btn-ghost btn-sm mt-2">
                Back to details
              </Link>
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          {streamLoading && !error && sourcePath ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]">
                  <Play className="h-4 w-4 translate-x-[1px] fill-white/70 text-white/70" />
                </span>
              </div>
              <p className="mt-5 text-[0.66rem] font-bold uppercase tracking-[0.22em] text-white/35">Preparing the stream</p>
              <p className="mt-1.5 text-[0.6rem] text-white/20">Direct from your local network · original quality</p>
            </div>
          ) : null}

          {buffering && !streamLoading && !error ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 backdrop-blur-md">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : null}

          {!playing && !streamLoading && !error && !finished ? (
            <button
              type="button"
              onClick={togglePlay}
              className="absolute left-1/2 top-1/2 z-20 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md transition-transform duration-200 hover:scale-105 hover:bg-black/60 sm:h-20 sm:w-20"
              aria-label="Play"
            >
              <Play className="h-6 w-6 translate-x-[2px] fill-current sm:h-7 sm:w-7" />
            </button>
          ) : null}

          {menu === null && !error && (embeddedJob || subtitleNotice) ? (
            <div className="pointer-events-none absolute bottom-24 left-3 z-30 flex max-w-[min(20rem,calc(100%-1.5rem))] items-start gap-2.5 rounded-xl border border-white/[0.12] bg-black/75 px-3 py-2.5 text-white shadow-xl backdrop-blur-xl sm:left-4">
              {embeddedJob ? (
                <LoaderCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent-300" />
              ) : (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-300" />
              )}
              <div className="min-w-0">
                <p className="text-[0.66rem] font-semibold text-white/85">
                  {embeddedJob ? 'Preparing embedded subtitles' : 'Subtitles'}
                </p>
                <p className="mt-0.5 text-[0.6rem] leading-relaxed text-white/45">
                  {embeddedJob
                    ? `${
                        embeddedJob.state === 'queued'
                          ? 'Queued'
                          : embeddedJob.progress !== null
                            ? `${embeddedJob.progress}%`
                            : 'Extracting'
                      } · first time only, then cached`
                    : subtitleNotice}
                </p>
              </div>
            </div>
          ) : null}

          {resumedAt !== null && !error ? (
            <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl border border-white/[0.12] bg-black/70 py-2 pl-3 pr-2 text-white shadow-xl backdrop-blur-xl sm:left-4 sm:top-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-300">
                <Play className="h-3 w-3 translate-x-[1px] fill-current" />
              </span>
              <div className="min-w-0">
                <p className="text-[0.66rem] font-semibold text-white/85">Resumed playback</p>
                <p className="text-[0.56rem] font-medium text-white/40">From {formatTime(resumedAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  seekTo(0);
                  setResumedAt(null);
                }}
                className="ml-2 shrink-0 rounded-lg border border-white/10 px-2 py-1 text-[0.56rem] font-semibold text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                Start over
              </button>
              <button
                type="button"
                onClick={() => setResumedAt(null)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/35 transition-colors hover:bg-white/[0.08] hover:text-white"
                aria-label="Dismiss resume notice"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}

          {finished && nextCountdown === null && !error ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#070709]/88 px-6 text-center backdrop-blur-sm">
              <span className="badge badge-accent">Finished</span>
              <h2 className="mt-4 text-lg font-bold tracking-tight text-white sm:text-xl">You&apos;ve reached the end</h2>
              <p className="mt-2 max-w-sm text-[0.74rem] leading-relaxed text-white/40">
                {isSeries && nextEpisode
                  ? `Up next is ${episodeCode(nextEpisode.season, nextEpisode.episode)} — ${nextEpisode.name || 'the next episode'}.`
                  : 'Thanks for watching. The title is marked complete in your history.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                {nextEpisode ? (
                  <button type="button" onClick={() => goToEpisode(nextEpisode)} className="btn btn-primary btn-sm">
                    <SkipForward className="h-3.5 w-3.5" />
                    Play next episode
                  </button>
                ) : null}
                <button type="button" onClick={() => seekTo(0)} className="btn btn-ghost btn-sm">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Watch again
                </button>
                <Link href={backHref} className="btn btn-ghost btn-sm">
                  Title details
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ) : null}

          {finished && nextCountdown !== null && nextEpisode ? (
            <div className="absolute inset-0 z-30 flex items-end justify-center bg-gradient-to-t from-black/95 via-black/55 to-black/20 px-4 pb-10 sm:items-center sm:pb-0">
              <div className="w-full max-w-md rounded-2xl border border-white/[0.12] bg-[#0a0a0e]/95 p-5 shadow-2xl backdrop-blur-xl">
                <p className="eyebrow">Up next</p>
                <p className="mt-2 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-white/30">
                  {episodeCode(nextEpisode.season, nextEpisode.episode)}
                </p>
                <h2 className="mt-1 truncate text-lg font-bold text-white">
                  {nextEpisode.name || `Episode ${nextEpisode.episode}`}
                </h2>
                <div className="mt-3 flex items-center gap-2 text-[0.64rem] text-white/35">
                  <Clock3 className="h-3 w-3" />
                  Starting in {nextCountdown}s
                </div>
                <div className="progress-track mt-3">
                  <div
                    className="progress-fill transition-[width] duration-1000 ease-linear"
                    style={{ width: `${Math.max(0, 100 - (nextCountdown / 8) * 100)}%` }}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => goToEpisode(nextEpisode)} className="btn btn-primary btn-sm flex-1">
                    <Play className="h-3 w-3 fill-current" />
                    Watch now
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNextCountdown(null);
                      setFinished(false);
                      setControlsVisible(true);
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[#070709]/96 px-6 text-center backdrop-blur-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-accent/20 bg-accent/10 text-accent-300">
                <TriangleAlert className="h-6 w-6" strokeWidth={1.7} />
              </div>
              <h2 className="mt-5 text-lg font-bold tracking-tight text-white sm:text-xl">This file did not play</h2>
              <p className="mt-2 max-w-md text-[0.76rem] leading-relaxed text-white/45">{error}</p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <button type="button" onClick={retry} className="btn btn-primary btn-sm">
                  <RotateCcw className="h-3.5 w-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => void openInVlc()}
                  disabled={vlcOpening}
                  className="btn btn-accent btn-sm disabled:opacity-60"
                >
                  {vlcOpening ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5" />}
                  Open in VLC
                </button>
                <Link href={backHref} className="btn btn-ghost btn-sm">
                  Back to details
                </Link>
              </div>
            </div>
          ) : null}

          {/* Custom control bar */}
          <div
            className={cn(
              'absolute inset-x-0 bottom-0 z-30 px-3 pb-3 transition-opacity duration-300 sm:px-5 sm:pb-4',
              controlsVisible || !playing ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            data-player-menu
            onMouseMove={revealControls}
          >
            {menu === 'subtitles' && (
              <div className="menu-panel absolute bottom-full right-3 mb-2 max-h-[19rem] w-72 overflow-y-auto p-2 sm:right-5">
                <p className="px-2 pb-2 pt-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/25">Subtitles</p>
                <button
                  type="button"
                  onClick={() => changeSubtitle(-1)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold transition-colors',
                    subtitleIndex < 0 ? 'bg-white/[0.08] text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                  )}
                >
                  Off
                  {subtitleIndex < 0 ? <Check className="h-3.5 w-3.5 text-accent-300" /> : null}
                </button>
                {embeddedLoading || embeddedError || embeddedTracks.length > 0 ? (
                  <div className="mt-1 border-t border-white/[0.06] pt-2">
                    <p className="px-2 pb-1 text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/25">
                      Embedded in this file
                    </p>
                    {embeddedLoading ? (
                      <p className="flex items-center gap-2 px-2.5 py-2 text-[0.64rem] text-white/30">
                        <LoaderCircle className="h-3 w-3 animate-spin" />
                        Checking subtitle streams…
                      </p>
                    ) : embeddedError ? (
                      <p className="px-2.5 pb-1 text-[0.62rem] leading-relaxed text-accent-300">{embeddedError}</p>
                    ) : (
                      embeddedTracks.map((track) => {
                        const active = embeddedSub?.track.id === track.id;
                        const preparing =
                          embeddedJob?.trackId === track.id &&
                          (embeddedJob.state === 'queued' || embeddedJob.state === 'running');
                        const progress = preparing ? embeddedJob?.progress ?? null : null;
                        return (
                          <button
                            key={track.id}
                            type="button"
                            onClick={() => {
                              if (!track.supported) {
                                setSubtitleNotice(
                                  track.reason ?? 'This subtitle track cannot be displayed in a browser.',
                                );
                                return;
                              }
                              void selectEmbeddedSubtitle(track);
                            }}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold transition-colors',
                              active
                                ? 'bg-white/[0.08] text-white'
                                : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                              !track.supported && 'opacity-45',
                            )}
                            title={track.reason ?? track.codec}
                            aria-disabled={!track.supported || preparing}
                          >
                            <span className="min-w-0 truncate">
                              {track.label}
                              <span className="ml-1.5 text-[0.55rem] font-bold uppercase text-white/20">{track.format}</span>
                              {track.default ? (
                                <span className="ml-1.5 text-[0.5rem] font-bold uppercase tracking-wide text-accent-300/70">
                                  default
                                </span>
                              ) : null}
                              {preparing ? (
                                <span className="ml-1.5 text-[0.55rem] font-semibold text-accent-300">
                                  {progress !== null
                                    ? `${progress}%`
                                    : embeddedJob?.state === 'queued'
                                      ? 'queued'
                                      : 'preparing…'}
                                </span>
                              ) : null}
                              {!track.supported ? (
                                <span className="ml-1.5 text-[0.55rem] font-bold uppercase text-white/20">VLC</span>
                              ) : null}
                            </span>
                            {preparing ? (
                              <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-300" />
                            ) : active ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-accent-300" />
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
                {subtitles.length > 0 ? (
                  <div className="mt-1 border-t border-white/[0.06] pt-2">
                    <p className="px-2 pb-1 text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/25">
                      Next to this video
                    </p>
                    {subtitles.map((track, index) => (
                      <button
                        key={`${track.path}-${index}`}
                        type="button"
                        onClick={() => changeSubtitle(index)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold transition-colors',
                          subtitleIndex === index
                            ? 'bg-white/[0.08] text-white'
                            : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                        )}
                        title={track.path}
                      >
                        <span className="min-w-0 truncate">
                          {track.label}
                          <span className="ml-1.5 text-[0.55rem] font-bold uppercase text-white/20">{track.format}</span>
                        </span>
                        {subtitleIndex === index ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-300" /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                {localSubs.length > 0 ? (
                  <div className="mt-1 border-t border-white/[0.06] pt-2">
                    <p className="px-2 pb-1 text-[0.55rem] font-bold uppercase tracking-[0.16em] text-white/25">
                      Loaded from your device
                    </p>
                    {localSubs.map((sub, i) => {
                      const index = localSubtitleBase + i;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => changeSubtitle(index)}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold transition-colors',
                            subtitleIndex === index
                              ? 'bg-white/[0.08] text-white'
                              : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                          )}
                          title={sub.label}
                        >
                          <span className="min-w-0 truncate">
                            {sub.label}
                            <span className="ml-1.5 text-[0.55rem] font-bold uppercase text-white/20">loaded</span>
                          </span>
                          {subtitleIndex === index ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-300" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {!embeddedLoading &&
                !embeddedError &&
                embeddedTracks.length === 0 &&
                subtitles.length === 0 &&
                localSubs.length === 0 ? (
                  <p className="px-2.5 py-3 text-[0.64rem] leading-relaxed text-white/30">
                    No subtitles were found for this file. Load one from your device below.
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => subtitleFileRef.current?.click()}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold text-accent-300 transition-colors hover:bg-white/[0.05]"
                >
                  <FileUp className="h-3.5 w-3.5" />
                  Load subtitle file…
                </button>
                {subtitleNotice ? (
                  <p className="px-2.5 pb-1 text-[0.62rem] leading-relaxed text-accent-300">{subtitleNotice}</p>
                ) : null}
                {subtitleIndex >= 0 ? (
                  <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-2.5 py-2 text-[0.64rem] font-semibold text-white/45">
                    <span className="tabular-nums">
                      Sync {subtitleOffset > 0 ? '+' : ''}
                      {subtitleOffset.toFixed(1)}s
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => shiftSubtitles(-0.5)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
                        aria-label="Show subtitles earlier"
                        title="Show subtitles earlier"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => shiftSubtitles(0.5)}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white"
                        aria-label="Show subtitles later"
                        title="Show subtitles later"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </span>
                  </div>
                ) : null}
                <p className="border-t border-white/[0.06] px-2.5 pb-1 pt-2 text-[0.55rem] leading-relaxed text-white/25">
                  Supports .srt, .vtt, .ass and .ssa. Files you load stay in your browser and are not uploaded.
                </p>
              </div>
            )}

            {menu === 'speed' && (
              <div className="menu-panel absolute bottom-full right-3 mb-2 w-44 p-2 sm:right-5">
                <p className="px-2 pb-2 pt-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/25">Playback speed</p>
                {SPEEDS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => {
                      changeRate(speed);
                      setMenu(null);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[0.72rem] font-semibold transition-colors',
                      rate === speed
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                    )}
                  >
                    {speed === 1 ? 'Normal' : `${speed}×`}
                    {rate === speed ? <Check className="h-3.5 w-3.5 text-accent-300" /> : null}
                  </button>
                ))}
              </div>
            )}

            {menu === 'audio' && (
              <div className="menu-panel absolute bottom-full right-3 mb-2 w-64 p-2 sm:right-5">
                <p className="px-2 pb-2 pt-1 text-[0.55rem] font-bold uppercase tracking-[0.18em] text-white/25">Audio track</p>
                {audioTracks.map((track, index) => (
                  <button
                    key={`${track.label}-${index}`}
                    type="button"
                    onClick={() => changeAudio(index)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[0.72rem] font-semibold transition-colors',
                      audioIndex === index
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/50 hover:bg-white/[0.05] hover:text-white',
                    )}
                  >
                    <span className="truncate">
                      {track.label}
                      {track.language ? (
                        <span className="ml-1.5 text-[0.55rem] font-bold uppercase text-white/20">{track.language}</span>
                      ) : null}
                    </span>
                    {audioIndex === index ? <Check className="h-3.5 w-3.5 text-accent-300" /> : null}
                  </button>
                ))}
              </div>
            )}

            <div className="mb-2.5">
              <div className="group/seek relative h-4">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
                  <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${bufferedPercent}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${playedPercent}%` }} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(event) => seekTo(Number(event.target.value))}
                  className="player-range absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent"
                  aria-label="Seek"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={togglePlay}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
                aria-label={playing ? 'Pause' : 'Play'}
              >
                {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-[1px] fill-current" />}
              </button>

              {nextEpisode ? (
                <button
                  type="button"
                  onClick={() => goToEpisode(nextEpisode)}
                  className="hidden h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white sm:flex"
                  aria-label="Next episode"
                  title="Next episode (N)"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              ) : null}

              <div className="group/vol flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={muted ? 0 : volume}
                  onChange={(event) => {
                    const video = videoRef.current;
                    if (!video) return;
                    const value = Number(event.target.value);
                    video.volume = value;
                    video.muted = value === 0;
                    setVolume(value);
                    setMuted(value === 0);
                  }}
                  className="player-range hidden w-20 cursor-pointer appearance-none bg-transparent sm:block"
                  aria-label="Volume"
                />
              </div>

              <div className="ml-1 flex items-baseline gap-1 text-[0.62rem] font-semibold tabular-nums text-white/60">
                <span>{formatTime(currentTime)}</span>
                <span className="text-white/25">/</span>
                <span className="text-white/35">{duration ? formatTime(duration) : '—'}</span>
              </div>

              <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
                {(
                  <>
                  <button
                    type="button"
                    onClick={() => setMenu(menu === 'subtitles' ? null : 'subtitles')}
                    className={cn(
                      'relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10',
                      subtitleIndex >= 0 ? 'text-accent-300' : 'text-white/60 hover:text-white',
                    )}
                    aria-label="Subtitles"
                    aria-expanded={menu === 'subtitles'}
                  >
                    {subtitleIndex >= 0 ? <Captions className="h-4 w-4" /> : <CaptionsOff className="h-4 w-4" />}
                    {subtitleIndex < 0 && embeddedTracks.length > 0 ? (
                      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent-300" />
                    ) : null}
                  </button>
                  <input
                    ref={subtitleFileRef}
                    type="file"
                    accept=".srt,.vtt,.ass,.ssa,text/vtt"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void loadSubtitleFile(file);
                    }}
                  />
                  </>
                )}

                {audioTracks.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setMenu(menu === 'audio' ? null : 'audio')}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Audio tracks"
                    aria-expanded={menu === 'audio'}
                  >
                    <AudioLines className="h-4 w-4" />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setMenu(menu === 'speed' ? null : 'speed')}
                  className="flex h-9 items-center gap-1 rounded-full px-2 text-[0.66rem] font-bold tabular-nums text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Playback speed"
                  aria-expanded={menu === 'speed'}
                >
                  <Gauge className="h-3.5 w-3.5" />
                  {rate === 1 ? '1×' : `${rate}×`}
                </button>

                {canPip ? (
                  <button
                    type="button"
                    onClick={() => void togglePip()}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-white/10',
                      isPip ? 'text-accent-300' : 'text-white/60 hover:text-white',
                    )}
                    aria-label="Picture in picture"
                    title="Picture in picture (P)"
                  >
                    <PictureInPicture2 className="h-4 w-4" />
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void toggleFullscreen()}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-5 px-4 sm:mt-6 sm:flex-row sm:items-start sm:justify-between sm:px-1">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-accent">Now playing</span>
              <span className="badge">{isSeries ? 'TV Series' : 'Feature film'}</span>
              <span className="badge uppercase">{sourceExtension || 'Video'}</span>
              {activeEpisode ? <span className="badge">{episodeLabel}</span> : null}
              {activeEpisode?.size ? <span className="badge">{formatBytes(activeEpisode.size)}</span> : null}
            </div>

            <h1 className="mt-3 truncate text-[1.4rem] font-bold tracking-tight text-white sm:text-[1.7rem]">
              {isSeries && activeEpisode
                ? activeEpisode.name || `${title.title} · Episode ${activeEpisode.episode}`
                : title.title}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.68rem] font-medium text-white/35">
              {isSeries ? <span>{title.title}</span> : null}
              {title.year ? <span>{title.year}</span> : null}
              {!isSeries && title.runtime ? <span>{formatRuntime(title.runtime)}</span> : null}
              <span className="h-1 w-1 rounded-full bg-white/15" />
              <span>Direct from your local server</span>
              {duration > 0 ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/15" />
                  <span className="tabular-nums">{formatTime(duration)}</span>
                </>
              ) : null}
              {title.rating ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-white/15" />
                  <span className="text-amber-300/80">{title.rating.toFixed(1)} / 10</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void openInVlc()}
              disabled={vlcOpening}
              className="btn btn-ghost btn-sm disabled:opacity-60"
              title="Open this stream in VLC through the local companion"
            >
              {vlcOpening ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5" />}
              Open in VLC
            </button>
            <button
              type="button"
              onClick={() => void copyStreamLink()}
              className={cn(
                'btn btn-ghost btn-sm',
                copyState === 'copied' && 'border-emerald-400/25 text-emerald-300',
              )}
              title="Copy a direct HTTP stream link for any local player"
            >
              {copyState === 'copied' ? <Check className="h-3.5 w-3.5" /> : <ListVideo className="h-3.5 w-3.5" />}
              {copyState === 'copied' ? 'Link copied' : 'Copy stream link'}
            </button>
            <Link href={backHref} className="btn btn-quiet btn-sm">
              Details
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 px-4 sm:px-1 lg:grid-cols-2">
          <div className="panel p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">Now streaming</p>
              <span className="inline-flex items-center gap-1.5 text-[0.58rem] font-bold uppercase tracking-[0.14em] text-emerald-300/80">
                <span className="h-1 w-1 rounded-full bg-emerald-400" />
                Original quality
              </span>
            </div>
            <p className="mt-3 break-all font-mono text-[0.66rem] leading-relaxed text-white/45">{sourcePath || '—'}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[0.66rem] sm:grid-cols-3">
              <div>
                <p className="text-[0.54rem] font-bold uppercase tracking-[0.16em] text-white/25">Format</p>
                <p className="mt-1 font-semibold uppercase text-white/65">{sourceExtension || '—'}</p>
              </div>
              <div>
                <p className="text-[0.54rem] font-bold uppercase tracking-[0.16em] text-white/25">Subtitles</p>
                <p className="mt-1 font-semibold text-white/65">
                  {availableSubtitleCount > 0
                    ? `${availableSubtitleCount} found`
                    : embeddedLoading
                      ? 'Checking…'
                      : embeddedError
                        ? 'Unavailable'
                        : 'None found'}
                </p>
              </div>
              <div>
                <p className="text-[0.54rem] font-bold uppercase tracking-[0.16em] text-white/25">Server</p>
                <p className="mt-1 font-semibold text-white/65">Local network</p>
              </div>
            </div>
          </div>

          <div className="panel p-4 sm:p-5">
            <p className="eyebrow">Playback help</p>
            <p className="mt-3 text-[0.76rem] leading-relaxed text-white/45">
              Browsers cannot decode every codec — MKV containers, HEVC video and AC3 audio are common problems. The file
              is <span className="font-semibold text-white/70">not downloaded</span> when you use VLC: it streams directly
              from the same server and seeks instantly.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openInVlc()}
                disabled={vlcOpening}
                className="btn btn-accent btn-sm disabled:opacity-60"
              >
                {vlcOpening ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <MonitorPlay className="h-3.5 w-3.5" />}
                Play in VLC
              </button>
              <a
                href={vlcUrl({ ...vlcTarget, download: true })}
                className="btn btn-ghost btn-sm"
                title="Download an M3U playlist and open it in VLC"
              >
                <ListVideo className="h-3.5 w-3.5" />
                VLC playlist
              </a>
            </div>
            <p className="mt-3 text-[0.6rem] leading-relaxed text-white/25">
              Tip: in VLC use <span className="font-semibold text-white/45">Media → Open Network Stream</span> and paste
              the copied stream link. For one-click playback, run <span className="font-semibold text-white/45">npm run vlc</span>{' '}
              and leave the companion running on this computer.
            </p>
            {vlcHint ? (
              <p
                role="status"
                className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2 text-[0.62rem] leading-relaxed text-accent-100/80"
              >
                {vlcHint}
              </p>
            ) : null}
          </div>
        </div>

        {nextEpisode ? (
          <div className="mt-3 px-4 sm:px-1">
            <button
              type="button"
              onClick={() => goToEpisode(nextEpisode)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-left transition-colors hover:border-white/[0.14] hover:bg-white/[0.045] sm:p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50 transition-colors group-hover:text-white">
                <SkipForward className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.55rem] font-bold uppercase tracking-[0.18em] text-accent-300/80">Up next</span>
                <span className="mt-1 block truncate text-[0.82rem] font-semibold text-white/85">
                  {episodeCode(nextEpisode.season, nextEpisode.episode)} · {nextEpisode.name || `Episode ${nextEpisode.episode}`}
                </span>
                <span className="mt-0.5 block text-[0.62rem] text-white/30">
                  {formatBytes(nextEpisode.size)} · {nextEpisode.extension.toUpperCase()}
                  {nextEpisode.subtitles.length > 0 ? ` · ${nextEpisode.subtitles.length} subtitle track${nextEpisode.subtitles.length === 1 ? '' : 's'}` : ''}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
            </button>
          </div>
        ) : null}

        <div className="mt-5 hidden items-center justify-between border-t border-white/[0.055] px-1 pt-4 sm:flex">
          <div className="flex flex-wrap items-center gap-4 text-[0.6rem] font-medium text-white/20">
            {shortcuts.slice(0, 4).map((shortcut) => (
              <span key={shortcut.keys} className="flex items-center gap-1.5">
                <kbd className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[0.54rem] font-semibold text-white/30">
                  {shortcut.keys}
                </kbd>
                {shortcut.label}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="text-[0.6rem] font-semibold text-white/30 transition-colors hover:text-white/70"
            >
              All shortcuts
            </button>
          </div>
          <span className="text-[0.6rem] font-medium text-white/20">
            {isSeries ? `${sortedEpisodes.length} episodes in this series` : 'Original file · no transcoding'}
          </span>
        </div>
      </div>
    </div>
  );
}
