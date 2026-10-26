// Draws every output with Chromium, then writes sources.json and contact-sheet.html.
// Run with: pnpm --filter @omark/brand render
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { OUTPUTS, sourceHash, type Output } from './outputs.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const at = (p: string) => root + p;
const write = (p: string, data: string | Buffer) => {
  mkdirSync(dirname(at(p)), { recursive: true });
  writeFileSync(at(p), data);
};

const browser = await chromium.launch();
const page = await browser.newPage();
const hashes: Record<string, string> = {};

for (const o of OUTPUTS) {
  const markup = o.svg();
  if (o.path.endsWith('.svg')) {
    write(o.path, markup);
    continue;
  }
  const [width, height] = o.size;
  const isSocial = o.path.endsWith('social-preview.png');
  await page.setViewportSize({ width, height });
  if (isSocial) {
    await page.setContent(markup);
    await page.evaluate('document.fonts.ready'); // a string: this package has no DOM types
  } else {
    // The SVG fills the page; a transparent body keeps rounded corners see-through.
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${markup}`,
    );
  }
  const square = !markup.includes('rx=');
  write(o.path, await page.screenshot({ omitBackground: !isSocial && !square }));
  hashes[o.path] = sourceHash(o);
}
await browser.close();

write('brand/png/sources.json', JSON.stringify(hashes, null, 2) + '\n');

const pngs = OUTPUTS.filter((o) => o.path.endsWith('.png'));
const cell = (o: Output) => {
  const src = relative(at('brand'), at(o.path)).replaceAll('\\', '/');
  return `<figure><img src="${src}" width="${o.size[0]}" height="${o.size[1]}" alt=""><figcaption>${o.path}</figcaption></figure>`;
};
// Favicons at the size a browser tab shows them.
const tabIcon = (o: Output) => {
  const src = relative(at('brand'), at(o.path)).replaceAll('\\', '/');
  return `<figure><img src="${src}" width="16" height="16" alt=""><figcaption>${o.path} at 16 px</figcaption></figure>`;
};
const tabIcons = OUTPUTS.filter((o) => /\/favicon(-32\.png|\.svg)$/.test(o.path) && o.path.startsWith('brand/png/'));
const sheet = (cls: string) =>
  `<section class="${cls}">${pngs.map(cell).join('')}</section><section class="${cls}">${tabIcons.map(tabIcon).join('')}</section>`;
write(
  'brand/contact-sheet.html',
  `<!doctype html>
<meta charset="utf-8">
<title>Omark icons</title>
<style>
body { margin: 0; font: 12px ui-monospace, Consolas, monospace; }
section { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-end; padding: 24px; }
.light { background: #F2F4F7; color: #151A22; }
.dark { background: #0D1015; color: #E3E6EB; }
figure { margin: 0; }
figcaption { margin-top: 6px; }
</style>
${sheet('light')}
${sheet('dark')}
`,
);
console.log(`Rendered ${pngs.length} PNGs.`);
