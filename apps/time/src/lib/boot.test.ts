import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { IdbCache, SavedFolder } from '@omark/storage';
import type { FolderHandle } from '@omark/storage';
import { forgetDevice } from './boot.ts';
import { freshState, IdbState } from './state.ts';

test('forgetting the device clears Google Drive\'s and the picked folder\'s copies, states and the folder itself', async () => {
  const copy = { base: 'x', baseEtag: '"1"', local: 'x', dirty: false };
  await new IdbCache('omark-time-cache-google-drive').put('config.yaml', copy);
  await new IdbState('google-drive').save({ ...freshState(), tokens: { primary: 't' } });
  const saved = new SavedFolder('omark-time:picked-folder');
  const { id } = await saved.save({ name: 'Hours', kind: 'directory' } as unknown as FolderHandle);
  await new IdbCache(`omark-time-cache-folder-${id}`).put('config.yaml', copy);
  await new IdbState(`folder-${id}`).save({ ...freshState(), tokens: { primary: 't' } });

  await forgetDevice();

  expect(await new IdbCache('omark-time-cache-google-drive').get('config.yaml')).toBeNull();
  expect(await new IdbState('google-drive').load()).toEqual(freshState());
  expect(await new IdbCache(`omark-time-cache-folder-${id}`).get('config.yaml')).toBeNull();
  expect(await new IdbState(`folder-${id}`).load()).toEqual(freshState());
  expect(await saved.load()).toBeNull();
});
