import { LANDED_LOOKBACK } from './adapter.ts';

/**
 * `StorageAdapter.landed` for a storage that lists a file's versions with their sizes (#161): walks `versions`,
 * newest first, at most `LANDED_LOOKBACK` of them, and downloads only a version whose size is the UTF-8 length of
 * one of `texts` or of `base`. The first one whose bytes equal a text gives that text; one equal to `base` ends
 * the walk with null, since a write sent on that base cannot have landed before it.
 */
export async function newestLanded<V extends { size: number }>(
  texts: string[],
  base: string,
  versions: V[],
  content: (version: V) => Promise<Uint8Array>,
): Promise<string | null> {
  const encode = (text: string) => ({ text, bytes: new TextEncoder().encode(text) });
  const wanted = texts.map(encode);
  const stop = encode(base);
  for (const version of versions.slice(0, LANDED_LOOKBACK)) {
    const sized = wanted.filter((w) => w.bytes.length === version.size);
    const atBase = stop.bytes.length === version.size;
    if (sized.length === 0 && !atBase) continue;
    const got = await content(version);
    const hit = sized.find((w) => sameBytes(w.bytes, got));
    if (hit) return hit.text;
    if (atBase && sameBytes(stop.bytes, got)) return null;
  }
  return null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
