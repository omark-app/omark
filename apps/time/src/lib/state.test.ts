import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { freshState, IdbState } from './state.ts';

test('the device state round-trips through IndexedDB, one record per storage place', async () => {
  const drive = new IdbState('google-drive');
  const other = new IdbState('onedrive' as never);
  expect(await drive.load()).toEqual(freshState());
  const state = {
    ...freshState(),
    tokens: { primary: 'tok' },
    lastToday: '2026-10-27',
    colourQueue: [{ calendarId: 'primary', eventId: 'a', patch: { colorId: '10', marker: 'green' as const }, at: 1 }],
  };
  await drive.save(state);
  expect(await new IdbState('google-drive').load()).toEqual(state);
  expect(await other.load()).toEqual(freshState());
  await drive.clear();
  expect(await drive.load()).toEqual(freshState());
});
