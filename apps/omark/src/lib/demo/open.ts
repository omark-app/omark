import { FakeOneDrive, IdbBlobs, IdbCache, IdbDrive } from '@omark/storage';
import type { BinaryStore, StorageAdapter } from '@omark/storage';
import type { ISODate } from '@omark/tasks-core';
import { IdbState } from 'time/src/lib/state.ts';
import { demoWorld } from './world.ts';
import type { DemoWorld } from './world.ts';

/** The demo's place key: the shell, Tasks, Time and Goals name what they keep on the device after it. */
export const DEMO_KEY = 'demo';

/**
 * Every IndexedDB database the demo keeps, apart from any other place's on the same origin (localhost): the
 * folders, Tasks' offline copy, Goals' copy and pictures (`omark-goals-<key>`, `omark-pictures-<key>`, named by
 * GoalsPart), Time's copy (`omark-time-cache-omark-<key>`, by Time's `timeDeps`) and the made-up calendar.
 */
export const DEMO_DBS = {
  root: 'omark-demo:root',
  tasks: 'omark-demo:tasks',
  time: 'omark-demo:time',
  goals: 'omark-demo:goals',
  images: 'omark-demo:images',
  tasksCopy: 'omark-demo:tasks-copy',
  goalsCopy: `omark-goals-${DEMO_KEY}`,
  pictures: `omark-pictures-${DEMO_KEY}`,
  timeCopy: `omark-time-cache-omark-${DEMO_KEY}`,
  calendar: 'omark-demo:calendar',
  calendarDrive: 'omark-demo:calendar-drive', // Time's fake names its drive after the calendar's database
} as const;

/** Tasks' synced-at key in localStorage. */
export const DEMO_SYNCED_KEY = 'omark-demo:tasks-synced-at';
/** The day the demo was seeded: Time's calendar is made for the same day as the files. */
const DAY_KEY = 'omark-demo:day';
/** What else the demo keeps in localStorage: the shell's parts for its place (shell.svelte.ts), Tasks' synced-at. */
const LOCAL_KEYS = [DAY_KEY, DEMO_SYNCED_KEY, `omark:parts:${DEMO_KEY}`, `omark:parts-pending:${DEMO_KEY}`];
/** Time's sync state lives under the place's name in Time's shared database. */
const TIME_STATE = `omark-${DEMO_KEY}`;

type Folder = StorageAdapter & BinaryStore;
type Local = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface OpenedDemo {
  root: Folder;
  tasks: Folder;
  time: Folder;
  goals: Folder;
  images: Folder;
  /** The day the world was made for. */
  day: ISODate;
  /** False when IndexedDB is unusable: the demo runs in memory and edits are lost on reload. */
  durable: boolean;
}

export interface DemoOptions {
  /** The bytes of a picture the world shows, from the build's own files. */
  pictures(name: string): Promise<Blob>;
  local?: Local | null;
  /** Empty every demo store first (Reset demo). */
  reset?: boolean;
  /** Opens a folder's drive; IndexedDB unless a test passes its own. */
  drive?: (dbName: string) => Folder & Pick<IdbDrive, 'isEmpty' | 'seed'>;
}

const FOLDERS = ['root', 'tasks', 'time', 'goals'] as const;

/**
 * Opens the demo world's folders (one app spec, section 9). An empty demo (the first open, or after a reset) is
 * seeded with the world of `today`, the pictures fetched from the build; one with files is left alone, so edits
 * stay. The top folder is seeded last, after the pictures, so an interrupted seed starts again. Where IndexedDB is
 * unusable (it can throw on construction or first use, as in private mode), the folders run in memory; Time's
 * calendar and Goals' copy still need IndexedDB, so those parts may not open there.
 */
export async function openDemo(today: ISODate, timeZone: string, opts: DemoOptions): Promise<OpenedDemo> {
  const local = opts.local === undefined ? browserLocal() : opts.local;
  if (opts.reset) await resetDemo(local);
  const drive = opts.drive ?? ((name: string) => new IdbDrive(name));
  try {
    const folders = {
      root: drive(DEMO_DBS.root),
      tasks: drive(DEMO_DBS.tasks),
      time: drive(DEMO_DBS.time),
      goals: drive(DEMO_DBS.goals),
      images: drive(DEMO_DBS.images),
    };
    let day = get(local, DAY_KEY) ?? today;
    if (await folders.root.isEmpty()) {
      day = today;
      set(local, DAY_KEY, day);
      const world = demoWorld(day, timeZone);
      for (const f of FOLDERS.filter((f) => f !== 'root').reverse()) await folders[f].seed(world[f]);
      await addPictures(folders.images, world, opts.pictures);
      await folders.root.seed(world.root);
    }
    return { ...folders, day, durable: true };
  } catch {
    const world = demoWorld(today, timeZone);
    const images = new FakeOneDrive();
    await addPictures(images, world, opts.pictures);
    return {
      root: new FakeOneDrive(world.root),
      tasks: new FakeOneDrive(world.tasks),
      time: new FakeOneDrive(world.time),
      goals: new FakeOneDrive(world.goals),
      images,
      day: today,
      durable: false,
    };
  }
}

/** A picture that can't be fetched is left out: its area shows the plain colour. */
async function addPictures(images: Folder, world: DemoWorld, pictures: DemoOptions['pictures']): Promise<void> {
  for (const name of world.pictures) {
    try {
      await images.createBytes(name, await pictures(name));
    } catch {
      // Shown without it.
    }
  }
}

/**
 * Empties every store the demo keeps in this browser, the copies first so none can write an old file back. Run at
 * start-up, before anything opens them. Stores are cleared, not deleted: a delete waits for every open connection.
 */
export async function resetDemo(local: Local | null = browserLocal()): Promise<void> {
  const { forgetFake } = await import('time/src/lib/fake.ts');
  const clears = [
    () => new IdbCache(DEMO_DBS.tasksCopy).clear(),
    () => new IdbCache(DEMO_DBS.goalsCopy).clear(),
    () => new IdbCache(DEMO_DBS.timeCopy).clear(),
    () => new IdbBlobs(DEMO_DBS.pictures).clear(),
    () => new IdbState(TIME_STATE).clear(),
    () => forgetFake(DEMO_DBS.calendar),
    ...[DEMO_DBS.calendarDrive, DEMO_DBS.images, ...FOLDERS.map((f) => DEMO_DBS[f])].map((name) => () => new IdbDrive(name).clear()),
  ];
  for (const run of clears) await run().catch(() => {});
  for (const key of LOCAL_KEYS) remove(local, key);
}

const RESET_KEY = 'omark-demo:reset';
type Session = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * Has the next start reset the demo; the caller then reloads. The reset runs there, before anything opens the
 * databases, so a save this page still has in flight cannot land after it. False where session storage is blocked.
 */
export function requestDemoReset(session: Session = () => sessionStorage): boolean {
  try {
    session().setItem(RESET_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** The question Reset demo asks, in every part (Tasks' own reset asks the same). */
export const RESET_QUESTION = 'Reset the demo? Your demo edits are lost.';

/** Reset demo, in each part's footer and Settings: asks first, then reloads into a start that resets every part. */
export async function askDemoReset(
  env: { confirm(q: string): boolean; reload(): void; session?: Session; resetNow?: () => Promise<void> } = {
    confirm: (q) => window.confirm(q),
    reload: () => location.reload(),
  },
): Promise<void> {
  if (!env.confirm(RESET_QUESTION)) return;
  // Session storage blocked: reset now instead (as Tasks' own demo does), and the reload seeds again.
  if (!requestDemoReset(env.session)) await (env.resetNow ?? (() => resetDemo()))().catch(() => {});
  env.reload();
}

/** True once after `requestDemoReset`. */
export function takeDemoReset(session: Session = () => sessionStorage): boolean {
  try {
    const s = session();
    if (s.getItem(RESET_KEY) === null) return false;
    s.removeItem(RESET_KEY);
    return true;
  } catch {
    return false;
  }
}

function browserLocal(): Local | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function get(local: Local | null, key: string): string | null {
  try {
    return local?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(local: Local | null, key: string, value: string): void {
  try {
    local?.setItem(key, value);
  } catch {
    // Blocked: the next open takes today.
  }
}

function remove(local: Local | null, key: string): void {
  try {
    local?.removeItem(key);
  } catch {
    // Blocked: nothing was kept.
  }
}
