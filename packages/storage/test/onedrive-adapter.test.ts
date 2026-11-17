import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, OfflineError, StorageFullError } from '../src/errors.ts';
import { OneDriveAdapter } from '../src/onedrive-adapter.ts';
import { adapterContract, binaryContract, landedContract, readIfChangedContract } from './adapter-contract.ts';
import { GraphFake } from './graph-fake.ts';

const FOLDER = 'Prod/Tasks';
function setup(getToken: (opts?: { fresh?: boolean }) => Promise<string> = async () => 'tok') {
  const graph = new GraphFake(FOLDER);
  const adapter = new OneDriveAdapter({ folder: FOLDER, getToken, fetch: graph.fetch as typeof fetch });
  return { graph, adapter };
}

const graphHarness = () => {
  const { graph, adapter } = setup();
  return {
    adapter,
    external: (n: string, t: string) => graph.external(n, t),
    offline: (on: boolean) => {
      graph.offline = on;
    },
  };
};
adapterContract(graphHarness);
readIfChangedContract(graphHarness);
landedContract(graphHarness);

binaryContract(() => {
  const { graph, adapter } = setup();
  return {
    store: adapter,
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
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/Prod/Tasks/tasks.md');
    expect(graph.calls[0]!.headers['authorization']).toBe('Bearer tok');
    expect(graph.calls[1]!.url).toContain('https://download.example.test/');
    expect(graph.calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('readIfChanged stops after the metadata when the eTag matches: no download (#158)', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'hello');
    const { etag } = (await adapter.read('tasks.md'))!;
    graph.calls = [];
    expect(await adapter.readIfChanged('tasks.md', { etag })).toBe('unchanged');
    expect(graph.calls.map((c) => c.url)).toEqual(['https://graph.microsoft.com/v1.0/me/drive/special/approot:/Prod/Tasks/tasks.md']);
  });

  it('read takes an item without an eTag in full, never as unchanged', async () => {
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).startsWith('https://download.example.test/')
        ? new Response('hello')
        : Response.json({ '@microsoft.graph.downloadUrl': 'https://download.example.test/tasks.md', file: {} })) as typeof fetch;
    const adapter = new OneDriveAdapter({ folder: FOLDER, getToken: async () => 'tok', fetch: fetchFn });
    expect((await adapter.read('tasks.md'))?.text).toBe('hello');
  });

  it('readIfChanged downloads a file whose eTag moved on, as read does', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'old');
    const { etag } = (await adapter.read('tasks.md'))!;
    graph.external('tasks.md', 'new');
    graph.calls = [];
    expect(await adapter.readIfChanged('tasks.md', { etag })).toEqual({ text: 'new', etag: '"{guid-tasks.md},2"' });
    expect(graph.calls).toHaveLength(2);
    expect(graph.calls[1]!.url).toContain('https://download.example.test/');
  });

  it('readIfChanged still reads again when the download is older than its eTag', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'old');
    const { etag } = (await adapter.read('tasks.md'))!;
    graph.external('tasks.md', 'new');
    graph.staleDownloads = 1;
    graph.calls = [];
    expect(await adapter.readIfChanged('tasks.md', { etag })).toEqual({ text: 'new', etag: '"{guid-tasks.md},2"' });
    expect(graph.calls).toHaveLength(4);
  });

  it('reads from the app folder by default', async () => {
    const graph = new GraphFake('');
    const adapter = new OneDriveAdapter({ folder: '', getToken: async () => 'tok', fetch: graph.fetch as typeof fetch });
    graph.external('tasks.md', 'hello');
    expect((await adapter.read('tasks.md'))?.text).toBe('hello');
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/tasks.md');
  });

  it('puts a folder under the app folder', async () => {
    const graph = new GraphFake('Tasks/Sub');
    const adapter = new OneDriveAdapter({ folder: 'Tasks/Sub', getToken: async () => 'tok', fetch: graph.fetch as typeof fetch });
    await adapter.read('tasks.md');
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/Tasks/Sub/tasks.md');
  });

  it('refuses dot segments in the folder', () => {
    for (const folder of ['.', 'a/..', '../a']) {
      expect(() => new OneDriveAdapter({ folder, getToken: async () => 'tok' })).toThrow(/folder/);
    }
  });

  it('reads again when the download is older than the eTag it came with, and returns the matching pair', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'old');
    graph.external('tasks.md', 'new');
    graph.staleDownloads = 1;
    expect(await adapter.read('tasks.md')).toEqual({ text: 'new', etag: '"{guid-tasks.md},2"' });
    expect(graph.calls).toHaveLength(4);
  });

  it('fails the read, rather than pair old text with the new eTag, when the download stays stale', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'old');
    graph.external('tasks.md', 'new');
    graph.staleDownloads = 3;
    await expect(adapter.read('tasks.md')).rejects.toThrow('does not match its eTag');
    expect(graph.calls).toHaveLength(6);
  });

  it('hashes the bytes as sent, BOM and CRLF included, and takes the text without the BOM', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', String.fromCharCode(0xfeff) + '# Tasks\r\n- [ ] Zwłóknienia\r\n');
    expect((await adapter.read('tasks.md'))?.text).toBe('# Tasks\r\n- [ ] Zwłóknienia\r\n');
  });

  it('takes the download as is when the metadata has no hash', async () => {
    const { graph, adapter } = setup();
    graph.hashes = false;
    graph.external('tasks.md', 'old');
    graph.external('tasks.md', 'new');
    graph.staleDownloads = 1;
    expect((await adapter.read('tasks.md'))?.text).toBe('old');
  });

  it('writes with PUT :/content, If-Match, and text/plain content type', async () => {
    const { graph, adapter } = setup();
    const { etag } = await adapter.write('tasks.md', 'a', null);
    const create = graph.calls[0]!;
    expect(create.method).toBe('PUT');
    expect(create.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/Prod/Tasks/tasks.md:/content');
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
    expect(graph.calls[0]!.url).toContain('/approot:/My%20Stuff/Task%20App/tasks.md:/content');
  });

  it('retries once with a fresh token after a 401', async () => {
    const getToken = vi.fn<(opts?: { fresh?: boolean }) => Promise<string>>().mockResolvedValueOnce('old').mockResolvedValue('new');
    const { graph, adapter } = setup(getToken);
    graph.unauthorized = 1;
    expect(await adapter.read('tasks.md')).toBeNull();
    expect(getToken.mock.calls).toEqual([[undefined], [{ fresh: true }]]);
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

  it('a full OneDrive is StorageFullError: 507, or quotaLimitReached on a 403 or 507 (#68)', async () => {
    const full = async (reply: Response) => {
      const adapter = new OneDriveAdapter({ folder: '', getToken: async () => 't', fetch: (async () => reply) as typeof fetch });
      return adapter.write('tasks.md', 'a', null).catch((e: unknown) => e);
    };
    const graphError = (status: number, code: string) => Response.json({ error: { code, message: code } }, { status });
    expect(await full(new Response('', { status: 507 }))).toBeInstanceOf(StorageFullError);
    expect(await full(graphError(507, 'insufficientStorage'))).toBeInstanceOf(StorageFullError);
    expect(await full(graphError(403, 'quotaLimitReached'))).toBeInstanceOf(StorageFullError);
    const other = await full(graphError(403, 'accessDenied'));
    expect(other).toBeInstanceOf(Error);
    expect((other as Error).constructor).toBe(Error);
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

  it('a read whose token could not be had fails as the sign-in server unreachable (#157)', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const failing = new OneDriveAdapter({
      folder: FOLDER,
      getToken: async () => {
        throw new OfflineError('Network unreachable');
      },
      fetch: fetchFn,
    });
    await expect(failing.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'signin' });
    const stalled = new OneDriveAdapter({ folder: FOLDER, getToken: () => new Promise<string>(() => {}), fetch: fetchFn, timeoutMs: 10 });
    await expect(stalled.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'signin' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a fresh token after a 401 that cannot be had fails as the sign-in server unreachable (#157)', async () => {
    const getToken = vi.fn(async (o?: { fresh?: boolean }) => {
      if (o?.fresh) throw new OfflineError('Network unreachable');
      return 'tok';
    });
    const { graph, adapter } = setup(getToken);
    graph.external('tasks.md', 'a');
    graph.unauthorized = 1;
    await expect(adapter.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'signin' });
  });

  it('a read that reaches no Graph fails as the storage unreachable (#157)', async () => {
    const { graph, adapter } = setup();
    graph.offline = true;
    await expect(adapter.read('tasks.md')).rejects.toMatchObject({ name: 'OfflineError', unreachable: 'storage' });
  });

  it('a token acquisition that never settles times out as OfflineError', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const adapter = new OneDriveAdapter({
      folder: FOLDER,
      getToken: () => new Promise<string>(() => {}),
      fetch: fetchFn,
      timeoutMs: 10,
    });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
    await expect(adapter.write('tasks.md', 'x', null)).rejects.toBeInstanceOf(OfflineError);
    expect(fetchFn).not.toHaveBeenCalled();
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

describe('OneDriveAdapter landed (#161)', () => {
  it('downloads only the versions whose size matches a text', async () => {
    const { graph, adapter } = setup();
    for (const t of ['one', 'three', 'mine', 'theirs!']) graph.external('tasks.md', t);
    graph.calls = [];
    expect(await adapter.landed('tasks.md', ['mine'], '')).toBe('mine');
    const downloads = graph.calls.filter((c) => c.url.startsWith('https://download.example.test/versions/'));
    // "mine" and "one" are both 4 bytes: only the newer one is fetched, from its URL and without the token.
    expect(downloads.map((c) => c.url)).toEqual(['https://download.example.test/versions/tasks.md/3']);
    expect(downloads[0]!.headers['authorization']).toBeUndefined();
  });

  it('reads a version through /content when Graph gives no download URL', async () => {
    const { graph, adapter } = setup();
    for (const t of ['one', 'mine', 'theirs!']) graph.external('tasks.md', t);
    graph.versionUrls = false;
    graph.calls = [];
    expect(await adapter.landed('tasks.md', ['mine'], '')).toBe('mine');
    expect(graph.calls.filter((c) => c.url.endsWith('/content')).map((c) => decodeURIComponent(c.url).replace(/^.*:\/versions\//, ''))).toEqual(['2.0/content']);
  });

  it('stops at the base, downloading nothing older', async () => {
    const { graph, adapter } = setup();
    for (const t of ['mine', 'base', 'theirs!']) graph.external('tasks.md', t);
    graph.calls = [];
    expect(await adapter.landed('tasks.md', ['mine'], 'base')).toBeNull();
    expect(graph.calls.filter((c) => c.url.startsWith('https://download.example.test/versions/'))).toHaveLength(1);
  });

  it('compares UTF-8 bytes, so a text with emoji is found', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', '- [ ] Out 🌱 🔁 every day\n');
    graph.external('tasks.md', 'other');
    expect(await adapter.landed('tasks.md', ['- [ ] Out 🌱 🔁 every day\n'], '')).toBe('- [ ] Out 🌱 🔁 every day\n');
  });

  it('throws a plain error when Graph fails, so the sync merges as before', async () => {
    const { graph, adapter } = setup();
    graph.external('tasks.md', 'a');
    const failing = new OneDriveAdapter({
      folder: FOLDER,
      getToken: async () => 'tok',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) =>
        String(input).includes(':/versions') ? new Response('', { status: 503 }) : graph.fetch(input, init)) as typeof fetch,
    });
    await expect(failing.landed('tasks.md', ['a'], '')).rejects.toThrow('Graph versions failed: 503');
    expect(await adapter.landed('tasks.md', ['a'], '')).toBe('a');
  });
});
