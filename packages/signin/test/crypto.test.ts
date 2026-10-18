import { describe, expect, it } from 'vitest';
import { fromBase64Url, importCookieKey, pkceChallenge, randomToken, seal, toBase64Url, unseal } from '../src/crypto.ts';

const key = () => importCookieKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(1))));

describe('seal / unseal', () => {
  it('round-trips a value, with a fresh IV each time', async () => {
    const k = await key();
    const a = await seal(k, 'p', { rt: 'token', exp: 1 });
    const b = await seal(k, 'p', { rt: 'token', exp: 1 });
    expect(a).not.toBe(b);
    expect(await unseal(k, 'p', a)).toEqual({ rt: 'token', exp: 1 });
  });

  it('rejects any flipped byte, a truncation, another purpose, another key and junk', async () => {
    const k = await key();
    const sealed = await seal(k, 'p', { rt: 'token' });
    const bytes = fromBase64Url(sealed);
    for (const i of [0, 12, bytes.length - 1]) {
      const copy = bytes.slice();
      copy[i]! ^= 1;
      expect(await unseal(k, 'p', toBase64Url(copy))).toBeNull();
    }
    expect(await unseal(k, 'p', sealed.slice(0, -4))).toBeNull();
    expect(await unseal(k, 'q', sealed)).toBeNull();
    const other = await importCookieKey(toBase64Url(new Uint8Array(32).fill(2)));
    expect(await unseal(other, 'p', sealed)).toBeNull();
    for (const junk of ['', '!!!', 'AAAA', null, undefined]) expect(await unseal(k, 'p', junk)).toBeNull();
  });
});

describe('importCookieKey', () => {
  it('takes 32 bytes as base64 or base64url and refuses other lengths', async () => {
    await expect(key()).resolves.toBeDefined();
    await expect(importCookieKey(toBase64Url(new Uint8Array(32).fill(255)))).resolves.toBeDefined();
    await expect(importCookieKey(btoa('short'))).rejects.toThrow('32 bytes');
  });
});

describe('PKCE', () => {
  it('derives the RFC 7636 S256 challenge', async () => {
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('makes 43-character url-safe verifiers', () => {
    expect(randomToken()).toMatch(/^[\w-]{43}$/);
  });
});
