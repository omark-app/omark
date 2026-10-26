import { expect, test } from 'vitest';
import {
  PROJECT_COLUMNS,
  activeProjects,
  addProject,
  archiveProject,
  deleteProject,
  knownCodes,
  mergeProjects,
  parseProjects,
  serializeProjects,
  updateProject,
  validateProject,
  type Project,
} from '../src/projects.ts';

const SAMPLE = `code,description,client,rate,currency,archived
ACME,Acme Corp website rebuild,Acme Corp,120,EUR,
MYAPP,My app - product work,,,,
OLD,Old client,Old Co,90,PLN,2026-06-30
`;

const proj = (code: string, over: Partial<Project> = {}): Project => ({
  code,
  description: '',
  client: '',
  rate: null,
  currency: '',
  archived: '',
  extra: {},
  ...over,
});

test('the spec sample round-trips', () => {
  const f = parseProjects(SAMPLE);
  expect(f.projects.map((p) => p.code)).toEqual(['ACME', 'MYAPP', 'OLD']);
  expect(f.projects[0]!.rate).toBe(120);
  expect(f.problems).toEqual([]);
  expect(serializeProjects(f)).toBe(SAMPLE);
});

test('empty text has no projects and the six columns', () => {
  const f = parseProjects('');
  expect(f.projects).toEqual([]);
  expect(f.columns).toEqual([...PROJECT_COLUMNS]);
  expect(PROJECT_COLUMNS).toEqual(['code', 'description', 'client', 'rate', 'currency', 'archived']);
});

test('keeps the file column order, extra columns and a BOM-prefixed header', () => {
  const f = parseProjects('﻿code,description,rate,currency,owner\r\nacme,"Acme, Inc",120,,ann\r\n');
  const p = f.projects[0]!;
  expect(p.code).toBe('ACME');
  expect(p.description).toBe('Acme, Inc');
  expect(p.extra.owner).toBe('ann');
  expect(f.problems).toEqual([{ line: 2, message: 'Rate needs a currency' }]);
  expect(f.columns).toEqual(['code', 'description', 'rate', 'currency', 'owner', 'client', 'archived']);
  expect(serializeProjects({ ...f, columns: f.columns.slice(0, 5) })).toBe(
    'code,description,rate,currency,owner\nACME,"Acme, Inc",120,,ann\n',
  );
});

test('header names are matched case-insensitively', () => {
  const f = parseProjects('Code, Description\nacme,x\n');
  expect(f.projects[0]!.code).toBe('ACME');
  expect(f.projects[0]!.description).toBe('x');
  expect(f.columns.slice(0, 2)).toEqual(['Code', ' Description']);
});

test('problems carry line numbers and rows stay', () => {
  const text = [
    'code,description,client,rate,currency,archived',
    'Q&A,bad,,,,',
    'ACME,one,,,,',
    'ACME,two,,,,',
    'RATE,r,,abc,EUR,',
    'CUR,c,,5,EURO,',
    'ARC,a,,,,soon',
    '',
  ].join('\n');
  const f = parseProjects(text);
  expect(f.projects).toHaveLength(6);
  expect(f.problems).toEqual([
    { line: 2, message: 'Code must be 2–20 letters, digits or _, starting with a letter' },
    { line: 4, message: 'ACME already exists' },
    { line: 5, message: 'Rate must be a number' },
    { line: 6, message: 'Currency must be a 3-letter code like EUR' },
    { line: 7, message: 'Archived must be a date (YYYY-MM-DD)' },
  ]);
  expect(f.projects[5]!.archived).toBe('soon');
  expect(serializeProjects(f)).toContain('Q&A,bad');
  expect(knownCodes(f.projects).has('Q&A')).toBe(false);
  expect(activeProjects(f.projects).map((p) => p.code)).not.toContain('ARC');
});

test('knownCodes includes archived, activeProjects does not', () => {
  const f = parseProjects(SAMPLE);
  expect(knownCodes(f.projects).has('OLD')).toBe(true);
  expect(activeProjects(f.projects).map((p) => p.code)).toEqual(['ACME', 'MYAPP']);
});

test('validateProject messages', () => {
  const others = [proj('ACME')];
  expect(validateProject(proj('1x'), others)).toBe('Code must be 2–20 letters, digits or _, starting with a letter');
  expect(validateProject(proj('ACME'), others)).toBe('ACME already exists');
  expect(validateProject(proj('NEW', { rate: 5 }), others)).toBe('Rate needs a currency');
  expect(validateProject(proj('NEW', { rate: 5, currency: 'EUR' }), others)).toBeNull();
});

test('addProject upper-cases and throws on invalid', () => {
  const f = parseProjects(SAMPLE);
  const g = addProject(f, proj('new', { rate: 10, currency: 'eur' }));
  expect(g.projects.at(-1)).toMatchObject({ code: 'NEW', currency: 'EUR' });
  expect(f.projects).toHaveLength(3);
  expect(() => addProject(f, proj('acme'))).toThrow('ACME already exists');
});

test('updateProject keeps extra, archive and delete work', () => {
  const f = parseProjects('code,description,owner\nACME,x,ann\n');
  const g = updateProject(f, 'acme', { description: 'y' });
  expect(g.projects[0]).toMatchObject({ description: 'y', extra: { owner: 'ann' } });
  expect(() => updateProject(f, 'NOPE', {})).toThrow('NOPE not found');
  expect(() => updateProject(f, 'ACME', { rate: 1 })).toThrow('Rate needs a currency');
  expect(archiveProject(g, 'ACME', '2026-10-01').projects[0]!.archived).toBe('2026-10-01');
  expect(deleteProject(g, 'ACME').projects).toEqual([]);
  expect(deleteProject(g, 'NOPE').projects).toHaveLength(1);
});

const BASE = 'code,description,client,rate,currency,archived\nACME,Acme,,100,EUR,\nOLD,Old,,,,\n';

test('merge: both sides add and edit different fields', () => {
  const local = BASE + 'NEW,New,,,,\n';
  const remote = BASE.replace('100', '120');
  const m = parseProjects(mergeProjects(BASE, local, remote));
  expect(m.projects.map((p) => p.code)).toEqual(['ACME', 'OLD', 'NEW']);
  expect(m.projects[0]!.rate).toBe(120);
});

test('merge: conflicting edit takes local', () => {
  const local = BASE.replace('Acme,', 'Local,');
  const remote = BASE.replace('Acme,', 'Remote,');
  expect(parseProjects(mergeProjects(BASE, local, remote)).projects[0]!.description).toBe('Local');
});

test('merge: local edit beats remote delete; unchanged is deleted', () => {
  const local = BASE.replace('Old,', 'Older,');
  const remote = 'code,description,client,rate,currency,archived\nACME,Acme,,100,EUR,\n';
  const m = parseProjects(mergeProjects(BASE, local, remote));
  expect(m.projects.map((p) => p.description)).toEqual(['Acme', 'Older']);
  const m2 = parseProjects(mergeProjects(BASE, BASE, remote));
  expect(m2.projects.map((p) => p.code)).toEqual(['ACME']);
});

test('merge: same row added on both sides is one row', () => {
  const add = BASE + 'X,Same,,,,\n';
  expect(parseProjects(mergeProjects(BASE, add, add)).projects.filter((p) => p.code === 'X')).toHaveLength(1);
});

test('merge: remote column survives a local edit', () => {
  const base = 'code,description,owner\nACME,a,\n';
  const remote = 'code,description,owner\nACME,a,ann\n';
  const local = 'code,description\nACME,b\n';
  const m = parseProjects(mergeProjects(base, local, remote));
  expect(m.projects[0]).toMatchObject({ description: 'b', extra: { owner: 'ann' } });
});

test.each(['abc', '12,5', '-5'])('invalid rate %s is kept as typed', (raw) => {
  const text = `code,description,client,rate,currency,archived\nBAD,x,,"${raw}",EUR,\nOK,y,,,,\n`;
  const f = parseProjects(text);
  expect(f.projects[0]!.rate).toBeNull();
  expect(f.problems).toEqual([{ line: 2, message: 'Rate must be a number' }]);
  expect(serializeProjects(f)).toBe(text.replace(`"${raw}"`, raw.includes(',') ? `"${raw}"` : raw));
  const g = updateProject(f, 'OK', { description: 'z' });
  expect(g.problems.map((p) => p.message)).toEqual(['Rate must be a number']);
  expect(serializeProjects(g)).toContain(raw);
  const remote = text.replace('OK,y,', 'OK,w,');
  const m = mergeProjects(text, text, remote);
  expect(m).toContain(raw);
  expect(parseProjects(m).projects[1]!.description).toBe('w');
});

test('a row with an old problem can still be archived and edited', () => {
  const f = parseProjects('code,description,rate,currency\nACME,x,5,\n');
  expect(archiveProject(f, 'ACME', '2026-10-01').projects[0]!.archived).toBe('2026-10-01');
  expect(updateProject(f, 'ACME', { description: 'y' }).projects[0]!.description).toBe('y');
  expect(() => archiveProject(f, 'ACME', 'soon')).toThrow('Archived must be a date');
});

test('an edit that adds a problem still throws', () => {
  const f = parseProjects('code,rate,currency\nACME,5,EUR\n');
  expect(() => updateProject(f, 'ACME', { currency: 'EURO' })).toThrow('Currency must be a 3-letter code like EUR');
});

test('setting a rate replaces an invalid one', () => {
  const f = parseProjects('code,rate,currency\nACME,abc,EUR\n');
  const g = updateProject(f, 'ACME', { rate: 7 });
  expect(g.problems).toEqual([]);
  expect(serializeProjects(g)).toContain('ACME,7,EUR');
});
