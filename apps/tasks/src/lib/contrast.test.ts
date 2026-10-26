import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The habit violet (#44) has to read on every row background, as the amber of Important does. */

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'), 'utf8');

/** The `--name: #hex` pairs of the block that starts at `opener`. */
function block(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  if (start < 0) throw new Error(`no ${opener} in tokens.css`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1]!, m[2]!]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const themes: [string, Record<string, string>, string][] = [
  ['light', block(':root {'), '--habit-ink'],
  ['dark (system)', block(':root:not([data-theme="light"])'), '--habit'],
  ['dark (chosen)', block(':root[data-theme="dark"]'), '--habit'],
];

describe.each(themes)('habit violet, %s', (_, vars, text) => {
  it.each(['--surface', '--sel', '--habit-soft'])(`${text} on %s is at least 4.5:1`, (bg) => {
    expect(vars[text], `${text} defined`).toBeDefined();
    expect(vars[bg], `${bg} defined`).toBeDefined();
    expect(ratio(vars[text]!, vars[bg]!)).toBeGreaterThanOrEqual(4.5);
  });
});
