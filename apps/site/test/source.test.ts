import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('public/_headers', () => {
  const text = readFileSync(join(root, 'public/_headers'), 'utf8');
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  it('applies to every path', () => {
    expect(lines).toContain('/*');
  });

  it('sets a CSP that allows only the site itself', () => {
    expect(lines).toContain(
      "Content-Security-Policy: default-src 'self'; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
  });

  it('sets nosniff and the referrer policy', () => {
    expect(lines).toContain('X-Content-Type-Options: nosniff');
    expect(lines).toContain('Referrer-Policy: strict-origin-when-cross-origin');
  });
});

describe('src files', () => {
  const sources = filesUnder(join(root, 'src')).filter((f) => /\.(html|css|svg)$/.test(f));

  it('are found', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s has no script and no outside address', (file) => {
    const text = readFileSync(file, 'utf8');
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/src=["']?https?:/i);
    expect(text).not.toMatch(/<link[^>]*href=["']?https?:/i);
    expect(text).not.toMatch(/url\(\s*["']?https?:/i);
  });
});

// Cloudflare Pages serves no file over 25 MiB, so the walkthrough film (#130) and anything after it must stay under.
describe('site files', () => {
  it.each([...filesUnder(join(root, 'src')), ...filesUnder(join(root, 'public'))])('%s fits in a Pages file', (file) => {
    expect(statSync(file).size).toBeLessThan(25 * 1024 * 1024);
  });

  it('include the walkthrough film and its still', () => {
    // Forward slashes on every OS: Windows paths use backslashes (#137).
    const names = filesUnder(join(root, 'src')).map((f) => f.slice(root.length).replaceAll('\\', '/'));
    expect(names).toContain('src/media/omark-film.mp4');
    expect(names).toContain('src/media/omark-film.webp');
  });
});
