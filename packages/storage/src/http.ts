import { AuthRequiredError, OfflineError } from './errors.ts';

/** A response whose body has been read in full (`text` is `bytes` decoded as UTF-8, without a BOM). */
export interface Reply {
  status: number;
  ok: boolean;
  text: string;
  bytes: Uint8Array;
}

export interface Http {
  /** Authenticated call: one retry with a fresh token on 401. */
  authed(url: string, init: RequestInit): Promise<Reply>;
  /** One request without a token. */
  send(url: string, init: RequestInit): Promise<Reply>;
}

export interface HttpOptions {
  /** `fresh`: the server rejected the last token, so get a new one. */
  getToken: (opts?: { fresh?: boolean }) => Promise<string>;
  fetch?: typeof fetch;
  /** Per request, body included; a request that takes longer fails with `OfflineError`. */
  timeoutMs: number;
}

/** The request code the drive adapters share. */
export function createHttp(opts: HttpOptions): Http {
  const getToken = opts.getToken;
  const fetchFn = opts.fetch ?? ((...args) => globalThis.fetch(...args));
  const timeoutMs = opts.timeoutMs;

  async function authed(url: string, init: RequestInit): Promise<Reply> {
    for (let attempt = 0; attempt < 2; attempt++) {
      // A token refresh can stall too, so the token gets the same time limit as a request.
      const token = await withTimeout(() => getToken(attempt > 0 ? { fresh: true } : undefined)).catch((e: unknown) => {
        // Whatever kept the token from coming, it was the sign-in server that could not be reached (#157).
        throw e instanceof OfflineError ? new OfflineError(e.message, 'signin') : e;
      });
      const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
      const res = await send(url, { ...init, headers });
      if (res.status !== 401) return res;
    }
    throw new AuthRequiredError('Sign-in required');
  }

  /** One request, body read in full, within the time limit. A fetch TypeError means the network is down. */
  async function send(url: string, init: RequestInit): Promise<Reply> {
    try {
      return await withTimeout(async (signal) => {
        const res = await fetchFn(url, { ...init, signal });
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, ok: res.ok, text: new TextDecoder().decode(bytes), bytes };
      });
    } catch (e) {
      if (e instanceof TypeError) throw new OfflineError('Network unreachable');
      throw e;
    }
  }

  /**
   * Runs `work` within `timeoutMs`. On timeout its signal is aborted and the call fails with
   * `OfflineError`, even if `work` ignores the abort.
   */
  async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new OfflineError('Request timed out'));
      }, timeoutMs);
    });
    const run = Promise.resolve().then(() => work(controller.signal)); // a synchronous throw rejects too
    run.catch(() => {}); // a late failure after the timeout must not go unhandled
    try {
      return await Promise.race([run, timedOut]);
    } catch (e) {
      if (!(e instanceof OfflineError) && controller.signal.aborted) throw new OfflineError('Request timed out');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return { authed, send };
}
