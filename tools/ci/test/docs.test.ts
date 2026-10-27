import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { formatRepeat, nextDate, parseDone, parseRepeat, parseTasks, serializeDone, serializeTasks } from '../../../packages/tasks-core/src/index.ts';

// The suite's docs set (#85, launch spec 6.7). Docs-only PRs skip CI, so this file is what makes a docs
// change run the checks.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n');

const rootDocs = ['README.md', 'PHILOSOPHY.md', 'AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'];
const docDocs = ['doc/format.md', 'doc/architecture.md', 'doc/self-hosting.md', 'doc/factory.md'];

/** A Markdown file's prose: code blocks and code spans removed (a file may be named `[[path]].ts`). */
const prose = (text: string) => text.replace(/^```[^\n]*\n[\s\S]*?^```[ \t]*$/gm, '').replace(/`[^`\n]*`/g, '');

/** Relative link targets in a Markdown file: `[text](target)`, without web links, mail links or bare anchors. */
function relativeLinks(text: string): string[] {
  return [...prose(text).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((m) => m[1]!)
    .filter((t) => !/^(https?:|mailto:|#)/.test(t));
}

describe('docs set', () => {
  test.each([...rootDocs, ...docDocs])('%s exists, has no wiki links, and its relative links resolve', (path) => {
    expect(existsSync(resolve(root, path)), path).toBe(true);
    const text = read(path);
    expect(prose(text)).not.toMatch(/\[\[[^\]]+\]\]/);
    for (const link of relativeLinks(text)) {
      const target = resolve(root, dirname(path), decodeURIComponent(link.replace(/#.*$/, '')));
      expect(existsSync(target), `${path} → ${link}`).toBe(true);
    }
  });

  test('LICENSE is MIT', () => {
    const text = read('LICENSE');
    expect(text).toMatch(/^MIT License\n/);
    expect(text).toContain('Permission is hereby granted, free of charge, to any person obtaining a copy');
    expect(text).toContain('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND');
  });

  test('README links the other docs', () => {
    const links = relativeLinks(read('README.md'));
    for (const doc of ['PHILOSOPHY.md', 'AGENTS.md', 'CONTRIBUTING.md', 'doc/format.md', 'doc/self-hosting.md']) {
      expect(links, doc).toContain(doc);
    }
  });

  test('CLAUDE.md imports AGENTS.md', () => {
    expect(read('CLAUDE.md').split('\n')[0]).toBe('@AGENTS.md');
  });

  // Today's CLAUDE.md rules, word for word (#85). 2.5 makes them role-neutral and changes this list.
  const rules = [
    "- [ ] A test written first that failed before the change; the PR quotes the failing line.",
    "- [ ] `pnpm typecheck`, `pnpm test`, the build and the e2e specs the change touches pass here; the full `pnpm e2e` passes in CI.",
    "- [ ] The PR follows the template, closes the issue and has the preview link.",
    "- [ ] A fresh-eyes review subagent (no memory of writing it) checked the diff against the issue or plan, and its findings are fixed.",
    "- [ ] Large work: every acceptance criterion in the plan is met or explicitly moved out.",
    "- [ ] Docs for changed behaviour are updated (README, the v1 spec, the `taskapp-files` skill when formats change).",
    "When main moves and the PR conflicts, merge main in (never rebase pushed work). For `pnpm-lock.yaml`, take main's copy and run `pnpm install`.",
    "Existing tests change only when the behaviour they cover is meant to change; the PR says which and why. When sync or storage changed, list `pnpm e2e:real` (manual) under \"try this\".",
    "Follow the `taskapp-factory` skill: pick up, size (`size:small` / `size:large`), plan large work and wait for approval, implement test-first, open the PR, hand over. For the file formats use the `taskapp-files` skill.",
    "- Never push to `main`, never merge, never force-push.",
    "- Never run Promote to production unless AL asks for it in this conversation.",
    "- Never delete or rewrite task lines in AL's real files (`ALAI/TaskApp`). For anything real use `TaskApp-e2e` (in the app folder, as the real e2e does) or `ALAI/TaskApp-staging`.",
    "- Never ask for a secret in chat. The cloud session has none and needs none.",
    "- Steps only AL can do (Entra, his PC, dashboards, billing) get the `needs-human` label and short numbered instructions.",
    "Plain, short English in docs, comments, issues and PRs. Commit messages are short imperative sentences (\"Add tasks.md parser\").",
  ];

  test.each(rules)('AGENTS.md keeps the rule %s', (rule) => {
    expect(read('AGENTS.md').split('\n')).toContain(rule);
  });

  test('CLAUDE.md keeps the cloud-session GitHub note', () => {
    expect(read('CLAUDE.md')).toContain('`gh issue` and `gh pr` (GraphQL) are blocked by the proxy.');
  });
});

describe('doc/format.md', () => {
  const format = read('doc/format.md');
  const lines = format.split('\n');
  const blocks = [...format.matchAll(/^```markdown[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((m) => m[1]!);

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

  test('has tasks.md and done.md examples, and every one is checked', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks).toHaveLength(lines.filter((l) => /^```markdown[ \t]*$/.test(l)).length);
  });

  test.each(blocks.map((b, i) => [i, b] as const))('markdown example %i round-trips', (_i, block) => {
    if (block.startsWith('- [')) expect(serializeDone(parseDone(block))).toBe(block);
    else expect(serializeTasks(parseTasks(block))).toBe(block);
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
});
