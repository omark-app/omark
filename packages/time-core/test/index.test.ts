import { expect, test } from 'vitest';
import {
  SyncTokenExpiredError,
  parseInstant,
  parseTitle,
  parseCsv,
  roundHours,
  eventToRows,
  parseEventsFile,
  applyChanges,
  colourAction,
  parseProjects,
  parseTimeConfig,
  groupCategories,
  summarise,
  weeklyByProject,
  buildFixList,
  buildReport,
} from '../src/index.ts';

test('the index exports one runtime name from every module', () => {
  const names = [
    SyncTokenExpiredError, // source
    parseInstant, // zone
    parseTitle, // title
    parseCsv, // csv
    roundHours, // hours
    eventToRows, // rows
    parseEventsFile, // events-file
    applyChanges, // apply
    colourAction, // colour
    parseProjects, // projects
    parseTimeConfig, // config
    groupCategories, // categories
    summarise, // summary
    weeklyByProject, // charts
    buildFixList, // fix-list
    buildReport, // report
  ];
  for (const name of names) {
    expect(name).toBeDefined();
  }
});
