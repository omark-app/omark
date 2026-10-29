import { PreconditionFailedError } from '@omark/storage';
import type { BinaryStore, BlobKeep } from '@omark/storage';

/** An added picture's long side, at most (Goals spec 7.1). */
export const MAX_SIDE = 1600;
/** Names tried before giving up (`climbing.jpg` … `climbing-50.jpg`). */
const MAX_NAMES = 50;

/** The size a picture is saved at: as it is when it fits, else scaled so its long side is `max`. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The `n`th name for an area's picture: `climbing.jpg`, `climbing-2.jpg`, … A nested or odd tag becomes one plain name. */
export function pictureName(tag: string, n: number): string {
  const stem = tag.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'area';
  return n === 1 ? `${stem}.jpg` : `${stem}-${n}.jpg`;
}

/** The file in `images/` a picture path names, or null for any other path (a URL, another folder), which is not loaded. */
export function pictureFile(path: string): string | null {
  const m = /^(?:\.\/)?images\/([^/\\]+)$/.exec(path.trim());
  if (!m) return null;
  let name = m[1]!;
  try {
    name = decodeURIComponent(name);
  } catch {
    // Not percent-encoded after all: the name as written.
  }
  return name === '.' || name === '..' || /[/\\]/.test(name) ? null : name;
}

/** Saves a picture under the first free name for `tag` and gives its path from `goals.md` (`images/climbing.jpg`). */
export async function savePicture(images: BinaryStore, tag: string, jpeg: Blob): Promise<string> {
  for (let n = 1; n <= MAX_NAMES; n++) {
    const name = pictureName(tag, n);
    try {
      await images.createBytes(name, jpeg);
      return `images/${name}`;
    } catch (e) {
      if (!(e instanceof PreconditionFailedError)) throw e;
    }
  }
  throw new Error(`No free picture name for ${tag}`);
}

/** A picture file as a JPEG at most 1600 px on its long side, turned upright, on white where it was see-through. */
export async function toJpeg(file: Blob): Promise<Blob> {
  // Browsers from before 'from-image' reject the option; they turn the picture upright on their own.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch((e: unknown) => {
    if (e instanceof TypeError) return createImageBitmap(file);
    throw e;
  });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be saved as JPEG'))), 'image/jpeg', 0.85);
  });
}

/**
 * Goals' pictures (G.2b): read from `goals/images/` and kept on this device, so a card shows its picture offline.
 * A kept copy shows at once and the folder's file is read after it, replacing it when they differ (a name can be
 * taken again once its file is deleted by hand). `url` is undefined until a load has been tried, then an object
 * URL, or null (missing, unreachable, not in `images/`, or not a picture the browser shows; tried again on the
 * next `load`).
 */
export class Pictures {
  private urls = $state<Record<string, string | null>>({});
  private loading = new Set<string>();

  constructor(
    private readonly images: BinaryStore,
    private readonly keep: BlobKeep,
    private readonly objectUrl: (b: Blob) => string = (b) => URL.createObjectURL(b),
  ) {}

  url(path: string): string | null | undefined {
    return this.urls[path];
  }

  async load(path: string): Promise<void> {
    if (typeof this.urls[path] === 'string' || this.loading.has(path)) return;
    this.loading.add(path);
    try {
      await this.fetch(path);
    } finally {
      this.loading.delete(path);
    }
  }

  /** The browser could not show the picture (not an image, or cut short): the plain colour, and no copy kept. */
  async failed(path: string): Promise<void> {
    this.show(path, null);
    const name = pictureFile(path);
    if (name !== null) await this.keep.delete(name).catch(() => {});
  }

  /** Saves `jpeg` (from `toJpeg`) as the area's picture and gives its path for `goals.md`. */
  async add(tag: string, jpeg: Blob): Promise<string> {
    const path = await savePicture(this.images, tag, jpeg);
    await this.keep.put(pictureFile(path)!, jpeg).catch(() => {});
    this.show(path, jpeg);
    return path;
  }

  private async fetch(path: string): Promise<void> {
    const name = pictureFile(path);
    if (name === null) return this.show(path, null);
    const kept = await this.keep.get(name).catch(() => null);
    if (kept) this.show(path, kept);
    const read = await this.images.readBytes(name).catch(() => undefined);
    // Unreachable: the kept copy, if any, stays.
    if (read === undefined) return kept ? undefined : this.show(path, null);
    if (read === null) return this.show(path, null);
    if (kept && (await same(kept, read))) return;
    await this.keep.put(name, read).catch(() => {});
    this.show(path, read);
  }

  /** Shows `blob` for `path` (null: none), letting go of the object URL it showed before. */
  private show(path: string, blob: Blob | null): void {
    const old = this.urls[path];
    this.urls[path] = blob && this.objectUrl(blob);
    if (old) URL.revokeObjectURL(old);
  }
}

async function same(a: Blob, b: Blob): Promise<boolean> {
  if (a.size !== b.size) return false;
  const [x, y] = (await Promise.all([a.arrayBuffer(), b.arrayBuffer()])).map((buf) => new Uint8Array(buf));
  return x!.every((v, i) => v === y![i]);
}
