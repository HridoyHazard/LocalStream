#!/usr/bin/env node
/**
 * LocalStream VLC companion
 *
 * A tiny loopback-only helper that lets the LocalStream web player open a
 * stream directly in the desktop VLC app. Browsers cannot launch native apps
 * on their own, so this companion bridges that gap.
 *
 *   npm run vlc
 *
 * The companion never downloads media. It only hands VLC the same HTTP URL
 * the browser would use, so VLC streams and seeks exactly like the web player.
 *
 * Environment:
 *   VLC_PATH                    full path to vlc.exe / vlc
 *   VLC_COMPANION_PORT          default 8642
 *   VLC_COMPANION_HOST          default 127.0.0.1 (keep it loopback)
 *   VLC_COMPANION_ORIGINS       extra allowed browser origins, comma separated
 */
import http from 'node:http';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.VLC_COMPANION_PORT || 8642);
const HOST = process.env.VLC_COMPANION_HOST || '127.0.0.1';
const VERSION = '1.0.0';
const MAX_BODY = 8 * 1024;

function vlcCandidates() {
  if (process.env.VLC_PATH) return [process.env.VLC_PATH];
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
    ];
  }
  if (process.platform === 'darwin') {
    return ['/Applications/VLC.app/Contents/MacOS/VLC', '/opt/homebrew/bin/vlc', '/usr/local/bin/vlc'];
  }
  return ['/usr/bin/vlc', '/usr/local/bin/vlc', '/snap/bin/vlc'];
}

function resolveVlc() {
  for (const candidate of vlcCandidates()) {
    if (candidate === 'vlc') return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const VLC_PATH = resolveVlc();

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

function allowedOrigins() {
  const extra = (process.env.VLC_COMPANION_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(extra);
}

const EXTRA_ORIGINS = allowedOrigins();

function originAllowed(origin) {
  if (!origin) return true;
  if (EXTRA_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return isPrivateHost(url.hostname);
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  };
  if (origin && originAllowed(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function send(response, status, payload, origin) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...corsHeaders(origin),
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function launchVlc(streamUrl) {
  if (!VLC_PATH) return false;
  const child = spawn(VLC_PATH, [streamUrl], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.on('error', (error) => {
    console.error('[vlc-companion] failed to launch VLC:', error.message);
  });
  child.unref();
  return true;
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;

  if (request.method === 'OPTIONS') {
    if (!originAllowed(origin)) return send(response, 403, { error: 'Origin is not allowed' }, origin);
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    return send(
      response,
      200,
      {
        ok: true,
        service: 'localstream-vlc-companion',
        version: VERSION,
        vlc: VLC_PATH,
        platform: process.platform,
        hint: VLC_PATH ? 'VLC is ready' : 'VLC was not found. Set VLC_PATH to your VLC executable.',
      },
      origin,
    );
  }

  if (request.method === 'POST' && url.pathname === '/open') {
    if (!originAllowed(origin)) return send(response, 403, { error: 'Origin is not allowed' }, origin);
    if (!VLC_PATH) {
      return send(
        response,
        503,
        {
          error:
            'VLC was not found. Install VLC or set VLC_PATH to the VLC executable, then restart the companion.',
        },
        origin,
      );
    }

    let payload;
    try {
      const body = await readBody(request);
      payload = JSON.parse(body || '{}');
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : 'Invalid JSON' }, origin);
    }

    let target;
    try {
      target = new URL(String(payload.url || ''));
    } catch {
      return send(response, 400, { error: 'A valid stream URL is required' }, origin);
    }

    if (!/^https?:$/.test(target.protocol)) {
      return send(response, 400, { error: 'Only HTTP streams can be opened' }, origin);
    }
    if (!target.pathname.startsWith('/api/stream/')) {
      return send(response, 403, { error: 'Only LocalStream /api/stream URLs are allowed' }, origin);
    }
    if (!isPrivateHost(target.hostname)) {
      return send(response, 403, { error: 'Only local or private-network streams are allowed' }, origin);
    }

    if (!launchVlc(target.toString())) {
      return send(response, 500, { error: 'VLC could not be launched' }, origin);
    }

    console.log(`[vlc-companion] opening ${payload.title ? `"${payload.title}" ` : ''}in VLC: ${target.toString()}`);
    return send(response, 202, { started: true, url: target.toString() }, origin);
  }

  send(response, 404, { error: 'Not found. Use GET /health or POST /open.' }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`[vlc-companion] listening on http://${HOST}:${PORT}`);
  console.log(`[vlc-companion] VLC: ${VLC_PATH ?? 'not found (set VLC_PATH)'}`);
  console.log('[vlc-companion] keep this window open while you watch; Ctrl+C to stop');
});

server.on('error', (error) => {
  console.error('[vlc-companion] server error:', error.message);
  process.exitCode = 1;
});
