import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, OfflineError, StorageFullError } from '../src/errors.ts';
import { OneDriveAdapter } from '../src/onedrive-adapter.ts';
import { adapterContract, binaryContract } from './adapter-contract.ts';
import { GraphFake } from './graph-fake.ts';

const FOLDER = 'Prod/Tasks';
function setup(getToken: (opts?: { fresh?: boolean }) => Promise<string> = async () => 'tok') {
  const graph = new GraphFake(FOLDER);
  const adapter = new OneDriveAdapter({ root: 'drive', folder: FOLDER, getToken, fetch: graph.fetch as typeof fetch });
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
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/Prod/Tasks/tasks.md');
    expect(graph.calls[0]!.headers['authorization']).toBe('Bearer tok');
    expect(graph.calls[1]!.url).toContain('https://download.example.test/');
    expect(graph.calls[1]!.headers['authorization']).toBeUndefined();
  });

  it('reads from the app folder by default', async () => {
    const graph = new GraphFake('', 'approot');
    const adapter = new OneDriveAdapter({ folder: '', getToken: async () => 'tok', fetch: graph.fetch as typeof fetch });
    graph.external('tasks.md', 'hello');
    expect((await adapter.read('tasks.md'))?.text).toBe('hello');
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/tasks.md');
  });

  it('puts a folder under the app folder', async () => {
    const graph = new GraphFake('Tasks/Sub', 'approot');
    const adapter = new OneDriveAdapter({ folder: 'Tasks/Sub', getToken: async () => 'tok', fetch: graph.fetch as typeof fetch });
    await adapter.read('tasks.md');
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/special/approot:/Tasks/Sub/tasks.md');
  });

  it('writes to the drive root path when root is drive', async () => {
    const { graph, adapter } = setup();
    await adapter.write('tasks.md', 'a', null);
    expect(graph.calls[0]!.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/Prod/Tasks/tasks.md:/content');
  });

  it.each(['drive', 'approot'] as const)('refuses dot segments in the folder (%s)', (root) => {
    for (const folder of ['.', 'a/..', '../a']) {
      expect(() => new OneDriveAdapter({ root, folder, getToken: async () => 'tok' })).toThrow(/folder/);
    }
  });

  it('refuses a whole-drive adapter without a folder', () => {
    expect(() => new OneDriveAdapter({ root: 'drive', folder: '', getToken: async () => 'tok' })).toThrow(/folder/);
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
    expect(create.url).toBe('https://graph.microsoft.com/v1.0/me/drive/root:/Prod/Tasks/tasks.md:/content');
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
      root: 'drive',
      folder: 'My Stuff/Task App',
      getToken: async () => 't',
      fetch: graph.fetch as typeof fetch,
    });
    await adapter.write('tasks.md', 'a', null);
    expect(graph.calls[0]!.url).toContain('/root:/My%20Stuff/Task%20App/tasks.md:/content');
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
      root: 'drive',
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
    const adapter = new OneDriveAdapter({ root: 'drive', folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
    await expect(adapter.write('tasks.md', 'x', null)).rejects.toBeInstanceOf(OfflineError);
  });

  it('a request that never settles still times out as OfflineError', async () => {
    const fetchFn = (() => new Promise<Response>(() => {})) as typeof fetch;
    const adapter = new OneDriveAdapter({ root: 'drive', folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a body that stalls after the headers also times out', async () => {
    const fetchFn = (async () =>
      new Response(new ReadableStream({ start() {} }), { status: 200 })) as typeof fetch;
    const adapter = new OneDriveAdapter({ root: 'drive', folder: FOLDER, getToken: async () => 't', fetch: fetchFn, timeoutMs: 10 });
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('a token acquisition that never settles times out as OfflineError', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const adapter = new OneDriveAdapter({
      root: 'drive',
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
      const adapter = new OneDriveAdapter({ root: 'drive', folder: FOLDER, getToken: async () => 't', fetch: fetchFn });
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
