'use client';

import { useState } from 'react';
import type { MediaKind } from '@/lib/media/types';
import { getPosterPalette, getPosterSerial, getPosterVariant, paletteStyle } from '@/lib/design/palette';
import { pad } from '@/lib/media-links';
import { cn } from '@/lib/utils';

interface PosterProps {
  title: string;
  kind: MediaKind;
  year?: number | null;
  posterUrl?: string | null;
  extension?: string;
  episodeLabel?: string;
  className?: string;
  classNameTitle?: string;
  priority?: boolean;
}

/**
 * Real local/TMDB artwork when available, with the generated cinematic cover
 * as an always-available fallback (important on an offline LAN).
 */
export default function Poster({
  title,
  kind,
  year,
  posterUrl,
  extension,
  episodeLabel,
  className,
  classNameTitle,
  priority = false,
}: PosterProps) {
  const [failed, setFailed] = useState(false);
  const palette = getPosterPalette(`${title}-${year ?? ''}`);
  const variant = getPosterVariant(`${title}-${kind}-${episodeLabel ?? ''}`);
  const serial = getPosterSerial(title);
  const initial = (title.trim().match(/[a-z0-9]/i)?.[0] ?? 'L').toUpperCase();
  const showImage = Boolean(posterUrl) && !failed;

  return (
    <div
      className={cn(
        'poster-art h-full w-full',
        variant === 1 && 'poster-variant-1',
        variant === 2 && 'poster-variant-2',
        className,
      )}
      style={paletteStyle(palette)}
    >
      {showImage ? (
        <>
          <img
            src={posterUrl ?? ''}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
        </>
      ) : (
        <>
          <div className="poster-orb" />
          <div className="poster-ring" />
          <div className="poster-glyph">{initial}</div>
          <div className="poster-slash" />
          <div className="poster-grid" />
          <div className="poster-noise" />
          <div className="poster-shade" />

          <div className="poster-content">
            <div className="poster-topline">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1 w-1 rounded-full bg-white/70" />
                LS / {serial}
              </span>
              <span className="uppercase tracking-[0.16em]">{extension || 'LOCAL'}</span>
            </div>

            <div>
              <p className="poster-kicker">{episodeLabel ?? (kind === 'series' ? `Season ${pad(1)}` : 'Feature presentation')}</p>
              <h3 className={cn('poster-title', classNameTitle)}>{title}</h3>
              <p className="poster-meta">
                {year ? `${year} · ` : ''}
                {kind === 'series' ? 'Series' : 'Local library'}
              </p>
            </div>
          </div>

          <div className="poster-sheen" />
        </>
      )}

      {showImage && (
        <div className="poster-sheen" aria-hidden="true" />
      )}
    </div>
  );
}
