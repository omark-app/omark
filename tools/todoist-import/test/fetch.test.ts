import { describe, expect, it } from 'vitest';
import { fetchAllTasks } from '../src/fetch.ts';

const task = (id: string) => ({ id, content: id, description: '', parent_id: null, due: null });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Unauthorized' });

describe('fetchAllTasks', () => {
  it('follows next_cursor and sends the bearer token', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    const f = (async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), auth: new Headers(init.headers).get('Authorization') });
      return calls.length === 1
        ? json({ results: [task('1')], next_cursor: 'abc' })
        : json({ results: [task('2')], next_cursor: null });
    }) as unknown as typeof fetch;
    const out = await fetchAllTasks('SECRET', f);
    expect(out.map((t) => t.id)).toEqual(['1', '2']);
    expect(calls[0]!.url).toContain('https://api.todoist.com/api/v1/tasks');
    expect(calls[1]!.url).toContain('cursor=abc');
    expect(calls[0]!.auth).toBe('Bearer SECRET');
  });

  it('errors clearly without echoing the token', async () => {
    const f = (async () => json({}, 401)) as unknown as typeof fetch;
    const err = await fetchAllTasks('SECRET', f).catch((e: Error) => e);
    expect((err as Error).message).toContain('401');
    expect((err as Error).message).not.toContain('SECRET');
  });
});
