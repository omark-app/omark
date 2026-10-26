import { describe, expect, it, vi } from 'vitest';
import { AuthRequiredError, OfflineError, PreconditionFailedError } from '../src/errors.ts';
import { FakeGoogleDrive } from '../src/fake-google-drive.ts';
import { GoogleDriveAdapter } from '../src/google-drive-adapter.ts';
import { adapterContract } from './adapter-contract.ts';

const FOLDER = 'Omark Tasks';
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
    const held = fake.holdReply((c) => decodeURIComponent(c.url).includes("mimeType='application/vnd.google-apps.folder'"));
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

  it('throws OfflineError when the network is down', async () => {
    const fake = new FakeGoogleDrive({ 'tasks.md': 'a' });
    fake.setOffline(true);
    await expect(setup(fake).read('tasks.md')).rejects.toBeInstanceOf(OfflineError);
  });

  it('refuses a folder that is not one folder name', () => {
    for (const folder of ['a/b', '', '.', '..']) {
      expect(() => new GoogleDriveAdapter({ folder, getToken: async () => 'tok' })).toThrow(/folder/);
    }
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
