import { expect, test } from 'vitest';
import { FakeGoogleDrive, GoogleDriveAdapter, MemoryCache } from '@omark/storage';
import { defaultTimeConfigText, parseEventsFile, parseTimeConfig, serializeEventsFile } from '@omark/time-core';
import type { EventRow } from '@omark/time-core';
import { CONFIG, FolderFiles, PROJECTS, PROJECTS_HEADER } from './files.ts';

const TODAY = '2026-10-27';
const FOLDER = 'Omark Time';

function device(drive: FakeGoogleDrive) {
  const adapter = new GoogleDriveAdapter({ folder: FOLDER, getToken: async () => 't', fetch: drive.fetch });
  return new FolderFiles(adapter, new MemoryCache(), () => TODAY);
}

function row(eventId: string, date: string): EventRow {
  return {
    date,
    start: `${date}T09:00+01:00`,
    end: `${date}T10:00+01:00`,
    hours: 1,
    project: 'ACME',
    category: '',
    description: '',
    allDay: false,
    known: true,
    calendar: 'primary',
    eventId,
    extra: {},
  };
}

test('a missing file is created from its initial text', async () => {
  const drive = new FakeGoogleDrive({}, FOLDER);
  const files = device(drive);
  expect(await files.read(PROJECTS, PROJECTS_HEADER)).toBe(PROJECTS_HEADER);
  await expect.poll(() => drive.peek(PROJECTS)).toBe(PROJECTS_HEADER);
});

test('two devices changing config.yaml at once keep both changes', async () => {
  const drive = new FakeGoogleDrive({ [CONFIG]: defaultTimeConfigText(TODAY) }, FOLDER);
  const a = device(drive);
  const b = device(drive);
  const baseA = await a.read(CONFIG, '');
  const baseB = await b.read(CONFIG, '');
  await a.write(CONFIG, baseA.replace('colour_events: false', 'colour_events: true'), baseA);
  await expect.poll(() => drive.peek(CONFIG)).toContain('colour_events: true');
  // B's write carries B's old eTag: refused, so B reads A's file, applies its change again, and retries.
  await b.write(CONFIG, baseB.replace('all_day_hours: 8', 'all_day_hours: 6'), baseB);
  await expect.poll(() => parseTimeConfig(drive.peek(CONFIG) ?? '', TODAY).config.allDayHours).toBe(6);
  expect(parseTimeConfig(drive.peek(CONFIG)!, TODAY).config.colourEvents).toBe(true);
});

test('two devices writing a year file at once keep both devices\' rows', async () => {
  const name = 'events-2026.csv';
  const drive = new FakeGoogleDrive({ [name]: serializeEventsFile([row('a', '2026-10-20')]) }, FOLDER);
  const a = device(drive);
  const b = device(drive);
  const baseA = await a.read(name, '');
  const baseB = await b.read(name, '');
  await a.write(name, serializeEventsFile([row('a', '2026-10-20'), row('fromA', '2026-10-21')]), baseA);
  await expect.poll(() => drive.peek(name)).toContain('fromA');
  await b.write(name, serializeEventsFile([row('a', '2026-10-20'), row('fromB', '2026-10-22')]), baseB);
  await expect
    .poll(() => parseEventsFile(drive.peek(name) ?? '').rows.map((r) => r.eventId))
    .toEqual(['a', 'fromA', 'fromB']);
});

test('status says offline while the drive cannot be reached, and the copy still reads', async () => {
  const drive = new FakeGoogleDrive({ [PROJECTS]: `${PROJECTS_HEADER}ACME,Acme,,,,\n` }, FOLDER);
  const files = device(drive);
  expect(await files.read(PROJECTS, PROJECTS_HEADER)).toContain('ACME');
  drive.setOffline(true);
  expect(await files.read(PROJECTS, PROJECTS_HEADER)).toContain('ACME');
  expect(files.status()).toBe('offline');
});
