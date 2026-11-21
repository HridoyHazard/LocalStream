/**
 * Client-safe subtitle helpers. Used by the player to turn a subtitle file the
 * viewer picks from their device into WebVTT, which is the only text track
 * format browsers can display.
 */

/** Decodes subtitle bytes, handling UTF-16 and legacy 8-bit encodings. */
export function decodeSubtitleBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function pad(value: string, size: number) {
  return value.padStart(size, '0');
}

function srtToVtt(input: string) {
  const body = input
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/g, (_m, h, m, s, ms) => `${pad(h, 2)}:${m}:${s}.${ms.padEnd(3, '0')}`)
    .replace(/\{\\an?\d\}/g, '')
    .replace(/<\/?font[^>]*>/gi, '')
    .trim();
  return `WEBVTT\n\n${body}\n`;
}

function assToVtt(input: string) {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  let inEvents = false;
  let format: string[] = [];
  const cues: string[] = [];

  const convertTime = (value: string) => {
    const match = value.trim().match(/^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/);
    if (!match) return null;
    const [, h, m, s, cs] = match;
    return `${pad(h, 2)}:${m}:${s}.${cs.padEnd(3, '0').slice(0, 3)}`;
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
        .slice(trimmed.indexOf(':') + 1)
        .split(',')
        .map((part) => part.trim().toLowerCase());
      continue;
    }
    if (!/^dialogue\s*:/i.test(trimmed)) continue;
    const parts = trimmed.slice(trimmed.indexOf(':') + 1).split(',');
    if (!format.length || parts.length < format.length) continue;
    const values: Record<string, string> = {};
    format.forEach((name, index) => {
      values[name] = index === format.length - 1 ? parts.slice(index).join(',') : parts[index];
    });
    const start = convertTime(values.start ?? '');
    const end = convertTime(values.end ?? '');
    if (!start || !end) continue;
    const text = (values.text ?? '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\N/gi, '\n')
      .replace(/\\h/gi, ' ')
      .trim();
    if (!text) continue;
    cues.push(`${start} --> ${end}\n${text}`);
  }

  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

/**
 * Converts subtitle text to WebVTT. `format` is the file extension; when it is
 * missing or wrong the content is sniffed instead. Throws for unsupported or
 * empty files so the caller can show a message.
 */
export function subtitleTextToVtt(text: string, format: string): string {
  const clean = text.replace(/^﻿/, '');
  const ext = format.toLowerCase();
  let kind: 'vtt' | 'ass' | 'srt';
  if (/^\s*WEBVTT/.test(clean)) kind = 'vtt';
  else if (ext === 'ass' || ext === 'ssa' || /^\s*\[(?:script info|events)\]/im.test(clean)) kind = 'ass';
  else if (clean.includes('-->')) kind = 'srt';
  else throw new Error('That file is not a supported subtitle format. Use .srt, .vtt, .ass or .ssa.');

  const vtt = kind === 'vtt' ? clean : kind === 'ass' ? assToVtt(clean) : srtToVtt(clean);
  if (!vtt.includes('-->')) throw new Error('No subtitle lines were found in that file.');
  return vtt;
}
