import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTPUTS, sourceHash } from './outputs.ts';

const root = new URL('../../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root));
const pngs = OUTPUTS.filter((o) => o.path.endsWith('.png'));
const svgs = OUTPUTS.filter((o) => o.path.endsWith('.svg'));
const sources = (): Record<string, string> => JSON.parse(read('brand/png/sources.json').toString('utf8'));

describe('outputs', () => {
  it.each(pngs.map((o) => [o.path, o] as const))('every PNG exists at its size: %s', (path, o) => {
    expect(existsSync(new URL(path, root)), path).toBe(true);
    const b = read(path);
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual(o.size);
  });

  it.each(pngs.map((o) => [o.path, o] as const))('every PNG was made from the current source: %s', (path, o) => {
    expect(sources()[path], 'stale: run pnpm --filter @omark/brand render').toBe(sourceHash(o));
  });

  it('full-bleed where iOS and Android mask', () => {
    const named = (re: RegExp) => OUTPUTS.filter((o) => re.test(o.path));
    const full = [...named(/apple-touch-icon\.png$/), ...named(/-maskable\.png$/)];
    const round = [...named(/icon-192\.png$/), ...named(/icon-512\.png$/)];
    expect(full.length).toBeGreaterThan(0);
    expect(round.length).toBeGreaterThan(0);
    for (const o of full) expect(o.svg(), o.path).not.toContain('rx=');
    for (const o of round) expect(o.svg(), o.path).toContain('rx="115.2"');
  });

  it('PNG colour type: RGB where iOS and Android mask, RGBA elsewhere', () => {
    const colourType = (path: string) => read(path).readUInt8(25); // IHDR colour type
    const named = (re: RegExp) => pngs.filter((o) => re.test(o.path));
    const rgb = [...named(/apple-touch-icon\.png$/), ...named(/-maskable\.png$/)];
    const rgba = [...named(/icon-192\.png$/), ...named(/icon-512\.png$/), ...named(/favicon-32\.png$/)];
    expect(rgb.length).toBeGreaterThan(0);
    expect(rgba.length).toBeGreaterThan(0);
    for (const o of rgb) expect(colourType(o.path), o.path).toBe(2);
    for (const o of rgba) expect(colourType(o.path), o.path).toBe(6);
  });

  it('the landing page favicon is drawn here, not copied by hand', () => {
    expect(svgs.map((o) => o.path)).toContain('apps/site/public/favicon.svg');
  });

  it('the landing page logo and app icons are drawn here too', () => {
    const paths = svgs.map((o) => o.path);
    for (const app of ['omark', 'tasks', 'time']) expect(paths).toContain(`apps/site/public/img/icon-${app}.svg`);
  });

  it.each(svgs.map((o) => [o.path, o] as const))('every SVG output on disk matches iconSvg: %s', (path, o) => {
    expect(read(path).toString('utf8')).toBe(o.svg());
  });
});
