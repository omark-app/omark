import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  allTasks, completeTask, DEFAULT_CONFIG, formatRepeat, nextDate, parseDone, parseRepeat, parseTasks, serializeDone,
  serializeTasks,
} from '../../../packages/tasks-core/src/index.ts';
import {
  buildReport, defaultTimeConfigText, EVENT_COLUMNS, formatHours, parseEventsFile, parseProjects, parseTitle,
  PROJECT_COLUMNS, reportToMarkdown, serializeEventsFile, serializeProjects, summarise, weekStartOf,
} from '../../../packages/time-core/src/index.ts';

// The suite's docs set (#85, launch spec 6.7). CI skips PRs that change only `doc/**` and `*.md`, so these
// checks run on a docs change only when a maintainer or agent runs `pnpm test` before pushing.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

const rootDocs = ['README.md', 'PHILOSOPHY.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'];
const docDocs = [
  'doc/format.md', 'doc/architecture.md', 'doc/self-hosting.md', 'doc/factory.md', 'doc/tasks/spec.md', 'doc/tasks/habits-spec.md',
  'doc/time/spec.md',
];

/** A Markdown file's prose: code blocks and code spans removed (a file may be named `[[path]].ts`). */
const prose = (text: string) => text.replace(/^[ \t]*```[^\n]*\n[\s\S]*?^[ \t]*```[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');

/** Link targets in a Markdown file: `[text](target)`, without web links and mail links. */
function links(text: string): string[] {
  return [...prose(text).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!).filter((t) => !/^(https?:|mailto:)/.test(t));
}

/** Relative link targets, without bare anchors. */
const relativeLinks = (text: string) => links(text).filter((t) => !t.startsWith('#'));

/** GitHub's anchors for a Markdown file's headings. */
function anchors(text: string): Set<string> {
  const slugs = [...prose(text).matchAll(/^#{1,6}[ \t]+(.+)$/gm)].map((m) =>
    m[1]!.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'),
  );
  return new Set(slugs);
}

describe('docs set', () => {
  test.each([...rootDocs, ...docDocs])('%s exists, has no wiki links, and its links and anchors resolve', (path) => {
    expect(existsSync(resolve(root, path)), path).toBe(true);
    const text = read(path);
    expect(prose(text)).not.toMatch(/\[\[[^\]]+\]\]/);
    for (const link of links(text)) {
      const [file, anchor] = link.split('#') as [string, string | undefined];
      const target = file === '' ? resolve(root, path) : resolve(root, dirname(path), decodeURIComponent(file));
      expect(existsSync(target), `${path} → ${link}`).toBe(true);
      if (anchor && target.endsWith('.md')) {
        expect(anchors(readFileSync(target, 'utf8')).has(anchor), `${path} → ${link}`).toBe(true);
      }
    }
  });

  test('LICENSE is MIT', () => {
    const text = read('LICENSE');
    expect(text).toMatch(/^MIT License\n/);
    expect(text).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy');
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  test('README links the other docs', () => {
    const readmeLinks = relativeLinks(read('README.md'));
    for (const doc of ['PHILOSOPHY.md', 'AGENTS.md', 'CONTRIBUTING.md', 'doc/format.md', 'doc/self-hosting.md']) {
      expect(readmeLinks, doc).toContain(doc);
    }
  });

  test('CLAUDE.md imports AGENTS.md', () => {
    expect(read('CLAUDE.md').split('\n')[0]).toBe('@AGENTS.md');
  });

  test('AGENTS.md has the "Hard rules" heading the guard points to', () => {
    expect(read('AGENTS.md')).toMatch(/^## Hard rules$/m);
    expect(read('tools/claude-guard/guard.mjs')).toContain('See AGENTS.md, Hard rules.');
  });

  // The rules every agent follows, role-neutral since #96 (they named AL before). Changing one is a decision,
  // so it changes here too.
  const rules = [
    "- [ ] A test written first that failed before the change; the PR quotes the failing line.",
    "- [ ] `pnpm typecheck`, `pnpm test`, the build and the e2e specs the change touches pass here; the full `pnpm e2e` passes in CI.",
    "- [ ] The PR follows the template, closes the issue and, for a branch in this repository, has the preview link.",
    "- [ ] A fresh-eyes review subagent (no memory of writing it) checked the diff against the issue or plan, and its findings are fixed.",
    "- [ ] Large work: every acceptance criterion in the plan is met or explicitly moved out.",
    "- [ ] Docs for changed behaviour are updated (README, the app's spec in `doc/tasks/` or `doc/time/`, and `doc/format.md` and the skills when formats change).",
    "When main moves and the PR conflicts, merge main in (never rebase pushed work). For `pnpm-lock.yaml`, take main's copy and run `pnpm install`.",
    "Existing tests change only when the behaviour they cover is meant to change; the PR says which and why. When sync or storage changed, list `pnpm e2e:real` (manual) under \"How to try it\".",
    "Follow the `omark-factory` skill: pick up, size (`size:small` / `size:large`), plan large work and wait for a maintainer's approval, implement test-first, open the PR, hand over. For the file formats use the `taskapp-files` and `omark-time` skills.",
    "- Never push to `main`, never merge, never force-push.",
    "- Never run Promote to production unless a maintainer asks for it in this conversation.",
    "- Never treat a plan as approved until `node tools/ci/plan-approval.mjs <issue>` says so.",
    "- Never delete or rewrite task lines in a user's real files, the maintainers' included. For anything real use `TaskApp-e2e` (in the app folder, as the real e2e does) or a staging folder.",
    "- Never ask for a secret in chat. The cloud session has none and needs none.",
    "- Steps only a maintainer can do (accounts, dashboards, devices, billing) get the `needs-human` label and short numbered instructions.",
    "Plain, short English in docs, comments, issues and PRs. Commit messages are short imperative sentences (\"Add tasks.md parser\").",
  ];

  test.each(rules)('AGENTS.md keeps the rule %s', (rule) => {
    expect(read('AGENTS.md').split('\n')).toContain(rule);
  });

  // Outside contributors and their agents read these; they name roles, never a person (#96).
  const agentFacing = [
    'AGENTS.md', 'CLAUDE.md', '.claude/skills/omark-factory/SKILL.md', '.claude/skills/taskapp-files/SKILL.md',
    '.claude/skills/omark-time/SKILL.md', '.github/pull_request_template.md', '.github/ISSUE_TEMPLATE/bug.yml',
    '.github/ISSUE_TEMPLATE/feature.yml', '.github/ISSUE_TEMPLATE/task.yml', '.github/DISCUSSION_TEMPLATE/ideas.yml',
    '.github/labels.yml', 'doc/factory.md', 'CONTRIBUTING.md',
  ];
  test.each(agentFacing)('%s names no person', (path) => {
    expect(read(path)).not.toMatch(/\bAL\b/);
  });

  test('the factory skill is omark-factory', () => {
    expect(read('.claude/skills/omark-factory/SKILL.md')).toMatch(/^---\nname: omark-factory\ndescription: .+\n---\n/);
    expect(existsSync(resolve(root, '.claude/skills/taskapp-factory'))).toBe(false);
  });

  test('the taskapp-files skill points to the format and names no local folder', () => {
    const skill = read('.claude/skills/taskapp-files/SKILL.md');
    expect(skill).toContain('doc/format.md');
    expect(skill).not.toMatch(/[A-Z]:\\|ALAI|OneDrive\\/);
  });

  // Code and config cite docs by path in comments; after the moves (#95, #96) they point to the current ones (#103).
  const moved = [
    'TaskApp factory spec.md', 'TaskApp cloud environment.md', 'TaskApp v1 spec.md', 'TaskApp habits spec.md',
    'Omark Time spec.md', 'TaskApp spike findings.md', 'TaskApp v1 acceptance checklist.md', 'TaskApp ideation.md',
  ];
  const codeFiles = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f !== '' && !f.endsWith('.md') && !f.startsWith('doc/') && f !== 'tools/ci/test/docs.test.ts')
    .filter((f) => existsSync(resolve(root, f)));
  test('no code or config file cites a moved doc', () => {
    const stale = codeFiles.flatMap((f) => {
      const text = readFileSync(resolve(root, f), 'utf8');
      return moved.filter((m) => text.includes(m)).map((m) => `${f}: ${m}`);
    });
    expect(stale).toEqual([]);
  });

  test('the workflows name no person', () => {
    for (const f of codeFiles.filter((f) => f.startsWith('.github/workflows/'))) expect(read(f), f).not.toMatch(/\bAL\b/);
  });

  test('the factory spec and cloud environment notes are history', () => {
    for (const name of ['TaskApp factory spec.md', 'TaskApp cloud environment.md']) {
      expect(existsSync(resolve(root, 'doc', name)), name).toBe(false);
      expect(read(`doc/history/${name}`).split('\n')[2], name).toMatch(/^> Historical, may be out of date\./);
    }
  });

  test('CLAUDE.md keeps the cloud-session GitHub note', () => {
    expect(read('CLAUDE.md')).toContain('`gh issue` and `gh pr` (GraphQL) are blocked by the proxy.');
  });
});

describe('doc/format.md', () => {
  const format = read('doc/format.md');
  const lines = format.split('\n');
  const blocks = [...format.matchAll(/^```markdown[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]!);
  const tasksBlocks = blocks.filter((b) => b.startsWith('# Tasks'));
  const doneBlocks = blocks.filter((b) => b.startsWith('- ['));

  /** Cells of every row under `header` (after the separator) up to the first non-table line. */
  function tableRows(header: string): string[][] {
    const at = lines.findIndex((l) => l.trim() === header);
    if (at < 0) return [];
    const rows: string[][] = [];
    for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++) {
      rows.push(lines[i]!.split('|').slice(1, -1).map((c) => c.trim()));
    }
    return rows;
  }
  const unquote = (c: string) => c.replace(/^`|`$/g, '');

  test('states its version', () => {
    expect(format).toMatch(/^Version: 1\.0$/m);
  });

  test('every markdown example is a tasks.md or a done.md, and every one is checked', () => {
    expect(tasksBlocks.length).toBeGreaterThanOrEqual(3);
    expect(doneBlocks.length).toBeGreaterThanOrEqual(3);
    expect(tasksBlocks.length + doneBlocks.length).toBe(blocks.length);
    expect(blocks).toHaveLength(lines.filter((l) => /^```markdown[ \t]*$/.test(l)).length);
  });

  test.each(blocks.map((b, i) => [i, b] as const))('markdown example %i round-trips', (_i, block) => {
    if (block.startsWith('- [')) expect(serializeDone(parseDone(block))).toBe(block);
    else expect(serializeTasks(parseTasks(block))).toBe(block);
  });

  // Round-tripping keeps any text, so check that every field was read as a field, not left in the title.
  test.each(tasksBlocks.map((b, i) => [i, b] as const))('tasks.md example %i: every field is read', (_i, block) => {
    const tasks = allTasks(parseTasks(block));
    expect(tasks.length).toBe(block.split('\n').filter((l) => l.startsWith('- [ ]')).length);
    for (const t of tasks) expect(t.title, t.title).not.toMatch(/⏫|🌱|🔁|📅/u);
  });

  test.each(doneBlocks.map((b, i) => [i, b] as const))('done.md example %i: every line is an entry or a habit end', (_i, block) => {
    for (const line of parseDone(block).lines) {
      if (/^\s/.test(line.raw)) continue;
      expect(line.entry ?? line.end, line.raw).toBeTruthy();
      if (line.entry) expect(line.entry.title, line.raw).not.toMatch(/⏫|🌱|🔁|✅/u);
    }
  });

  test('the completion example is what completing the task does', () => {
    const before = tasksBlocks.find((b) => b.includes('Pay rent') && b.includes('📅 2026-11-01'))!;
    const after = tasksBlocks.find((b) => b.includes('Pay rent') && b.includes('📅 2026-12-01'))!;
    const log = doneBlocks.find((b) => b.includes('Pay rent') && b.includes('✅ 2026-11-01'))!;
    let n = 0;
    const doc = parseTasks(before, () => `id${++n}`);
    const id = allTasks(doc).find((t) => t.title === 'Pay rent')!.id;
    const { state } = completeTask({ doc, done: parseDone('') }, id, '2026-11-01');
    const rent = (text: string) => text.slice(text.indexOf('- [ ] Pay rent')).split('\n').slice(0, 2).join('\n');
    expect(rent(serializeTasks(state.doc))).toBe(rent(after));
    expect(serializeDone(state.done)).toBe(log);
  });

  const nextRows = tableRows('| rule | due | completed on | next |');
  test('has a next-date table', () => {
    expect(nextRows.length).toBeGreaterThanOrEqual(8);
  });

  test.each(nextRows)('%s, due %s, completed %s -> %s', (...cells) => {
    expect(cells).toHaveLength(4);
    const [rule, due, completedOn, next] = cells;
    const parsed = parseRepeat(unquote(rule!));
    expect(parsed).not.toBeNull();
    expect(nextDate(parsed!, due === 'none' ? null : due!, completedOn!)).toBe(next);
  });

  const wording = tableRows('| rule | meaning |');
  test('every rule in the wording table parses and formats back to itself', () => {
    expect(wording.length).toBeGreaterThanOrEqual(8);
    for (const cells of wording) {
      const text = unquote(cells[0]!);
      const parsed = parseRepeat(text);
      expect(parsed, text).not.toBeNull();
      expect(formatRepeat(parsed!), text).toBe(text);
    }
  });

  test('the config table lists every key, and no other', () => {
    const keys = tableRows('| key | values (default first) |').map((cells) => unquote(cells[0]!));
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
  });

  test('every shortcut command is listed', () => {
    const commands = tableRows('| command | default keys |').map((cells) => unquote(cells[0]!));
    expect(commands.sort()).toEqual(Object.keys(DEFAULT_CONFIG.shortcuts).sort());
  });
});

/** Cells of every row under `header` (after the separator) up to the first non-table line. */
function tableIn(text: string, header: string): string[][] {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === header);
  if (at < 0) return [];
  const rows: string[][] = [];
  for (let i = at + 2; i < lines.length && lines[i]!.startsWith('|'); i++) {
    rows.push(lines[i]!.split('|').slice(1, -1).map((c) => c.trim().replace(/^`|`$/g, '')));
  }
  return rows;
}

// Omark Time for agents (#60): the format, the skill and the DuckDB examples, checked against time-core.
describe('Omark Time docs', () => {
  const format = read('doc/format.md');
  const skill = read('.claude/skills/omark-time/SKILL.md');
  const readme = read('README.md');
  const eventsText = read('doc/time/examples/events-2026.csv');
  const projectsText = read('doc/time/examples/projects.csv');
  const { rows, badLines } = parseEventsFile(eventsText);
  const projects = parseProjects(projectsText);
  const october = { from: '2026-10-01', to: '2026-10-31' };
  const now = Date.now();

  test('the skill has its frontmatter', () => {
    expect(skill).toMatch(/^---\nname: omark-time\ndescription: .+\n---\n/);
  });

  test('the example files are what the app writes', () => {
    expect(badLines).toEqual([]);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(serializeEventsFile(rows)).toBe(eventsText);
    expect(projects.problems).toEqual([]);
    expect(serializeProjects(projects)).toBe(projectsText);
  });

  test('every example row has already ended, so done hours do not depend on the day the test runs', () => {
    expect(rows.every((r) => Date.parse(r.end) <= now)).toBe(true);
  });

  test('format.md lists the files\' columns and config keys as the app writes them', () => {
    expect(format).toContain('\n' + EVENT_COLUMNS.join(',') + '\n');
    expect(format).toContain('\n' + PROJECT_COLUMNS.join(',') + '\n');
    const keys = defaultTimeConfigText('2026-01-01').split('\n').filter(Boolean).map((l) => l.split(':')[0]);
    expect(tableIn(format, '| key | meaning | default |').map((r) => r[0])).toEqual(keys);
  });

  const titles = tableIn(format, '| title | code | category | description | known |');
  test('format.md has the title table', () => {
    expect(titles.length).toBeGreaterThanOrEqual(8);
  });

  test.each(titles)('title %s', (title, code, category, description, known) => {
    const parsed = parseTitle(title!, new Set(['ACME']));
    if (code === 'not structured') {
      expect(parsed).toBeNull();
      return;
    }
    const none = (c: string) => (c === '(none)' ? '' : c);
    expect(parsed).toEqual({ code, category: none(category!), description: none(description!), known: known === 'yes' });
  });

  // The SQL itself is checked by hand with DuckDB (#60); these check the results the docs show.
  const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : 1);

  test('README: hours per project and category in October match the app\'s summary, in its order', () => {
    const table = tableIn(readme, '| project | category | hours |');
    const summary = summarise(rows, october, now);
    const expected = [...summary.projects]
      .sort(byCode)
      .flatMap((p) => p.categories.map((c) => [p.code, c.name, formatHours(c.done)]));
    expect(table).toEqual(expected);
  });

  test('README: the weekly trend matches the app\'s summary for every Monday week with done hours', () => {
    const table = tableIn(readme, '| week | project | hours |');
    const weeks = [...new Set(rows.filter((r) => r.known).map((r) => weekStartOf(r.date, 'monday')))].sort();
    expect(weeks.length).toBeGreaterThanOrEqual(3);
    const expected = weeks.flatMap((from) => {
      const to = new Date(Date.parse(`${from}T00:00Z`) + 6 * 86400_000).toISOString().slice(0, 10);
      return summarise(rows, { from, to }, now)
        .projects.filter((p) => p.done > 0)
        .sort(byCode)
        .map((p) => [from, p.code, formatHours(p.done)]);
    });
    expect(table).toEqual(expected);
  });

  test('format.md: the CSV snippets read as the app reads them', () => {
    const csv = [...format.matchAll(/^```csv\n([\s\S]*?)^```$/gm)].map((m) => m[1]!);
    expect(csv).toHaveLength(2);
    const events = parseEventsFile(csv[0]!);
    expect(events.badLines).toEqual([]);
    expect(events.rows).toHaveLength(2);
    expect(serializeProjects(parseProjects(csv[1]!))).toBe(projectsText);
  });

  const reportOptions = { range: october, client: 'Acme Corp', rounding: 0 as const, includePlanned: false, nowMs: now };

  test('skill: the client totals match the app\'s report', () => {
    const table = tableIn(skill, '| project | hours | currency | amount |');
    const report = buildReport(rows, projects.projects, reportOptions);
    expect(table).toEqual(
      report.projects.map((p) => [p.code, formatHours(p.hours), p.money?.currency ?? '', p.money ? p.money.amount.toFixed(2) : '']),
    );
  });

  test('skill: the report example is the app\'s Markdown export', () => {
    const block = /^````markdown\n([\s\S]*?)^````$/m.exec(skill);
    expect(block).not.toBeNull();
    expect(block![1]).toBe(reportToMarkdown(buildReport(rows, projects.projects, reportOptions)));
  });
});
