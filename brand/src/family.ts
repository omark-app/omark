// The Omark icon family (direction B, "Ring") as data, and its SVG serialiser.
// All coordinates are in a 512x512 space.

export type App = 'tasks' | 'time' | 'omark'; // 'omark' is the brand mark
export type Variant = 'production' | 'staging';
// square = full bleed; rounded = radius 22.5%, transparent corners
export type Shape = 'square' | 'rounded';

export type Mark =
  | { kind: 'line'; points: [number, number][]; width: number; color: string; cap: 'round' | 'square' }
  | { kind: 'circle'; cx: number; cy: number; r: number; width: number; color: string }; // a stroked ring

export interface IconSpec {
  tile: string;
  marks: Mark[];
}

export const PALETTE: Readonly<Record<string, string>> = {
  ink: '#151A22',
  blue: '#2B59D6',
  green: '#2C8A55',
  white: '#FFFFFF',
  staging: '#F6E7C8',
};

const APP_COLOR: Record<App, string> = {
  tasks: PALETTE.blue!,
  time: PALETTE.green!,
  omark: PALETTE.ink!,
};

export function iconSpec(app: App, variant: Variant = 'production', opts: { small?: boolean } = {}): IconSpec {
  const k = opts.small ? 1.2 : 1; // thicker strokes read better at favicon size
  const staging = variant === 'staging';
  const tile = staging ? PALETTE.staging! : APP_COLOR[app];
  const color = staging ? APP_COLOR[app] : PALETTE.white!;

  const marks: Mark[] = [{ kind: 'circle', cx: 256, cy: 256, r: 146, width: 46 * k, color }];
  if (app === 'tasks') {
    marks.push({ kind: 'line', points: [[192, 262], [236, 304], [320, 210]], width: 44 * k, color, cap: 'round' });
  } else if (app === 'time') {
    marks.push({ kind: 'line', points: [[256, 172], [256, 256], [316, 294]], width: 40 * k, color, cap: 'round' });
  }
  return { tile, marks };
}

// Trim float noise (46 * 1.2 = 55.199999...).
const num = (n: number) => String(Math.round(n * 100) / 100);

function markSvg(m: Mark): string {
  if (m.kind === 'circle') {
    return `<circle cx="${num(m.cx)}" cy="${num(m.cy)}" r="${num(m.r)}" fill="none" stroke="${m.color}" stroke-width="${num(m.width)}"/>`;
  }
  const points = m.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
  const join = m.cap === 'round' ? 'round' : 'miter';
  return `<polyline points="${points}" fill="none" stroke="${m.color}" stroke-width="${num(m.width)}" stroke-linecap="${m.cap}" stroke-linejoin="${join}"/>`;
}

export function iconSvg(app: App, opts: { variant?: Variant; shape?: Shape; small?: boolean } = {}): string {
  const { tile, marks } = iconSpec(app, opts.variant, { small: opts.small });
  const rx = opts.shape === 'rounded' ? ' rx="115.2"' : '';
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    `<rect width="512" height="512"${rx} fill="${tile}"/>` +
    marks.map(markSvg).join('') +
    '</svg>'
  );
}
