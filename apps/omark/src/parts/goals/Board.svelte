<script lang="ts">
  import { areas, goalStatus, notNow } from '@omark/goals-core';
  import type { Area, Goal } from '@omark/goals-core';
  import type { Picture } from '@omark/goals-core';
  import { AuthRequiredError, OfflineError, StorageFullError } from '@omark/storage';
  import { toISODate } from '@omark/tasks-core';
  import { untrack } from 'svelte';
  import { toJpeg, type Pictures } from './pictures.svelte.ts';
  import type { GoalsStore } from './store.svelte.ts';

  /** The Vision board (Goals spec 8): the vision line, a card per area, Not now, and the forms. */
  let { store, pictures, openSettings }: { store: GoalsStore; pictures: Pictures; openSettings?: () => void } = $props();

  const list = $derived(areas(store.doc));
  // Each area's picture is read once it is named; one not shown is tried again when the areas change or the
  // device comes back online.
  const loadPictures = (paths: string[]) => paths.forEach((p) => void pictures.load(p));
  const picturePaths = $derived(list.flatMap((a) => (a.picture ? [a.picture.path] : [])));
  $effect(() => {
    const paths = picturePaths;
    untrack(() => loadPictures(paths));
  });
  const notNowItems = $derived(notNow(store.doc));
  // The device's own date, as the store's (a UTC date would be a day off around midnight).
  const today = $derived(toISODate(new Date()));

  /** A calm colour from the area's name, for a card with no picture. */
  function hue(name: string): number {
    let h = 0;
    for (const c of name) h = (h * 31 + c.codePointAt(0)!) % 360;
    return h;
  }

  const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: d.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric' });
  const hours = (h: number) => `${Math.round(h * 10) / 10} h`;

  // The vision line, edited in place.
  let editingVision = $state(false);
  let visionDraft = $state('');
  function startVision(): void {
    visionDraft = store.doc.vision;
    editingVision = true;
  }
  function saveVision(): void {
    editingVision = false;
    void store.setVision(visionDraft);
  }

  // The area form: a new area (index null) or area `index`. `file` is a picture chosen to add (shown from
  // `preview`), `removed` takes the current one out; neither happens before Save.
  type AreaDraft = {
    index: number | null; name: string; vision: string; picture: Picture | null;
    file: Blob | null; preview: string | null; removed: boolean; saving: boolean; error: string | null;
  };
  let areaForm = $state<AreaDraft | null>(null);
  function openArea(index: number | null): void {
    const a = index === null ? null : list[index]!;
    areaForm = { index, name: a?.name ?? '', vision: a?.vision ?? '', picture: a?.picture ?? null, file: null, preview: null, removed: false, saving: false, error: null };
  }
  function closeArea(): void {
    if (areaForm?.preview) URL.revokeObjectURL(areaForm.preview);
    areaForm = null;
  }
  function choosePicture(e: Event & { currentTarget: HTMLInputElement }): void {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file || !areaForm) return;
    if (areaForm.preview) URL.revokeObjectURL(areaForm.preview);
    areaForm = { ...areaForm, file, preview: URL.createObjectURL(file), error: null };
  }
  function removePicture(): void {
    const f = areaForm!;
    if (f.preview) URL.revokeObjectURL(f.preview);
    areaForm = { ...f, file: null, preview: null, removed: true };
  }
  /** What the form shows as the area's picture: the chosen one, else the current one unless removed. */
  const formPicture = $derived(areaForm && (areaForm.preview ?? (areaForm.picture && !areaForm.removed ? pictures.url(areaForm.picture.path) : null)));
  const formHasPicture = $derived(!!areaForm && (areaForm.file !== null || (areaForm.picture !== null && !areaForm.removed)));
  function pictureError(e: unknown): string {
    if (e instanceof AuthRequiredError) return "Omark needs to be allowed into the Omark folder again, so the picture isn't saved. Allow it, then save again.";
    if (e instanceof OfflineError) return "Can't reach the Omark folder, so the picture isn't saved. Save again when it can be reached.";
    if (e instanceof StorageFullError) return "The Omark folder's storage is full, so the picture isn't saved.";
    return "This picture can't be read. Try a JPEG or PNG.";
  }
  /** The area with this tag now (areas can move or go while a picture uploads), or -1. */
  const areaByTag = (tag: string | null) => areas(store.doc).findIndex((a) => tag !== null && a.tag?.toLowerCase() === tag.toLowerCase());
  async function saveArea(): Promise<void> {
    const f = areaForm!;
    if (f.name.trim() === '' || f.saving) return;
    // Without a new picture the form closes at once. With one it waits, locked, for the upload, and stays on an error.
    if (!f.file) closeArea();
    else areaForm = { ...f, saving: true, error: null };
    const mine = areaForm;
    let index = f.index;
    if (index === null) {
      await store.addArea(f.name);
      index = areas(store.doc).length - 1;
    }
    // Its vision text goes in as an edit, for a new area too (the last one).
    await store.editArea(index, { name: f.name, vision: f.vision, ...(f.removed && !f.file && { picture: null }) });
    if (!f.file) return;
    // Edited, the area has a tag: the picture is named from it, and its line goes to the area with it.
    const tag = areas(store.doc)[index]!.tag;
    let error: string | null = null;
    try {
      const path = await pictures.add(tag ?? 'area', await toJpeg(f.file));
      const at = areaByTag(tag);
      // Deleted meanwhile (another device): the picture file stays, as a replaced one does.
      if (at >= 0) await store.editArea(at, { picture: { alt: areas(store.doc)[at]!.name.replace(/[[\]]/g, ''), path } });
    } catch (e) {
      error = pictureError(e);
    }
    if (areaForm !== mine) return;
    const at = areaByTag(tag);
    // The rest is saved; on an error the form stays, now on that area, to try the picture again.
    if (error === null || at < 0) closeArea();
    else areaForm = { ...mine!, index: at, picture: areas(store.doc)[at]!.picture, saving: false, error };
  }
  function deleteArea(): void {
    const f = areaForm!;
    if (f.index === null || !window.confirm(`Delete ${list[f.index]!.name} and its goals?`)) return;
    closeArea();
    void store.deleteArea(f.index);
  }
  function move(dir: -1 | 1): void {
    const f = areaForm!;
    if (f.index === null) return;
    void store.moveArea(f.index, dir);
    areaForm = { ...f, index: f.index + dir };
  }

  // The goal form: a new goal in area `area` (goal null), or goal `goal` of it.
  type GoalDraft = { area: number; goal: number | null; text: string; due: string; code: string; achieved: boolean; newCode: string; newDescription: string; error: string | null };
  let goalForm = $state<GoalDraft | null>(null);
  const NEW = '__new__';
  function openGoal(area: number, goal: number | null): void {
    const g: Goal | null = goal === null ? null : list[area]!.goals[goal]!;
    goalForm = { area, goal, text: g?.text ?? '', due: g?.due ?? '', code: g?.code ?? '', achieved: g?.achieved ?? false, newCode: '', newDescription: '', error: null };
  }
  async function saveGoal(): Promise<void> {
    const f = goalForm!;
    if (f.text.trim() === '') return;
    let code = f.code === '' ? null : f.code;
    if (f.code === NEW) {
      const problem = await store.addProject(f.newCode.trim(), f.newDescription.trim());
      if (problem) {
        goalForm = { ...f, error: problem };
        return;
      }
      code = f.newCode.trim().toUpperCase();
    }
    goalForm = null;
    const due = f.due === '' ? null : f.due;
    if (f.goal === null) await store.addGoal(f.area, { text: f.text, due, code });
    else await store.editGoal(f.area, f.goal, { text: f.text, due, code, achieved: f.achieved });
  }
  function deleteGoal(): void {
    const f = goalForm!;
    if (f.goal === null || !window.confirm('Delete this goal?')) return;
    goalForm = null;
    void store.deleteGoal(f.area, f.goal);
  }

  // Not now: add, edit in place, delete.
  let notNowDraft = $state('');
  let editingItem = $state<{ k: number; text: string } | null>(null);
  function addItem(): void {
    if (notNowDraft.trim() === '') return;
    void store.addNotNow(notNowDraft);
    notNowDraft = '';
  }
  function saveItem(): void {
    const e = editingItem!;
    editingItem = null;
    if (e.text.trim() === '') void store.deleteNotNow(e.k);
    else void store.editNotNow(e.k, e.text);
  }

  const open = (area: Area) => area.goals.map((g, i) => ({ g, i })).filter(({ g }) => !g.achieved);
  const achieved = (area: Area) => area.goals.map((g, i) => ({ g, i })).filter(({ g }) => g.achieved);
</script>

<svelte:window ononline={() => loadPictures(picturePaths)} />

{#snippet goalRow(area: number, g: Goal, i: number)}
  {@const status = goalStatus(g, today)}
  {@const facts = store.factsFor(g)}
  <li>
    <button type="button" class="goal" data-testid="goal-row" onclick={() => openGoal(area, i)}>
      <span class="text">{g.text}</span>
      {#if status}<span class="chip" class:due={status.kind === 'wasDue'} class:done={status.kind === 'achieved'}>{status.label}</span>{/if}
      {#if g.code}<span class="code">#{g.code}</span>{/if}
      {#if facts}
        <small class="facts" data-testid="goal-facts">
          {hours(facts.hoursThisMonth)} this month · {hours(facts.hoursSinceSet)} since set · {facts.openTasks}
          {facts.openTasks === 1 ? 'open task' : 'open tasks'}
        </small>
      {/if}
    </button>
  </li>
{/snippet}

<div class="board" data-testid="goals-board">
  <header class="vision">
    {#if store.phase === 'loading' || store.unreachable}
      <!-- Nothing to edit until goals.md has been read. -->
    {:else if editingVision}
      <input
        class="vision-input"
        aria-label="Vision line"
        bind:value={visionDraft}
        onkeydown={(e) => {
          if (e.key === 'Enter') saveVision();
          if (e.key === 'Escape') editingVision = false;
        }}
        onblur={saveVision}
      />
    {:else if store.doc.vision}
      <button type="button" class="vision-line" data-testid="vision-line" onclick={startVision}>{store.doc.vision}</button>
    {:else}
      <button type="button" class="add-vision" onclick={startVision}>Add your vision line</button>
    {/if}
  </header>

  {#if store.phase === 'loading'}
    <p class="muted">Opening…</p>
  {:else if store.unreachable}
    <p class="muted" role="status" data-testid="goals-unreachable">Can't reach your goals right now. They show here once the Omark folder can be reached.</p>
  {:else if store.firstRun}
    <div class="cards" data-testid="placeholders">
      <section class="card placeholder">
        <h2>An area of your life</h2>
        <p>Health, family, work, a place to live: each area gets a card, with a few lines on where you want it to go.</p>
      </section>
      <section class="card placeholder">
        <h2>Goals</h2>
        <p>Dated checkpoints in an area, worded as outcomes: "Run a half marathon by May 2027".</p>
      </section>
      <section class="card placeholder">
        <h2>Links and Needs update</h2>
        <p>Tag a task or habit with the area's tag, or a goal with a project code. An area nothing has touched for months shows Needs update.</p>
      </section>
    </div>
    <button type="button" class="primary" onclick={() => openArea(null)}>Add your first area</button>
  {:else}
    <div class="cards">
      {#each list as area, a (`${a}:${area.tag ?? area.name}`)}
        {@const act = store.activity[a]}
        {@const habits = store.habitsFor(area)}
        {@const picture = area.picture && pictures.url(area.picture.path)}
        <section class="card" data-testid="area-card" style:--h={hue(area.name)}>
          {#if picture}<img class="picture" src={picture} alt="" data-testid="area-picture" onerror={() => void pictures.failed(area.picture!.path)} />{/if}
          <div class="head">
            <h2>{area.name || 'Untitled'}</h2>
            <button type="button" class="edit" aria-label="Edit {area.name}" onclick={() => openArea(a)}>Edit</button>
          </div>
          {#if act?.needsUpdate}
            <p class="needs" data-testid="needs-update">
              <strong>Needs update</strong> · Nothing linked has happened since {longDate(act.lastActivity!)}
            </p>
          {:else if act && !act.linked}
            <p class="hint" data-testid="area-hint">Add a goal, or tag a habit with #{area.tag ?? 'its-tag'}</p>
          {/if}
          {#if area.vision}<p class="vision-text">{area.vision}</p>{/if}
          <ul class="goals">
            {#each open(area) as { g, i } (i)}{@render goalRow(a, g, i)}{/each}
          </ul>
          <button type="button" class="add" onclick={() => openGoal(a, null)}>Add goal</button>
          {#if habits.length > 0}
            <ul class="habits" data-testid="area-habits">
              {#each habits as h, k (k)}<li>{h.title} <span class="muted">{h.progress.count}/{h.progress.rules.goal}</span></li>{/each}
            </ul>
          {/if}
          {#if achieved(area).length > 0}
            <details data-testid="achieved">
              <summary>Achieved ({achieved(area).length})</summary>
              <ul class="goals">{#each achieved(area) as { g, i } (i)}{@render goalRow(a, g, i)}{/each}</ul>
            </details>
          {/if}
        </section>
      {/each}
    </div>
    <button type="button" class="primary" onclick={() => openArea(null)}>Add area</button>
  {/if}

  {#if store.phase === 'ready' && !store.unreachable}
    <section class="not-now" data-testid="not-now">
      <h2>Not now</h2>
      <ul>
        {#each notNowItems as item, k (item.line)}
          <li>
            {#if editingItem?.k === k}
              <input aria-label="Not now item" bind:value={editingItem.text} onkeydown={(e) => e.key === 'Enter' && saveItem()} onblur={saveItem} />
            {:else}
              <button type="button" class="item" onclick={() => (editingItem = { k, text: item.text })}>{item.text}</button>
              <button type="button" class="remove" aria-label="Delete {item.text}" onclick={() => void store.deleteNotNow(k)}>×</button>
            {/if}
          </li>
        {/each}
      </ul>
      <form onsubmit={(e) => (e.preventDefault(), addItem())}>
        <input aria-label="Add to Not now" placeholder="Something you have chosen not to pursue" bind:value={notNowDraft} />
        <button type="submit" class="btn">Add</button>
      </form>
    </section>
  {/if}

  {#if openSettings}
    <footer class="foot">
      <a
        href="/settings"
        onclick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          openSettings();
        }}>Settings</a
      >
    </footer>
  {/if}
</div>

{#if areaForm}
  <div class="scrim" role="presentation" onclick={() => areaForm?.saving || closeArea()}></div>
  <form class="sheet" aria-label={areaForm.index === null ? 'New area' : 'Edit area'} onsubmit={(e) => (e.preventDefault(), void saveArea())}>
    <h2>{areaForm.index === null ? 'New area' : 'Edit area'}</h2>
    <label>Name <input bind:value={areaForm.name} disabled={areaForm.saving} /></label>
    <div class="picture-row" data-testid="picture-row">
      {#if formPicture}<img class="thumb" src={formPicture} alt="" data-testid="picture-thumb" />{/if}
      <label class="btn file">
        {formHasPicture ? 'Replace picture' : 'Add picture'}
        <input type="file" accept="image/*" onchange={choosePicture} disabled={areaForm.saving} />
      </label>
      {#if formHasPicture}<button type="button" class="btn" disabled={areaForm.saving} onclick={removePicture}>Remove picture</button>{/if}
    </div>
    <label>Vision <textarea rows="3" bind:value={areaForm.vision} disabled={areaForm.saving}></textarea></label>
    {#if areaForm.error}<p class="error" role="alert">{areaForm.error}</p>{/if}
    <div class="row">
      <button type="submit" class="primary" disabled={areaForm.saving}>{areaForm.saving ? 'Saving…' : 'Save'}</button>
      {#if areaForm.index !== null}
        <button type="button" class="btn" disabled={areaForm.saving || areaForm.index === 0} onclick={() => move(-1)}>Move up</button>
        <button type="button" class="btn" disabled={areaForm.saving || areaForm.index === list.length - 1} onclick={() => move(1)}>Move down</button>
        <button type="button" class="btn danger" disabled={areaForm.saving} onclick={deleteArea}>Delete</button>
      {/if}
      <button type="button" class="btn" disabled={areaForm.saving} onclick={closeArea}>Cancel</button>
    </div>
  </form>
{/if}

{#if goalForm}
  <div class="scrim" role="presentation" onclick={() => (goalForm = null)}></div>
  <form class="sheet" aria-label={goalForm.goal === null ? 'New goal' : 'Edit goal'} onsubmit={(e) => (e.preventDefault(), void saveGoal())}>
    <h2>{goalForm.goal === null ? 'New goal' : 'Edit goal'}</h2>
    <label>Goal <input bind:value={goalForm.text} placeholder="An outcome you can check" /></label>
    <label>Target date <input type="date" bind:value={goalForm.due} /></label>
    <label>
      Project
      <select bind:value={goalForm.code}>
        <option value="">None</option>
        {#each store.projects as p (p.code)}<option value={p.code}>{p.code}{p.description ? ` · ${p.description}` : ''}</option>{/each}
        <option value={NEW}>New project…</option>
      </select>
    </label>
    {#if goalForm.code === NEW}
      <label>Code <input bind:value={goalForm.newCode} placeholder="COURSE" /></label>
      <label>Description <input bind:value={goalForm.newDescription} /></label>
    {/if}
    {#if goalForm.error}<p class="error" role="alert">{goalForm.error}</p>{/if}
    {#if goalForm.goal !== null}
      <label class="check"><input type="checkbox" bind:checked={goalForm.achieved} /> Achieved</label>
    {/if}
    <div class="row">
      <button type="submit" class="primary">Save</button>
      {#if goalForm.goal !== null}<button type="button" class="btn danger" onclick={deleteGoal}>Delete</button>{/if}
      <button type="button" class="btn" onclick={() => (goalForm = null)}>Cancel</button>
    </div>
  </form>
{/if}

<style>
  .board { max-width: 1040px; margin: 0 auto; padding: 24px 16px 96px; font-family: var(--sans); color: var(--ink); }
  .vision { margin: 8px 0 24px; text-align: center; }
  .vision-line, .add-vision { border: 0; background: none; font: 600 22px var(--sans); color: var(--ink); cursor: pointer; }
  .add-vision { color: var(--muted); font-weight: 500; font-size: 17px; }
  .vision-input { width: min(100%, 40rem); font: 600 20px var(--sans); padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); }
  .cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); margin-bottom: 16px; }
  .card { border-radius: 14px; padding: 18px; background: linear-gradient(hsl(var(--h, 210) 45% 55% / 0.13), transparent 70%), var(--surface); box-shadow: var(--shadow); }
  .placeholder { background: var(--surface); border: 1px dashed var(--line); box-shadow: none; }
  .placeholder p { color: var(--muted); }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
  .edit, .add, .item, .remove { border: 0; background: none; color: var(--muted); cursor: pointer; font: 13px var(--sans); padding: 4px 0; }
  .needs { margin: 4px 0 8px; color: var(--danger); font-size: 13px; }
  .hint, .muted { color: var(--muted); font-size: 13px; }
  .vision-text { font-style: italic; color: var(--muted); margin: 4px 0 10px; }
  .goals, .habits, .not-now ul { list-style: none; padding: 0; margin: 0; }
  .goal { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; width: 100%; text-align: left; border: 0; background: none; padding: 6px 0; color: var(--ink); font: 15px var(--sans); cursor: pointer; }
  .goal .text { flex: 1 1 auto; }
  .chip { font: 12px var(--mono); padding: 1px 6px; border-radius: 6px; background: var(--chip); color: var(--muted); }
  .chip.due { color: var(--danger); }
  .chip.done { color: var(--good); }
  .code { font: 12px var(--mono); color: var(--muted); }
  .facts { flex-basis: 100%; color: var(--muted); font-size: 12px; }
  .habits li { font-size: 13px; padding: 2px 0; }
  details summary { cursor: pointer; color: var(--muted); font-size: 13px; margin-top: 8px; }
  .not-now { margin-top: 32px; }
  .foot { margin-top: 32px; text-align: center; font-size: 13px; }
  .foot a { color: var(--muted); }
  .not-now li { display: flex; gap: 6px; align-items: center; }
  .not-now .item { color: var(--ink); font-size: 15px; text-align: left; }
  .not-now form { display: flex; gap: 8px; margin-top: 8px; }
  .not-now input, .sheet input, .sheet textarea, .sheet select { flex: 1; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font: 15px var(--sans); }
  .primary, .btn { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 500 14px var(--sans); cursor: pointer; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .danger { color: var(--danger); }
  .error { color: var(--danger); }
  .scrim { position: fixed; inset: 0; z-index: 80; background: rgb(0 0 0 / 0.3); }
  .sheet { position: fixed; z-index: 81; left: 50%; top: 10vh; transform: translateX(-50%); width: min(92vw, 30rem); display: grid; gap: 12px; padding: 20px; border-radius: 14px; background: var(--bg); box-shadow: var(--shadow); }
  .sheet label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
  .sheet .check { display: flex; align-items: center; gap: 8px; color: var(--ink); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .picture { display: block; width: calc(100% + 36px); height: 160px; margin: -18px -18px 14px; object-fit: cover; border-radius: 14px 14px 0 0; }
  .picture-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .thumb { width: 72px; height: 48px; object-fit: cover; border-radius: 8px; }
  .sheet .file { display: inline-flex; color: var(--ink); font-size: 14px; }
  .sheet .file:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
  .file input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  @media (max-width: 719.98px) {
    .sheet { top: auto; bottom: 0; transform: none; left: 0; width: 100%; border-radius: 14px 14px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
  }
</style>
