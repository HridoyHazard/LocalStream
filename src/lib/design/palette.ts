export interface PosterPalette {
  id: string;
  name: string;
  base: string;
  deep: string;
  mid: string;
  glow: string;
  soft: string;
  ink: string;
  accent: string;
}

/**
 * A curated set of cinematic palettes used to generate unique poster artwork
 * for every title in the local library. No remote artwork is required, which
 * keeps LocalStream fast and fully functional on an offline network.
 */
export const posterPalettes: PosterPalette[] = [
  {
    id: 'ember',
    name: 'Ember',
    base: '#0d0506',
    deep: '#24090b',
    mid: '#7b1b1f',
    glow: '#ff563c',
    soft: 'rgba(255, 86, 60, 0.32)',
    ink: '#fff4ef',
    accent: '#ffb38f',
  },
  {
    id: 'abyss',
    name: 'Abyss',
    base: '#020b0c',
    deep: '#06201f',
    mid: '#0e4b47',
    glow: '#2dd4bf',
    soft: 'rgba(45, 212, 191, 0.28)',
    ink: '#effffb',
    accent: '#8cf5e4',
  },
  {
    id: 'violet',
    name: 'Ultraviolet',
    base: '#08050f',
    deep: '#160b2c',
    mid: '#4a1d8f',
    glow: '#a78bfa',
    soft: 'rgba(167, 139, 250, 0.3)',
    ink: '#f7f2ff',
    accent: '#d8c7ff',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    base: '#0b0703',
    deep: '#211305',
    mid: '#7c3a0d',
    glow: '#f59e0b',
    soft: 'rgba(245, 158, 11, 0.3)',
    ink: '#fff9ed',
    accent: '#ffd58a',
  },
  {
    id: 'jade',
    name: 'Jade',
    base: '#030a06',
    deep: '#081f13',
    mid: '#14532d',
    glow: '#34d399',
    soft: 'rgba(52, 211, 153, 0.26)',
    ink: '#f0fff7',
    accent: '#9af7c7',
  },
  {
    id: 'steel',
    name: 'Steel',
    base: '#04080f',
    deep: '#0a1523',
    mid: '#1e3a5f',
    glow: '#60a5fa',
    soft: 'rgba(96, 165, 250, 0.28)',
    ink: '#f1f7ff',
    accent: '#b7d7ff',
  },
  {
    id: 'noir',
    name: 'Noir',
    base: '#080506',
    deep: '#1a1015',
    mid: '#4b1e30',
    glow: '#fb7185',
    soft: 'rgba(251, 113, 133, 0.26)',
    ink: '#fff2f5',
    accent: '#ffc5d0',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    base: '#05090b',
    deep: '#0c1b20',
    mid: '#285b63',
    glow: '#67e8f9',
    soft: 'rgba(103, 232, 249, 0.26)',
    ink: '#f0feff',
    accent: '#b9f5ff',
  },
  {
    id: 'sand',
    name: 'Sand',
    base: '#0b0804',
    deep: '#21150b',
    mid: '#78350f',
    glow: '#fb923c',
    soft: 'rgba(251, 146, 60, 0.28)',
    ink: '#fff8f0',
    accent: '#ffd1a3',
  },
  {
    id: 'orchid',
    name: 'Orchid',
    base: '#0a060d',
    deep: '#1d0b24',
    mid: '#6b1d68',
    glow: '#e879f9',
    soft: 'rgba(232, 121, 249, 0.27)',
    ink: '#fdf2ff',
    accent: '#f5c2ff',
  },
];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getPosterPalette(seed: string): PosterPalette {
  return posterPalettes[hashString(seed || 'localstream') % posterPalettes.length];
}

export function getPosterVariant(seed: string) {
  return hashString(`${seed}-variant`) % 3;
}

export function getPosterSerial(seed: string) {
  return (hashString(`${seed}-serial`) % 900 + 100).toString();
}

export function paletteStyle(palette: PosterPalette) {
  return {
    '--p-base': palette.base,
    '--p-deep': palette.deep,
    '--p-mid': palette.mid,
    '--p-glow': palette.glow,
    '--p-soft': palette.soft,
    '--p-ink': palette.ink,
    '--p-accent': palette.accent,
  } as React.CSSProperties;
}
