import { describe, expect, it } from 'vitest';
import { quickXorHash } from '../src/quick-xor-hash.ts';

const fromBase64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** The hash as plain arithmetic: byte i XORed into a 160-bit number rotated by 11·i, then the length. */
function reference(bytes: Uint8Array): string {
  const MASK = (1n << 160n) - 1n;
  let state = 0n;
  bytes.forEach((b, i) => {
    const at = BigInt((11 * i) % 160);
    const v = BigInt(b) << at;
    state ^= (v | (v >> 160n)) & MASK;
  });
  state ^= BigInt(bytes.length) << 96n;
  let binary = '';
  for (let k = 0; k < 20; k++) binary += String.fromCharCode(Number((state >> BigInt(8 * k)) & 0xffn));
  return btoa(binary);
}

describe('quickXorHash', () => {
  it('matches published test vectors', () => {
    // Vectors from rclone's quickxorhash tests (input and hash both base64).
    expect(quickXorHash(new Uint8Array())).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(quickXorHash(fromBase64('Sg=='))).toBe('SgAAAAAAAAAAAAAAAQAAAAAAAAA=');
    expect(quickXorHash(fromBase64('tbQ='))).toBe('taAFAAAAAAAAAAAAAgAAAAAAAAA=');
    expect(quickXorHash(fromBase64('0pZP'))).toBe('0rDEEwAAAAAAAAAAAwAAAAAAAAA=');
    expect(quickXorHash(fromBase64('jRRDVA=='))).toBe('jaDAEKgAAAAAAAAABAAAAAAAAAA=');
  });

  it('agrees with the plain rotate-and-XOR definition for long inputs that wrap many times', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed & 0xff;
    };
    for (const n of [1, 5, 6, 12, 159, 160, 161, 319, 320, 1000, 16_638]) {
      const bytes = Uint8Array.from({ length: n }, rnd);
      expect(quickXorHash(bytes), `n = ${n}`).toBe(reference(bytes));
    }
  });

  it('differs for a one-character date change, which keeps the size', () => {
    const enc = new TextEncoder();
    expect(quickXorHash(enc.encode('- [ ] leki 📅 2026-10-18\n'))).not.toBe(quickXorHash(enc.encode('- [ ] leki 📅 2026-10-20\n')));
  });
});
