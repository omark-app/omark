const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Accepts base64url and plain base64 (what `openssl rand -base64 32` prints). Throws on anything else. */
export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** `bytes` of randomness as base64url: 32 bytes make a 43-character state or PKCE verifier. */
export const randomToken = (bytes = 32): string => toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

/** The S256 PKCE challenge for `verifier`. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
}

/** The AES-256-GCM key from the `COOKIE_KEY` secret: 32 random bytes, base64-encoded. */
export async function importCookieKey(secret: string): Promise<CryptoKey> {
  const raw = fromBase64Url(secret.trim());
  if (raw.length !== 32) throw new Error('COOKIE_KEY must be 32 bytes, base64-encoded');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

const IV_BYTES = 12;

/**
 * Encrypts `value` as JSON with a fresh IV, as base64url(iv || ciphertext || tag). `purpose` (the cookie's
 * name) is bound in as associated data, so one cookie's value never opens as another's.
 */
export async function seal(key: CryptoKey, purpose: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = encoder.encode(JSON.stringify(value));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) }, key, data),
  );
  const out = new Uint8Array(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return toBase64Url(out);
}

/** The value `seal` sealed for `purpose`, or null when it is missing, malformed, tampered with or under another key. */
export async function unseal<T>(key: CryptoKey, purpose: string, text: string | null | undefined): Promise<T | null> {
  if (!text) return null;
  try {
    const bytes = fromBase64Url(text);
    if (bytes.length <= IV_BYTES) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: encoder.encode(purpose) },
      key,
      bytes.slice(IV_BYTES),
    );
    return JSON.parse(decoder.decode(plain)) as T;
  } catch {
    return null;
  }
}
