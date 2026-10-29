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

it('offers none from files that are missing or cannot be read', async () => {
  const root = new FakeOneDrive();
  const goals = new FakeOneDrive({ 'goals.md': '## Home #home\n' });
  goals.setOffline(true);
  expect(await suggestionTags(root, goals)).toEqual([]);
});
