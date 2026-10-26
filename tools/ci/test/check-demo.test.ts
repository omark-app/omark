import { describe, expect, it } from 'vitest';
import { checkDemo } from '../check-demo.mjs';

const URL_ = 'https://demo.example.test';
const html = (status = 200) => new Response('<!doctype html><title>Omark Tasks</title>', { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const helperJson = (status: number) => new Response('{"error":"not_found"}', { status, headers: { 'Content-Type': 'application/json' } });
const redirect = () => new Response(null, { status: 302, headers: { Location: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize' } });

/** Answers `/` and `/api/auth/login` with the next of their answers (the last one repeats). */
function setup(answers: { home: (() => Response)[]; login: (() => Response)[] }) {
  const calls: { url: string; redirect?: string }[] = [];
  const seen = { home: 0, login: 0 };
  let sleeps = 0;
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, redirect: init?.redirect });
    const which = url.endsWith('/api/auth/login') ? 'login' : 'home';
    const list = answers[which];
    return list[Math.min(seen[which]++, list.length - 1)]!();
  }) as typeof fetch;
  const sleep = async () => {
    sleeps++;
  };
  return { calls, sleeps: () => sleeps, fake, sleep };
}

describe('checkDemo', () => {
  it('passes when the page is served and /api/auth gives 404', async () => {
    const s = setup({ home: [() => html()], login: [() => new Response('', { status: 404 })] });
    const r = await checkDemo({ url: `${URL_}/`, fetch: s.fake, sleep: s.sleep });
    expect(r).toEqual({ ok: true, message: 'Demo OK' });
    expect(s.calls).toEqual([
      { url: `${URL_}/`, redirect: 'manual' },
      { url: `${URL_}/api/auth/login`, redirect: 'manual' },
    ]);
  });

  it('passes when /api/auth gets the app page (Pages serves index.html for unknown paths)', async () => {
    const s = setup({ home: [() => html()], login: [() => html()] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
  });

  it('fails when the sign-in helper answers, saying functions/ shipped', async () => {
    const s = setup({ home: [() => html()], login: [redirect] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('/api/auth/login');
    expect(r.message).toContain('functions/');
  });

  it('fails on a JSON answer from /api/auth', async () => {
    const s = setup({ home: [() => html()], login: [() => helperJson(404)] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
  });

  it('fails when the page is not HTML', async () => {
    const s = setup({ home: [() => helperJson(200)], login: [() => new Response('', { status: 404 })] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.message).toContain(`${URL_}/`);
  });

  it('retries until the new deploy reaches the domain', async () => {
    const s = setup({ home: [() => new Response('', { status: 522 }), () => new Response('', { status: 522 }), () => html()], login: [() => new Response('', { status: 404 })] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(true);
    expect(s.sleeps()).toBe(2);
  });

  it('fails after the last attempt with what was wrong', async () => {
    const s = setup({ home: [() => new Response('', { status: 522 })], login: [() => new Response('', { status: 404 })] });
    const r = await checkDemo({ url: URL_, fetch: s.fake, sleep: s.sleep });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('522');
    expect(s.sleeps()).toBe(5);
  });

  it('fails when the site cannot be reached', async () => {
    const fake = (async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }) as typeof fetch;
    const r = await checkDemo({ url: URL_, fetch: fake, attempts: 2, sleep: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('ENOTFOUND');
  });
});
