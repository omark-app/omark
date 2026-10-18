export interface CookieOptions {
  path: string;
  /** Seconds; 0 deletes the cookie. */
  maxAge: number;
  /** Default true: JavaScript cannot read the cookie. */
  httpOnly?: boolean;
}

/**
 * A host-only (no Domain), Secure, SameSite=Lax cookie. Lax rather than Strict: the session is set on the
 * return from Microsoft, a cross-site redirect chain, and Lax already keeps it off cross-site POSTs and
 * subresource requests (the token endpoint also checks Origin and a custom header).
 */
export function serializeCookie(name: string, value: string, opts: CookieOptions): string {
  const parts = [`${name}=${value}`, `Path=${opts.path}`, `Max-Age=${opts.maxAge}`, 'Secure', 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  return parts.join('; ');
}

export function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const pair of (header ?? '').split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    // The first of two same-named cookies is the one with the longer (more specific) path.
    if (name && !cookies.has(name)) cookies.set(name, pair.slice(eq + 1).trim());
  }
  return cookies;
}

/** Characters per cookie, well under the ~4 KB browsers allow per cookie including its name and attributes. */
export const CHUNK_SIZE = 3500;
/** Chunks a value may span. Every write clears the unused ones, so a shorter value leaves no stale tail. */
export const MAX_CHUNKS = 4;

/**
 * Splits `value` across `name0`, `name1`, ... (a Microsoft refresh token, sealed, can run past one cookie),
 * and deletes the chunks it no longer needs. Throws if it needs more than `MAX_CHUNKS`.
 */
export function chunkedCookies(name: string, value: string, opts: CookieOptions): string[] {
  const count = Math.ceil(value.length / CHUNK_SIZE);
  if (count > MAX_CHUNKS) throw new Error(`${name} needs ${count} cookies`);
  const out: string[] = [];
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    out.push(i < count ? serializeCookie(`${name}${i}`, part, opts) : serializeCookie(`${name}${i}`, '', { ...opts, maxAge: 0 }));
  }
  return out;
}

/** Deletes every chunk of `name`. */
export const clearChunkedCookies = (name: string, opts: Omit<CookieOptions, 'maxAge'>): string[] =>
  Array.from({ length: MAX_CHUNKS }, (_, i) => serializeCookie(`${name}${i}`, '', { ...opts, maxAge: 0 }));

/** The value `chunkedCookies` split, joined from `name0` up to the first missing chunk; null if there is none. */
export function readChunkedCookie(cookies: Map<string, string>, name: string): string | null {
  let value = '';
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = cookies.get(`${name}${i}`);
    if (!part) break;
    value += part;
  }
  return value || null;
}
