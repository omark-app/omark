import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Launch spec 6.1: after the cutover nothing outside doc/history/ names the founder's own deployment: his
// domain, folder, GitHub login or Entra tenant and app ids. The pattern is built from pieces so this file
// doesn't match itself.
const OWNER = new RegExp(['ali' + 'pka', 'A' + 'LAI', '47bed' + '4a7', 'fabcb' + '19d', '00596' + 'fbc'].join('|'), 'i');
/** Kept on purpose: the maintainer's login decides who reviews (GOVERNANCE.md), until a team takes it over. */
const ALLOWED = new Set(['.github/CODEOWNERS']);
const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|mp4|zip)$/i;

const root = new URL('../../../', import.meta.url);
const tracked = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f !== '' && !f.startsWith('doc/history/') && !BINARY.test(f) && !ALLOWED.has(f))
    .filter((f) => existsSync(new URL(f, root)));

describe('owner values', () => {
  it('appear nowhere outside doc/history/', () => {
    const files = tracked();
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((f) =>
      readFileSync(new URL(f, root), 'utf8')
        .split('\n')
        .flatMap((line, i) => (OWNER.test(line) ? [`${f}:${i + 1}`] : [])),
    );
    expect(hits).toEqual([]);
  });
});
