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
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
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
 * A file is never replaced (a new picture gets a new name), so a kept copy stays right. `url` is undefined until
 * a load has been tried, then an object URL, or null (missing, unreachable, or not in `images/`; tried again on
 * the next `load`).
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
      this.urls[path] = await this.fetch(path);
    } finally {
      this.loading.delete(path);
    }
  }

  /** Saves `jpeg` (from `toJpeg`) as the area's picture and gives its path for `goals.md`. */
  async add(tag: string, jpeg: Blob): Promise<string> {
    const path = await savePicture(this.images, tag, jpeg);
    await this.keep.put(pictureFile(path)!, jpeg).catch(() => {});
    this.urls[path] = this.objectUrl(jpeg);
    return path;
  }

  private async fetch(path: string): Promise<string | null> {
    const name = pictureFile(path);
    if (name === null) return null;
    const kept = await this.keep.get(name).catch(() => null);
    if (kept) return this.objectUrl(kept);
    const read = await this.images.readBytes(name).catch(() => null);
    if (!read) return null;
    await this.keep.put(name, read).catch(() => {});
    return this.objectUrl(read);
  }
}
