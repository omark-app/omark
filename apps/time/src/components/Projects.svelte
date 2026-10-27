<script lang="ts">
  import type { Project } from '@omark/time-core';
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { newProject } from '../lib/views.ts';

  /**
   * Spec 9, Projects. Codes can't be renamed (past events would turn red): to change one, archive the project
   * and add a new one. Delete warns that the project's events turn red and offers archiving instead.
   */
  let { store }: { store: TimeStore } = $props();

  /** The form: a new project (`editing` null) or an existing one. */
  let form = $state<{ project: Project; rate: string; editing: string | null } | null>(null);
  let error = $state<string | null>(null);
  let deleting = $state<string | null>(null);

  const active = $derived(store.projects.filter((p) => p.archived === ''));
  const archived = $derived(store.projects.filter((p) => p.archived !== ''));
  const deletingArchived = $derived(archived.some((p) => p.code === deleting));

  /** The form and the warning are drawn below the list: bring them into view, focus on their first control. */
  function reveal(node: HTMLElement) {
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    node.querySelector<HTMLElement>('input:not([readonly]), button')?.focus({ preventScroll: true });
  }

  // The fix list's "Add CODE as a project" opens the form filled in.
  $effect(() => {
    if (store.newCode !== null) {
      open(newProject(store.newCode), null);
      store.newCode = null;
    }
  });

  function open(project: Project, editing: string | null) {
    form = { project: { ...project }, rate: project.rateText ?? (project.rate === null ? '' : String(project.rate)), editing };
    error = null;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!form) return;
    const rateText = form.rate.trim();
    const rate = rateText === '' ? null : Number(rateText.replace(',', '.'));
    if (rate !== null && !Number.isFinite(rate)) {
      error = 'Rate must be a number';
      return;
    }
    const { code, description, client, currency } = form.project;
    error = form.editing
      ? await store.updateProject(form.editing, { description, client, currency, rate })
      : await store.addProject({ ...form.project, code: code.trim(), rate });
    if (error === null) form = null;
  }

  async function act(run: () => Promise<string | null>) {
    error = await run();
    deleting = null;
  }
</script>

<section class="card">
  <div class="head">
    <h2>Projects</h2>
    <button class="primary" onclick={() => open(newProject(), null)}>Add a project</button>
  </div>
  {#if error && !form}<p class="error" role="alert">{error}</p>{/if}
  {#if active.length === 0}
    <p class="muted">No projects yet. A project's code is what starts an event's title: <span class="mono">ACME; Coding; …</span></p>
  {:else}
    <ul>
      {#each active as p (p.code)}
        <li data-testid="project" data-code={p.code}>
          <div>
            <span class="mono code">{p.code}</span>
            {p.description}
            {#if p.client}<span class="muted">· {p.client}</span>{/if}
            {#if p.rate !== null}<span class="muted">· {p.rate} {p.currency}/h</span>{/if}
          </div>
          <div class="actions">
            <button class="secondary" onclick={() => open(p, p.code)}>Edit</button>
            <button class="secondary" onclick={() => act(() => store.archiveProject(p.code))}>Archive</button>
            <button class="secondary" onclick={() => (deleting = p.code)}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if deleting}
  <section class="card" aria-labelledby="delete-title" data-testid="delete-warning" use:reveal>
    <h2 id="delete-title">Delete {deleting}?</h2>
    <p>
      Its events turn red and stop counting.{deletingArchived ? ' It is archived: its events stay green and counted while it stays.' : ' Archive it instead to keep them green and counted, while it no longer shows in pickers.'}
    </p>
    <div class="actions">
      {#if !deletingArchived}
        <button class="primary" onclick={() => act(() => store.archiveProject(deleting!))}>Archive instead</button>
      {/if}
      <button class="secondary danger" onclick={() => act(() => store.deleteProject(deleting!))}>Delete</button>
      <button class="secondary" onclick={() => (deleting = null)}>Cancel</button>
    </div>
  </section>
{/if}

{#if form}
  <form class="card" onsubmit={save} aria-labelledby="form-title" use:reveal>
    <h2 id="form-title">{form.editing ? `Edit ${form.editing}` : 'New project'}</h2>
    <label>
      Code
      {#if form.editing}
        <input value={form.project.code} readonly aria-describedby="code-note" />
        <span class="muted small" id="code-note">Codes can't be renamed. To change one, archive this project and add a new one.</span>
      {:else}
        <input bind:value={form.project.code} required autocapitalize="characters" autocomplete="off" />
      {/if}
    </label>
    <label>Description <input bind:value={form.project.description} /></label>
    <label>Client <input bind:value={form.project.client} /></label>
    <div class="pair">
      <label>Rate per hour <input bind:value={form.rate} inputmode="decimal" /></label>
      <label>Currency <input bind:value={form.project.currency} maxlength="3" placeholder="EUR" autocapitalize="characters" /></label>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <div class="actions">
      <button class="primary" type="submit">Save</button>
      <button class="secondary" type="button" onclick={() => (form = null)}>Cancel</button>
    </div>
  </form>
{/if}

{#if archived.length > 0}
  <section class="card">
    <h2>Archived</h2>
    <p class="muted small">Still known: their events stay green and counted.</p>
    <ul>
      {#each archived as p (p.code)}
        <li data-testid="archived" data-code={p.code}>
          <div><span class="mono code">{p.code}</span> {p.description} <span class="muted">· archived {p.archived}</span></div>
          <div class="actions">
            <button class="secondary" onclick={() => act(() => store.unarchiveProject(p.code))}>Unarchive</button>
            <button class="secondary" onclick={() => (deleting = p.code)}>Delete</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  li:first-child {
    border-top: 0;
  }
  .mono {
    font-family: var(--mono);
  }
  .code {
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .pair {
    display: flex;
    gap: 12px;
  }
  .pair label {
    flex: 1;
  }
  input {
    font: inherit;
    padding: 7px 9px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
  }
  input[readonly] {
    background: var(--chip);
  }
  .small {
    font-size: 13px;
  }
  .error {
    color: var(--danger);
  }
  .danger {
    color: var(--danger);
  }
</style>
