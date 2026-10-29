import { expect, it } from 'vitest';
import { FakeOneDrive } from '@omark/storage';
import { suggestionTags } from './tags.ts';

it("offers the unarchived project codes, then the area tags, from the Omark folder (Goals spec 9)", async () => {
  const root = new FakeOneDrive({
    'projects.csv': 'code,description,client,rate,currency,archived\nCLIMB,Climbing,,,,\nOLD,Old,,,,2025-01-01\nCOURSE,Course,,,,\n',
  });
  const goals = new FakeOneDrive({ 'goals.md': '## Health #health\n## Untagged\n## Family & friends #family-friends\n' });
  expect(await suggestionTags(root, goals)).toEqual(['CLIMB', 'COURSE', 'health', 'family-friends']);
});

it('offers none from a missing file, and null (keep what was offered) when a file cannot be read', async () => {
  const goals = new FakeOneDrive({ 'goals.md': '## Home #home\n' });
  expect(await suggestionTags(new FakeOneDrive(), goals)).toEqual(['home']);
  goals.setOffline(true);
  expect(await suggestionTags(new FakeOneDrive(), goals)).toBeNull();
});

it('offers each tag once, ignoring case, and no empty or bad code', async () => {
  const root = new FakeOneDrive({ 'projects.csv': 'code,description,client,rate,currency,archived\nCLIMB,a,,,,\nCLIMB,b,,,,\n,blank,,,,\n' });
  const goals = new FakeOneDrive({ 'goals.md': '## A #home\n## B #home\n## C #Climb\n' });
  expect(await suggestionTags(root, goals)).toEqual(['CLIMB', 'home']);
});
