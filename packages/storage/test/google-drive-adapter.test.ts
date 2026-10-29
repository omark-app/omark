import { mergeTasksText } from '@omark/tasks-core';
import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, OfflineError, PreconditionFailedError, StorageFullError } from '../src/errors.ts';
import { FakeGoogleDrive } from '../src/fake-google-drive.ts';
import { GoogleDriveAdapter } from '../src/google-drive-adapter.ts';
import { MemoryCache } from '../src/cache.ts';
import { FileSync } from '../src/file-sync.ts';
import { adapterContract } from './adapter-contract.ts';

const FOLDER = 'Omark Tasks';
const FOLDER_MIME_Q = "mimeType='application/vnd.google-apps.folder'";
const INSERT = '/upload/drive/v2/files?uploadType=multipart';
function setup(fake: FakeGoogleDrive, fetchFn: typeof fetch = fake.fetch, getToken = async () => 'tok') {
  return new GoogleDriveAdapter({ folder: FOLDER, getToken, fetch: fetchFn });
}

/** Answers the next requests with `replies`, one each, then hands the rest to the fake. */
function replying(fake: FakeGoogleDrive, ...replies: Response[]): typeof fetch {
  return (async (input, init) => replies.shift() ?? fake.fetch(input, init)) as typeof fetch;
}

function googleError(status: number, reason: string): Response {
  return Response.json({ error: { code: status, message: reason, errors: [{ reason }] } }, { status });
}

/** The error a failed call rejects with, which must be a plain `Error` (the sync then retries later). */
async function plainError(p: Promise<unknown>): Promise<void> {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(Error);
  expect((e as Error).constructor).toBe(Error);
}

adapterContract(() => {
  const fake = new FakeGoogleDrive();
  return {
    adapter: setup(fake),
    external: (n, t) => fake.externalWrite(n, t),
    offline: (on) => fake.setOffline(on),
  };
});

describe('GoogleDriveAdapter (Drive specifics)', () => {
  it('creates the folder on the first write, once, and a second adapter reuses it', async () => {
    const fake = new FakeGoogleDrive();
    const a = setup(fake);
    expect(await a.read('tasks.md')).toBeNull();
    expect(fake.folders()).toEqual([]);
    await a.write('tasks.md', 'a', null);
    await a.write('done.md', 'd', null);
    const b = setup(fake);
    await b.write('config.yaml', 'c', null);
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect((await b.read('tasks.md'))?.text).toBe('a');
  });

  it('concurrent first writes on one adapter create one folder', async () => {
    const fake = new FakeGoogleDrive();
    const a = setup(fake);
    await Promise.all([a.write('tasks.md', 'a', null), a.write('done.md', 'b', null), a.write('config.yaml', 'c', null)]);
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect(fake.files().sort()).toEqual(['config.yaml', 'done.md', 'tasks.md']);
    expect([fake.peek('tasks.md'), fake.peek('done.md'), fake.peek('config.yaml')]).toEqual(['a', 'b', 'c']);
  });

  it('finds a folder another device created after a read found none', async () => {
    const fake = new FakeGoogleDrive();
    const a = setup(fake);
    expect(await a.read('tasks.md')).toBeNull();
    fake.externalWrite('tasks.md', 'x');
    expect((await a.read('tasks.md'))?.text).toBe('x');
  });

  it('a create that starts while another is making the folder waits for that folder', async () => {
    const fake = new FakeGoogleDrive();
    // Holds a's folder creation at the door, before the fake sees it.
    let creating!: () => void;
    let letCreate!: () => void;
    const creatingP = new Promise<void>((r) => (creating = r));
    const gate = new Promise<void>((r) => (letCreate = r));
    const fetchFn = (async (input, init) => {
      if (init?.method === 'POST' && String(input).includes('/drive/v3/files?fields=id')) {
        creating();
        await gate;
      }
      return fake.fetch(input, init);
    }) as typeof fetch;
    const adapter = setup(fake, fetchFn);
    const first = adapter.write('tasks.md', 'a', null);
    await creatingP; // a found no folder and is about to make one
    // A lookup of b's own, sent now, sees no folder; its reply is held until a's folder exists.
    let gated = true;
    const held = fake.holdReply((c) => gated && decodeURIComponent(c.url).includes(FOLDER_MIME_Q));
    const second = adapter.write('done.md', 'b', null);
    await new Promise((r) => setTimeout(r, 0));
    gated = false;
    letCreate();
    await first;
    held.release();
    await second;
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect([fake.peek('tasks.md'), fake.peek('done.md')]).toEqual(['a', 'b']);
  });

  it('concurrent reads share one folder lookup', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a', 'done.md': 'b', 'config.yaml': 'c' });
    const a = setup(fake);
    const texts = await Promise.all(['tasks.md', 'done.md', 'config.yaml'].map(async (n) => (await a.read(n))?.text));
    expect(texts).toEqual(['a', 'b', 'c']);
    expect(fake.calls.filter((c) => decodeURIComponent(c.url).includes(FOLDER_MIME_Q))).toHaveLength(1);
  });

  it('finds names with quotes and backslashes', async () => {
    const fake = new FakeGoogleDrive();
    await setup(fake).write("it's a\\b.md", 'x', null);
    expect((await setup(fake).read("it's a\\b.md"))?.text).toBe('x');
  });

  it('writes with If-Match to the v2 upload URL, and a stale etag fails', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a', 'config.yaml': 'c' });
    const adapter = setup(fake);
    const { etag } = (await adapter.read('tasks.md'))!;
    await adapter.write('tasks.md', 'b', etag);
    const put = fake.calls.at(-1)!;
    expect(put.method).toBe('PUT');
    expect(put.url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v2\/files\/[^/?]+\?uploadType=media&fields=etag$/);
    expect(put.headers['if-match']).toBe(etag);
    expect(put.headers['authorization']).toBe('Bearer tok');
    expect(put.headers['content-type']).toBe('text/markdown; charset=utf-8');
    await expect(adapter.write('tasks.md', 'c', etag)).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(fake.peek('tasks.md')).toBe('b');

    const config = (await adapter.read('config.yaml'))!;
    await adapter.write('config.yaml', 'd', config.etag);
    expect(fake.calls.at(-1)!.headers['content-type']).toBe('text/plain; charset=utf-8');
  });

  it('fails a write with the old etag after a metadata change, and reads the same text with a new etag', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    const before = (await adapter.read('tasks.md'))!;
    fake.touchMetadata('tasks.md');
    await expect(adapter.write('tasks.md', 'b', before.etag)).rejects.toBeInstanceOf(PreconditionFailedError);
    const after = (await adapter.read('tasks.md'))!;
    expect(after.text).toBe('a');
    expect(after.etag).not.toBe(before.etag);
  });

  it("reads the head revision's content, so a write between the two requests cannot pair new text with an old etag", async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'one' });
    fake.externalWrite('tasks.md', 'two');
    const adapter = setup(fake);
    const held = fake.holdReply((c) => c.url.includes('/drive/v2/files/'));
    const reading = adapter.read('tasks.md');
    await held.reached;
    fake.externalWrite('tasks.md', 'three');
    held.release();
    const file = (await reading)!;
    expect(file.text).toBe('two');
    const urls = fake.calls.map((c) => c.url);
    expect(urls.at(-2)).toMatch(/\/drive\/v2\/files\/[^/?]+\?fields=etag,headRevisionId,labels\/trashed$/);
    expect(urls.at(-1)).toMatch(/\/drive\/v3\/files\/[^/?]+\/revisions\/[^/?]+\?alt=media$/);
    expect(urls.some((u) => /\/files\/[^/?]+\?alt=media/.test(u))).toBe(false);
    await expect(adapter.write('tasks.md', 'four', file.etag)).rejects.toBeInstanceOf(PreconditionFailedError);
  });

  it('two devices creating the same file at once: one wins, the other gets a 412, one file is left', async () => {
    const fake = new FakeGoogleDrive({ 'config.yaml': 'c' });
    const a = setup(fake);
    const b = setup(fake);
    const held = fake.holdReply((c) => decodeURIComponent(c.url).includes("name='tasks.md'"));
    const first = a.write('tasks.md', 'from a', null);
    await held.reached; // a has seen no file and is about to create one
    await b.write('tasks.md', 'from b', null);
    held.release();
    await expect(first).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(fake.files()).toEqual(['config.yaml', 'tasks.md']);
    expect(fake.peek('tasks.md')).toBe('from b');
    expect((await a.read('tasks.md'))?.text).toBe('from b');
  });

  it('two devices creating the folder at once both write into the oldest one', async () => {
    const fake = new FakeGoogleDrive();
    const a = setup(fake);
    const b = setup(fake);
    const held = fake.holdReply((c) => decodeURIComponent(c.url).includes(FOLDER_MIME_Q));
    const first = a.write('tasks.md', 'a', null);
    await held.reached; // a has seen no folder and is about to create one
    await b.write('done.md', 'b', null);
    held.release();
    await first;
    expect(fake.folders()).toEqual(['Omark Tasks', 'Omark Tasks']);
    // peek looks only in the oldest folder.
    expect(fake.peek('tasks.md')).toBe('a');
    expect(fake.peek('done.md')).toBe('b');
    expect(fake.files()).toEqual(['done.md', 'tasks.md']);
  });

  it('reads null after the file is trashed, and creates it again', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    const { etag } = (await adapter.read('tasks.md'))!;
    fake.trash('tasks.md');
    expect(await adapter.read('tasks.md')).toBeNull();
    await expect(adapter.write('tasks.md', 'b', etag)).rejects.toBeInstanceOf(PreconditionFailedError);
    await adapter.write('tasks.md', 'b', null);
    expect(fake.peek('tasks.md')).toBe('b');
    expect(fake.files()).toEqual(['tasks.md']);
  });

  it('reads null after the whole folder is trashed, and creates both again', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    await adapter.read('tasks.md');
    fake.trashFolder();
    expect(await adapter.read('tasks.md')).toBeNull();
    await adapter.write('tasks.md', 'b', null);
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect(fake.peek('tasks.md')).toBe('b');
  });

  it('a create after the folder is deleted for good makes a new folder and file', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    await adapter.read('tasks.md');
    fake.deleteFolder();
    await adapter.write('tasks.md', 'b', null);
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect(fake.peek('tasks.md')).toBe('b');
  });

  it('a folder deleted between the look and the create also reads as a 412, once', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    await adapter.read('tasks.md');
    const held = fake.holdReply((c) => decodeURIComponent(c.url).includes("name='done.md'"));
    const writing = adapter.write('done.md', 'd', null);
    await held.reached; // the folder still had no done.md
    fake.deleteFolder();
    held.release();
    await expect(writing).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(fake.calls.at(-1)).toMatchObject({ method: 'POST', url: expect.stringContaining(INSERT) });
    await adapter.write('done.md', 'd', null);
    expect(fake.peek('done.md')).toBe('d');
  });

  it('a folder deleted between the create and the look after it also reads as a 412, once', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    const held = fake.holdReply((c) => c.url.includes(INSERT));
    const writing = adapter.write('done.md', 'd', null);
    await held.reached; // done.md now exists in the folder
    fake.deleteFolder();
    held.release();
    await expect(writing).rejects.toBeInstanceOf(PreconditionFailedError);
    expect(fake.calls.at(-1)?.method).toBe('PATCH'); // trashing our copy found it already gone
    await adapter.write('done.md', 'd', null);
    expect(fake.folders()).toEqual(['Omark Tasks']);
    expect(fake.peek('done.md')).toBe('d');
  });

  it('reads null for a file in a folder deleted for good', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a', 'done.md': 'd' });
    const adapter = setup(fake);
    await adapter.read('tasks.md');
    fake.deleteFolder();
    expect(await adapter.read('done.md')).toBeNull();
    await adapter.write('done.md', 'e', null);
    expect(fake.peek('done.md')).toBe('e');
  });

  it('a create after the folder is trashed goes into a new folder, not the trashed one', async () => {
    const fake = new FakeGoogleDrive();
    const adapter = setup(fake);
    await adapter.write('tasks.md', 'a', null);
    fake.trashFolder();
    await adapter.write('new.md', 'x', null);
    expect(fake.folders()).toEqual(['Omark Tasks']); // untrashed folders only
    expect(fake.files()).toEqual(['new.md']); // untrashed files only
    expect(fake.peek('new.md')).toBe('x'); // in the untrashed folder
  });

  it('throws AuthRequiredError on a second 401, after asking for a fresh token', async () => {
    const fake = new FakeGoogleDrive();
    const getToken = vi.fn<(opts?: { fresh?: boolean }) => Promise<string>>(async () => 'tok');
    const adapter = setup(fake, replying(fake, googleError(401, 'authError'), googleError(401, 'authError')), getToken);
    await expect(adapter.read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
    expect(getToken.mock.calls).toEqual([[undefined], [{ fresh: true }]]);
  });

  it('throws AuthRequiredError when Drive access was not granted', async () => {
    const fake = new FakeGoogleDrive();
    const adapter = setup(fake, replying(fake, googleError(403, 'insufficientPermissions')));
    await expect(adapter.write('tasks.md', 'a', null)).rejects.toBeInstanceOf(AuthRequiredError);
  });

  it('a rate limit is a plain error, so the sync retries later', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    await plainError(setup(fake, replying(fake, googleError(403, 'rateLimitExceeded'))).read('tasks.md'));
    await plainError(setup(fake, replying(fake, googleError(403, 'userRateLimitExceeded'))).read('tasks.md'));
    await plainError(setup(fake, replying(fake, googleError(429, 'rateLimitExceeded'))).write('done.md', 'd', null));
  });

  it('a full Drive is StorageFullError, on a create and on a write (#68)', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    const { etag } = (await adapter.read('tasks.md'))!;
    fake.setFull(true);
    await expect(adapter.write('tasks.md', 'b', etag)).rejects.toBeInstanceOf(StorageFullError);
    await expect(adapter.write('done.md', 'd', null)).rejects.toBeInstanceOf(StorageFullError);
    expect(fake.peek('tasks.md')).toBe('a');
    expect((await adapter.read('tasks.md'))?.text).toBe('a');
    fake.setFull(false);
    await adapter.write('tasks.md', 'b', etag);
    expect(fake.peek('tasks.md')).toBe('b');
  });

  it('reads the full reason from error.details too, as newer replies carry it', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const reply = Response.json(
      { error: { code: 403, message: 'full', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'storageQuotaExceeded' }] } },
      { status: 403 },
    );
    const adapter = setup(fake, replying(fake, reply));
    await expect(adapter.write('done.md', 'd', null)).rejects.toBeInstanceOf(StorageFullError);
  });

  it('throws OfflineError when the network is down', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    fake.setOffline(true);
    await expect(setup(fake).read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('refuses a folder path with an empty, . or .. part', () => {
    for (const folder of ['', '.', '..', 'a//b', 'a/', '/a', 'a/../b', 'a/./b']) {
      expect(() => new GoogleDriveAdapter({ folder, getToken: async () => 'tok' })).toThrow(/folder/);
    }
  });
});

describe('GoogleDriveAdapter on a folder path', () => {
  const PATH = 'Omark/tasks';
  const on = (fake: FakeGoogleDrive, folder = PATH) => new GoogleDriveAdapter({ folder, getToken: async () => 'tok', fetch: fake.fetch });

  adapterContract(() => {
    const fake = new FakeGoogleDrive({}, PATH);
    return { adapter: on(fake), external: (n, t) => fake.externalWrite(n, t), offline: (o) => fake.setOffline(o) };
  });

  it('reads nothing and creates nothing until the first write, which makes each level once', async () => {
    const fake = new FakeGoogleDrive({}, PATH);
    const a = on(fake);
    expect(await a.read('tasks.md')).toBeNull();
    expect(fake.folders()).toEqual([]);
    await Promise.all([a.write('tasks.md', 'a', null), a.write('done.md', 'd', null)]);
    expect(fake.folders()).toEqual(['Omark', 'tasks']);
    expect(fake.peek('tasks.md')).toBe('a');
  });

  it('a second part shares the top folder and gets its own subfolder', async () => {
    const fake = new FakeGoogleDrive({}, PATH);
    await on(fake).write('tasks.md', 'a', null);
    const time = on(fake, 'Omark/time');
    expect(await time.read('tasks.md')).toBeNull();
    await time.write('events-2026.csv', 'e', null);
    expect(fake.folders()).toEqual(['Omark', 'tasks', 'time']);
    expect((await on(fake).read('tasks.md'))?.text).toBe('a');
  });

  it('finds a subfolder only inside its own top folder', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'theirs' }, 'Other/tasks');
    const a = on(fake);
    expect(await a.read('tasks.md')).toBeNull();
    await a.write('tasks.md', 'ours', null);
    expect((await a.read('tasks.md'))?.text).toBe('ours');
    expect(fake.folders()).toEqual(['Other', 'tasks', 'Omark', 'tasks']);
  });
});

describe('FakeGoogleDrive', () => {
  it('fails loudly on a request the adapter should not send', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const init = { headers: { Authorization: 'Bearer tok' } };
    await expect(fake.fetch('https://www.googleapis.com/drive/v3/files/x?alt=media', init)).rejects.toThrow(/unexpected/);
    await expect(fake.fetch('https://www.googleapis.com/drive/v3/files?q=trashed%3Dfalse', init)).rejects.toThrow(/unexpected/);
  });
});

describe('GoogleDriveAdapter when two files answer to one name (#67)', () => {
  const device = (fake: FakeGoogleDrive, token: string) => setup(fake, fake.fetch, async () => token);
  const sync = (adapter: GoogleDriveAdapter, cache: MemoryCache) =>
    new FileSync({ name: 'tasks.md', adapter, cache, merge: mergeTasksText, initial: '# Tasks\n' });

  it('read and write give the file id as the source', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const adapter = setup(fake);
    const read = await adapter.read('tasks.md');
    expect(read?.source).toMatch(/^id/);
    expect((await adapter.write('tasks.md', 'b', read!.etag)).source).toBe(read!.source);
    const made = await adapter.write('done.md', 'd', null);
    expect(made.source).toMatch(/^id/);
    expect(made.source).not.toBe(read!.source);
  });

  it('exists says whether a file id is still there and out of the trash', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a', 'done.md': 'd' });
    const adapter = setup(fake);
    const tasks = (await adapter.read('tasks.md'))!.source!;
    const done = (await adapter.read('done.md'))!.source!;
    expect(await adapter.exists(tasks)).toBe(true);
    fake.trash('tasks.md');
    expect(await adapter.exists(tasks)).toBe(false);
    fake.deleteFolder();
    expect(await adapter.exists(done)).toBe(false);
  });

  it('a file trashed and made again by another device is taken as it is: a task deleted there stays deleted', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': '# Tasks\n- [ ] Keep\n- [ ] Delete me\n' });
    const a = sync(device(fake, 'tok-a'), new MemoryCache());
    const b = sync(device(fake, 'tok-b'), new MemoryCache());
    await a.open();
    const opened = await b.open();
    await b.save('# Tasks\n- [ ] Keep\n', opened);
    fake.trash('tasks.md');
    await b.pull(); // finds it missing and makes it again from its own text
    expect(fake.peek('tasks.md')).toBe('# Tasks\n- [ ] Keep\n');
    expect((await a.pull()).text).toBe('# Tasks\n- [ ] Keep\n');
    expect(fake.peek('tasks.md')).toBe('# Tasks\n- [ ] Keep\n');
  });

  it('a malformed details list keeps the reason in errors', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    const reply = Response.json({ error: { code: 403, errors: [{ reason: 'insufficientPermissions' }], details: [null] } }, { status: 403 });
    await expect(setup(fake, replying(fake, reply)).read('tasks.md')).rejects.toBeInstanceOf(AuthRequiredError);
    const upper = Response.json({ error: { code: 403, details: [{ reason: 'STORAGE_QUOTA_EXCEEDED' }] } }, { status: 403 });
    await expect(setup(fake, replying(fake, upper)).write('done.md', 'd', null)).rejects.toBeInstanceOf(StorageFullError);
  });

  it('a lagging list lets two first runs at once make two folders, each with its own tasks.md', async () => {
    const fake = new FakeGoogleDrive();
    fake.setListLag(true);
    await device(fake, 'tok-a').write('tasks.md', 'A', null);
    await device(fake, 'tok-b').write('tasks.md', 'B', null);
    expect(fake.folders()).toEqual(['Omark Tasks', 'Omark Tasks']);
    expect(fake.files()).toEqual(['tasks.md', 'tasks.md']);
    fake.settleLists();
    expect((await device(fake, 'tok-b').read('tasks.md'))?.text).toBe('A');
  });

  it('two devices that each made tasks.md both end up with both tasks, in the oldest file', async () => {
    const fake = new FakeGoogleDrive();
    fake.setListLag(true);
    const [cacheA, cacheB] = [new MemoryCache(), new MemoryCache()];
    const a = sync(device(fake, 'tok-a'), cacheA);
    const b = sync(device(fake, 'tok-b'), cacheB);
    await a.save('# Tasks\n- [ ] From A\n', await a.open());
    await b.save('# Tasks\n- [ ] From B\n', await b.open());
    expect(fake.files()).toEqual(['tasks.md', 'tasks.md']);
    fake.setListLag(false);
    fake.settleLists();
    // Each device starts again: a new adapter, the same cache.
    const b2 = sync(device(fake, 'tok-b'), cacheB);
    const a2 = sync(device(fake, 'tok-a'), cacheA);
    for (const text of [await b2.open(), await a2.open()]) {
      expect(text).toContain('- [ ] From A');
      expect(text).toContain('- [ ] From B');
    }
    expect(fake.peek('tasks.md')).toContain('- [ ] From B');
    expect(fake.files()).toEqual(['tasks.md', 'tasks.md']);
  });

  it('a folder restored from the trash, older than the one in use, gets the tasks saved meanwhile', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': '# Tasks\n- [ ] Old task\n' });
    const cache = new MemoryCache();
    await sync(setup(fake), cache).open();
    fake.trashFolder();
    const second = sync(setup(fake), cache);
    const opened = await second.open();
    await second.save(`${opened}- [ ] Saved in the new folder\n`, opened);
    fake.restoreTrashed();
    const text = await sync(setup(fake), cache).open();
    expect(text).toContain('- [ ] Old task');
    expect(text).toContain('- [ ] Saved in the new folder');
    expect(fake.peek('tasks.md')).toBe(text);
  });
});
