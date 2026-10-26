// Every file the icon family produces. render.ts draws them; outputs.test.ts checks they are fresh.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { iconSvg, type App, type Shape, type Variant } from './family.ts';

export interface Output {
  path: string; // from the repo root
  size: [number, number];
  svg: () => string; // the markup to render: SVG for icons, HTML for the social preview
}

export function sourceHash(o: Output): string {
  return createHash('sha256').update(`${o.size}:${o.svg()}`).digest('hex');
}

const icon = (app: App, variant: Variant, shape: Shape, small = false) => () => iconSvg(app, { variant, shape, small });

function appSet(app: App, variant: Variant, dir: string): Output[] {
  return [
    { path: `${dir}/icon-192.png`, size: [192, 192], svg: icon(app, variant, 'rounded') },
    { path: `${dir}/icon-512.png`, size: [512, 512], svg: icon(app, variant, 'rounded') },
    { path: `${dir}/icon-512-maskable.png`, size: [512, 512], svg: icon(app, variant, 'square') },
    { path: `${dir}/apple-touch-icon.png`, size: [180, 180], svg: icon(app, variant, 'square') },
    { path: `${dir}/favicon-32.png`, size: [32, 32], svg: icon(app, variant, 'rounded', true) },
    { path: `${dir}/favicon.svg`, size: [32, 32], svg: icon(app, variant, 'rounded', true) },
  ];
}

export function socialHtml(): string {
  const html = readFileSync(new URL('./social.html', import.meta.url), 'utf8');
  const dir = dirname(createRequire(import.meta.url).resolve('@fontsource/geist/package.json'));
  // Inline the fonts: a page set with setContent cannot load file:// URLs, and paths would change the hash.
  const font = (w: number) =>
    `data:font/woff2;base64,${readFileSync(join(dir, 'files', `geist-latin-${w}-normal.woff2`)).toString('base64')}`;
  const t = (app: App) => `data:image/svg+xml;base64,${Buffer.from(iconSvg(app, { shape: 'rounded' })).toString('base64')}`;
  return html
    .replaceAll('{{font400}}', font(400))
    .replaceAll('{{font700}}', font(700))
    .replaceAll('{{tasks}}', t('tasks'))
    .replaceAll('{{time}}', t('time'));
}

export const OUTPUTS: Output[] = [
  ...appSet('tasks', 'production', 'apps/tasks/public/icons'),
  ...appSet('tasks', 'staging', 'apps/tasks/public/icons/staging'),
  ...appSet('time', 'production', 'brand/png/time'),
  ...appSet('omark', 'production', 'brand/png/omark'),
  { path: 'brand/png/omark-avatar-500.png', size: [500, 500], svg: icon('omark', 'production', 'square') },
  { path: 'brand/png/social-preview.png', size: [1280, 640], svg: socialHtml },
  ...(['omark-mark', 'tasks', 'time'] as const).map((n) => ({
    path: `brand/svg/${n}.svg`,
    size: [512, 512] as [number, number],
    svg: icon(n === 'omark-mark' ? 'omark' : n, 'production', 'square'),
  })),
  ...(['omark', 'tasks', 'time'] as const).map((app) => ({
    path: `brand/svg/favicon-${app}.svg`,
    size: [32, 32] as [number, number],
    svg: icon(app, 'production', 'rounded', true),
  })),
];
