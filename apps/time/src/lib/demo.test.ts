import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { createStore, get, set } from 'idb-keyval';
import { IdbCache, IdbDrive } from '@omark/storage';
import { parseProjects, parseTimeConfig } from '@omark/time-core';
import { DEMO_PREFS, demoFiles, demoStart, requestDemoReset, resetDemo, takeDemoReset } from './demo.ts';
import { storageMode } from '../storage-mode.ts';

test('VITE_STORAGE=demo is the demo mode', () => {
  expect(storageMode('demo')).toBe('demo');
});

test('the demo starts with its projects and colouring on, its first run done, signed in with edit access', () => {
  const files = demoFiles('2026-10-27');
  expect(parseProjects(files['projects.csv']!).projects.map((p) => p.code)).toEqual(['ACME', 'MYAPP', 'OLD']);
  const { config } = parseTimeConfig(files['config.yaml']!, '2026-10-27');
  expect(config).toMatchObject({ colourEvents: true, calendars: ['primary'] });
  expect(DEMO_PREFS).toEqual({ storage: 'google-drive', started: true, askedDrive: true, askedEdit: true });
});

test('the seed is dated around today, in the browser\'s time zone', () => {
  // Friday 23:30 UTC is already Saturday 24 October in Warsaw, so the window starts a day later than in UTC.
  const { calendars, events } = demoStart(Date.parse('2026-10-23T23:30:00Z'), 'Europe/Warsaw');
  expect(calendars[0]).toMatchObject({ id: 'primary', timeZone: 'Europe/Warsaw' });
  const days = events.flatMap((e) => (e.start && 'dateTime' in e.start ? [e.start.dateTime.slice(0, 10)] : [])).sort();
  expect(days[0]).toBe('2026-10-14');
  expect(days.at(-1)! <= '2026-10-28').toBe(true);
  expect(demoStart(Date.parse('2026-10-23T23:30:00Z'), 'UTC').events.some((e) => e.start && 'dateTime' in e.start && e.start.dateTime.startsWith('2026-10-13'))).toBe(true);
  expect(events.some((e) => e.title.startsWith('ACMEE'))).toBe(true);
});

test('reset empties every demo store, so the next open seeds again', async () => {
  const fake = createStore('omark-time-fake', 'fake');
  const prefs = createStore('omark-time-device', 'prefs');
  const state = createStore('omark-time-state', 'state');
  await set('calendar', { events: [] }, fake);
  await set('prefs', DEMO_PREFS, prefs);
  await set('google-drive', { tokens: { primary: 't' } }, state);
  const drive = new IdbDrive('omark-time-fake-drive');
  await drive.externalWrite('projects.csv', 'x');
  await new IdbCache('omark-time-cache-google-drive').put('projects.csv', { base: 'x', baseEtag: null, local: 'x', dirty: false });
  await resetDemo();
  expect(await get('calendar', fake)).toBeUndefined();
  expect(await get('prefs', prefs)).toBeUndefined();
  expect(await get('google-drive', state)).toBeUndefined();
  expect(await drive.isEmpty()).toBe(true);
  expect(await new IdbCache('omark-time-cache-google-drive').get('projects.csv')).toBeNull();
});

test('a reset asked for now happens at the next start, once', () => {
  const store = new Map<string, string>();
  const session = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  expect(takeDemoReset(session)).toBe(false);
  requestDemoReset(session);
  expect(takeDemoReset(session)).toBe(true);
  expect(takeDemoReset(session)).toBe(false);
});
