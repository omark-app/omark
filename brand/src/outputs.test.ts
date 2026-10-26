import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { iconSvg } from './family.ts';
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

  it.each(svgs.map((o) => [o.path, o] as const))('every SVG output on disk matches iconSvg: %s', (path, o) => {
    expect(read(path).toString('utf8')).toBe(o.svg());
    expect(o.svg().startsWith('<svg')).toBe(true);
    expect(o.svg()).toContain(iconSvg('omark').slice(0, 20));
  });
});
