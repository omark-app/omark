import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, OfflineError } from '../src/errors.ts';
import { OneDriveAdapter } from '../src/onedrive-adapter.ts';
import { adapterContract } from './adapter-contract.ts';
import { GraphFake } from './graph-fake.ts';

const FOLDER = 'ALAI/TaskApp';
function setup(getToken: () => Promise<string> = async () => 'tok') {
  const graph = new GraphFake(FOLDER);
  const adapter = new OneDriveAdapter({ folder: FOLDER, getToken, fetch: graph.fetch as typeof fetch });
  return { graph, adapter };
}

adapterContract(() => {
  const { graph, adapter } = setup();
  return {
    adapter,
    external: (n, t) => graph.external(n, t),
    offline: (on) => {
      graph.offline = on;
    },
  };
});

describe('OneDriveAdapter (Graph specifics)', () => {
  it('reads via metadata GET with bearer token, then downloads without Authorization', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'hello');
    const file = await adapter.read('tasks.md');
    expect(file?.text).toBe('hello');
    expect(graph.calls).toHaveLength(2);
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/ALAI/TaskApp/tasks.md');
    expect(graph.calls[0]!.headers['authorization']).toBe('Bearer tok');
    expect(graph.calls[1]!.url).toContain('https://download.example.test/');
    expect(graph.calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('writes with PUT :/content, If-Match, and text/plain content type', async () => {
    const { graph, adapter } = setup();
    const { etag } = await adapter.write('tasks.md', 'a', null);
    const create = graph.calls[0]!;
    expect(create.method).toBe('PUT');
    expect(create.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/ALAI/TaskApp/tasks.md:/content');
    expect(create.headers['if-none-match']).toBe('*');
    expect(create.headers['if-match']).toBeUndefined();
    expect(create.headers['content-type']).toBe('text/plain; charset=utf-8');
    await adapter.write('tasks.md', 'b', etag);
    expect(graph.calls[1]!.headers['if-match']).toBe(etag);
    expect(graph.calls[1]!.headers['if-none-match']).toBeUndefined();
  });

  it('encodes path segments', async () => {
    const graph = new GraphFake('My Stuff/Task App');
    const adapter = new OneDriveAdapter({
      folder: 'My Stuff/Task App',
      getToken: async () => 't',
      fetch: graph.fetch as typeof fetch,
    });
    await adapter.write('tasks.md', 'a', null);
    expect(graph.calls[0]!.url).toContain('/root:/My%20Stuff/Task%20App/tasks.md:/content');
  });

  it('retries once with a fresh token after a 401', async () => {
    const getToken = vi.fn<() => Promise<string>>().mockResolvedValueOnce('old').mockResolvedValue('new');
    const { graph, adapter } = setup(getToken);
    graph.unauthorized = 1;
    expect(await adapter.read('tasks.md')).toBeNull();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(graph.calls[0]!.headers['authorization']).toBe('Bearer old');
    expect(graph.calls[1]!.headers['authorization']).toBe('Bearer new');
  });

  it('throws AuthRequiredError on a second 401', async () => {
    const getToken = vi.fn(async () => 'tok');
    const { graph, adapter } = setup(getToken);
    graph.unauthorized = 2;
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it('maps a fetch TypeError to OfflineError', async () => {
    const adapter = new OneDriveAdapter({
      folder: FOLDER,
      getToken: async () => 't',
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a request that honours the abort signal times out as OfflineError', async () => {
    const fetchFn = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
    const adapter = new OneDriveAdapter({ folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
    await expect(adapter.write('tasks.md', 'x', null)).rejects.toBeInstanceOf(OfflineError);
  });

  it('a request that never settles still times out as OfflineError', async () => {
    const fetchFn = (() => new Promise<Response>(() => {})) as typeof fetch;
    const adapter = new OneDriveAdapter({ folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a body that stalls after the headers also times out', async () => {
    const fetchFn = (async () =>
      new Response(new ReadableStream({ start() {} }), { status: 200 })) as typeof fetch;
    const adapter = new OneDriveAdapter({ folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('the default timeout is 20 s', async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = (() => new Promise<Response>(() => {})) as typeof fetch;
      const adapter = new OneDriveAdapter({ folder: FOLDER, getToken: async () => 't', fetch: fetchFn });
      let settled: unknown = null;
      const p = adapter.read('tasks.md').catch((e: unknown) => (settled = e));
      await vi.advanceTimersByTimeAsync(19_999);
      expect(settled).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(settled).toBeInstanceOf(OfflineError);
    } finally {
      vi.useRealTimers();
    }
  });
});
