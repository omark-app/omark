import { FakeOneDrive, MemoryBlobs, OfflineError } from '@omark/storage';
import { describe, expect, it } from 'vitest';
import { fitWithin, pictureFile, pictureName, Pictures, savePicture } from './pictures.svelte.ts';

describe('fitWithin', () => {
  it('keeps a picture that fits, and scales the long side down to 1600 px', () => {
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
    expect(fitWithin(2000, 1000)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(1601, 3)).toEqual({ width: 1600, height: 3 });
    expect(fitWithin(5000, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe('pictureName', () => {
  it('names the picture from the area tag, numbered from the second', () => {
    expect(pictureName('climbing', 1)).toBe('climbing.jpg');
    expect(pictureName('climbing', 2)).toBe('climbing-2.jpg');
  });

  it('keeps a nested or odd tag to one plain file name', () => {
    expect(pictureName('Health/Sleep', 1)).toBe('health-sleep.jpg');
    expect(pictureName('..', 1)).toBe('area.jpg');
  });
});

describe('pictureFile', () => {
  it('loads only a plain name in images/', () => {
    expect(pictureFile('images/climbing.jpg')).toBe('climbing.jpg');
    expect(pictureFile('images/my%20place.jpg')).toBe('my place.jpg');
    expect(pictureFile('./images/climbing.jpg')).toBe('climbing.jpg');
    for (const p of ['climbing.jpg', 'images/a/b.jpg', '../images/x.jpg', 'https://example.com/x.jpg', 'images/..', 'images/', 'images/%2F.jpg']) {
      expect(pictureFile(p)).toBeNull();
    }
  });
});

describe('savePicture', () => {
  it('creates <tag>.jpg, then the next free number, and leaves the old ones', async () => {
    const images = new FakeOneDrive();
    const jpeg = new Blob([new Uint8Array([0xff, 0xd8])], { type: 'image/jpeg' });
    expect(await savePicture(images, 'climbing', jpeg)).toBe('images/climbing.jpg');
    expect(await savePicture(images, 'climbing', jpeg)).toBe('images/climbing-2.jpg');
    expect(await savePicture(images, 'climbing', jpeg)).toBe('images/climbing-3.jpg');
    expect(images.names()).toEqual(['climbing-2.jpg', 'climbing-3.jpg', 'climbing.jpg']);
  });

  it('fails offline without trying further names', async () => {
    const images = new FakeOneDrive();
    images.setOffline(true);
    await expect(savePicture(images, 'climbing', new Blob([]))).rejects.toBeInstanceOf(OfflineError);
  });
});

describe('Pictures', () => {
  const jpeg = (b: number) => new Blob([new Uint8Array([0xff, 0xd8, b])], { type: 'image/jpeg' });
  const urls = () => {
    const made: Blob[] = [];
    return { made, url: (b: Blob) => (made.push(b), `blob:${made.length}`) };
  };

  it('shows a picture from the folder and keeps a copy on this device', async () => {
    const images = new FakeOneDrive();
    await images.createBytes('climbing.jpg', jpeg(1));
    const keep = new MemoryBlobs();
    const u = urls();
    const p = new Pictures(images, keep, u.url);
    expect(p.url('images/climbing.jpg')).toBeUndefined();
    await p.load('images/climbing.jpg');
    expect(p.url('images/climbing.jpg')).toBe('blob:1');
    expect(await keep.get('climbing.jpg')).not.toBeNull();
  });

  it('shows the kept copy when the folder cannot be reached', async () => {
    const images = new FakeOneDrive();
    images.setOffline(true);
    const keep = new MemoryBlobs();
    await keep.put('climbing.jpg', jpeg(1));
    const p = new Pictures(images, keep, urls().url);
    await p.load('images/climbing.jpg');
    expect(p.url('images/climbing.jpg')).toBe('blob:1');
  });

  it('gives null for a picture that is missing, unreachable or not in images/, and tries again later', async () => {
    const images = new FakeOneDrive();
    const p = new Pictures(images, new MemoryBlobs(), urls().url);
    await p.load('images/missing.jpg');
    expect(p.url('images/missing.jpg')).toBeNull();
    await p.load('https://example.com/x.jpg');
    expect(p.url('https://example.com/x.jpg')).toBeNull();
    images.setOffline(true);
    await p.load('images/later.jpg');
    expect(p.url('images/later.jpg')).toBeNull();
    images.setOffline(false);
    await images.createBytes('later.jpg', jpeg(2));
    await p.load('images/later.jpg');
    expect(p.url('images/later.jpg')).toBe('blob:1');
  });

  it('shows the kept copy at once, then the folder\'s file when it differs (a name reused after a tidy-up)', async () => {
    const images = new FakeOneDrive();
    await images.createBytes('climbing.jpg', jpeg(2));
    const keep = new MemoryBlobs();
    await keep.put('climbing.jpg', jpeg(1));
    const u = urls();
    const p = new Pictures(images, keep, u.url);
    await p.load('images/climbing.jpg');
    expect(p.url('images/climbing.jpg')).toBe('blob:2');
    expect(new Uint8Array(await u.made[1]!.arrayBuffer())[2]).toBe(2);
    expect(new Uint8Array(await (await keep.get('climbing.jpg'))!.arrayBuffer())[2]).toBe(2);
  });

  it('a picture the browser can not show is dropped from this device and shows the plain colour', async () => {
    const images = new FakeOneDrive();
    await images.createBytes('climbing.jpg', jpeg(1));
    const keep = new MemoryBlobs();
    const p = new Pictures(images, keep, urls().url);
    await p.load('images/climbing.jpg');
    await p.failed('images/climbing.jpg');
    expect(p.url('images/climbing.jpg')).toBeNull();
    expect(await keep.get('climbing.jpg')).toBeNull();
  });

  it('adds a picture: saved under the next free name and shown at once', async () => {
    const images = new FakeOneDrive();
    await images.createBytes('climbing.jpg', jpeg(1));
    const keep = new MemoryBlobs();
    const p = new Pictures(images, keep, urls().url);
    const path = await p.add('climbing', jpeg(3));
    expect(path).toBe('images/climbing-2.jpg');
    expect(p.url(path)).toBe('blob:1');
    expect(await keep.get('climbing-2.jpg')).not.toBeNull();
  });
});
