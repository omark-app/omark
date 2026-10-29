import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iconSpec, iconSvg, type App, type Variant } from './family.ts';

const apps: App[] = ['tasks', 'time', 'goals', 'omark'];
const variants: Variant[] = ['production', 'staging'];
const combos = apps.flatMap((app) =>
  variants.flatMap((variant) => [false, true].map((small) => ({ app, variant, small }))),
);

const SAFE = 204.8;
const dist = (x: number, y: number) => Math.hypot(x - 256, y - 256);

const tokens = readFileSync(new URL('../../apps/tasks/src/styles/tokens.css', import.meta.url), 'utf8');
const allowed = new Set([...(tokens.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((c) => c.toUpperCase()), '#FFFFFF', '#F6E7C8']);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('iconSpec', () => {
  it.each(combos)('every mark stays in the maskable safe zone: $app $variant small=$small', ({ app, variant, small }) => {
    for (const m of iconSpec(app, variant, { small }).marks) {
      if (m.kind === 'line') {
        for (const [x, y] of m.points) expect(dist(x, y) + m.width / 2).toBeLessThanOrEqual(SAFE);
      } else {
        expect(dist(m.cx, m.cy) + m.r + m.width / 2).toBeLessThanOrEqual(SAFE);
      }
    }
  });

  it.each(combos)('uses only token colours: $app $variant', ({ app, variant }) => {
    const spec = iconSpec(app, variant);
    for (const c of [spec.tile, ...spec.marks.map((m) => m.color)]) expect(allowed).toContain(c.toUpperCase());
  });

  it.each(combos)('glyphs have 3:1 contrast with the tile: $app $variant', ({ app, variant }) => {
    const spec = iconSpec(app, variant);
    for (const m of spec.marks) expect(contrast(m.color, spec.tile)).toBeGreaterThanOrEqual(3);
  });

  it('staging differs from production', () => {
    for (const app of ['tasks', 'time'] as const) {
      expect(iconSpec(app, 'staging').tile).toBe('#F6E7C8');
      expect(iconSpec(app, 'production').tile).not.toBe('#F6E7C8');
    }
  });

  it('small multiplies line widths by 1.2', () => {
    const big = iconSpec('tasks').marks;
    const small = iconSpec('tasks', 'production', { small: true }).marks;
    big.forEach((m, i) => {
      const s = small[i]!;
      if (m.kind === 'line' && s.kind === 'line') expect(s.width).toBeCloseTo(m.width * 1.2);
    });
  });
});

describe('iconSvg', () => {
  const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"';

  it('square is full bleed, rounded has radius 22.5%', () => {
    const square = iconSvg('tasks', { shape: 'square' });
    const rounded = iconSvg('tasks', { shape: 'rounded' });
    expect(square.startsWith(head)).toBe(true);
    expect(rounded.startsWith(head)).toBe(true);
    expect(square).toContain('<rect width="512" height="512"');
    expect(square).not.toContain('rx');
    expect(rounded).toContain('rx="115.2"');
  });

  it('draws the ring and the tick for tasks', () => {
    const svg = iconSvg('tasks');
    expect(svg).toContain('<circle');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).toContain('192,262 236,304 320,210');
  });
});
