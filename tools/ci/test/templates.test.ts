import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The issue forms, the Ideas form, the PR template and CODEOWNERS (#96, launch spec 6.8).
const path = (p: string) => new URL(`../../../.github/${p}`, import.meta.url);
const text = (p: string) => readFileSync(path(p), 'utf8').replace(/\r\n/g, '\n');

interface Field {
  type: string;
  id?: string;
  attributes: { label?: string; options?: string[] };
  validations?: { required?: boolean };
}
interface Form {
  name: string;
  description: string;
  labels?: string[];
  body: Field[];
}
const form = (p: string) => parse(text(p)) as Form;

/** The labels of the form's fields, with `*` after the required ones. */
const fields = (f: Form) =>
  f.body.filter((b) => b.type !== 'markdown').map((b) => `${b.attributes.label}${b.validations?.required ? '*' : ''}`);

const APP = ['Omark Tasks', 'Omark Time', 'Omark Goals', 'Several, or the whole suite'];

describe('issue forms', () => {
  it.each([
    ['bug.yml', 'bug', ['App*', 'What happened*', 'What I expected*', 'Build number*', 'OS and browser*', 'Installed or in a tab*', 'Storage*', 'Steps']],
    ['feature.yml', 'enhancement', ['App*', 'The problem*', 'Who has it*', 'Link to the Ideas discussion', "How I'll know it works*"]],
    ['task.yml', 'task', ['App*', 'What and why*', 'Done when*']],
  ])('%s adds %s and has its fields', (file, label, expected) => {
    const f = form(`ISSUE_TEMPLATE/${file}`);
    expect(f.labels).toEqual([label]);
    expect(fields(f)).toEqual(expected);
    const app = f.body.find((b) => b.attributes.label === 'App')!;
    expect(app.type).toBe('dropdown');
    expect(app.attributes.options).toEqual(APP);
  });

  it('turn blank issues off and link security reports and questions', () => {
    const config = parse(text('ISSUE_TEMPLATE/config.yml')) as { blank_issues_enabled: boolean; contact_links: { name: string; url: string }[] };
    expect(config.blank_issues_enabled).toBe(false);
    expect(config.contact_links.map((l) => l.name)).toEqual(['Report a security problem', 'Ask a question']);
    expect(config.contact_links[0]!.url).toBe('https://github.com/omark-app/omark/security/advisories/new');
    expect(config.contact_links[1]!.url).toBe('https://github.com/omark-app/omark/discussions/categories/q-a');
  });
});

describe('the Ideas form', () => {
  it('asks for the problem, how it is handled today, and which app', () => {
    const f = parse(text('DISCUSSION_TEMPLATE/ideas.yml')) as Form;
    expect(fields(f)).toEqual(['The problem*', 'How you handle it today', 'Which app']);
    expect(f.body.find((b) => b.attributes.label === 'Which app')!.attributes.options).toEqual([...APP, 'A new tool']);
  });
});

describe('the PR template', () => {
  const pr = text('pull_request_template.md');

  it('has the sections a reviewer needs', () => {
    const headings = [...pr.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual(['What changes for users', 'Tests written first', 'How to try it', 'How to undo', 'Demo', 'AI use']);
    expect(pr).toMatch(/^Closes #/);
    expect(pr).toMatch(/^\*\*Size:\*\*/m);
  });

  it('names no person', () => {
    expect(pr).not.toMatch(/\bAL\b|\bfor me\b|\bthe phone\b/);
  });
});

describe('CODEOWNERS', () => {
  it('names the maintainers for everything', () => {
    expect(existsSync(path('CODEOWNERS'))).toBe(true);
    expect(text('CODEOWNERS')).toMatch(/^\* @\S+/m);
  });
});
