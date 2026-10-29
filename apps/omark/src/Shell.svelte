<script lang="ts">
  import type { Component } from 'svelte';
  import { DEMO_URL } from './env.ts';
  import { accounts } from './lib/places.ts';
  import type { Place, Storage } from './lib/places.ts';
  import { SETTINGS_PATH, Shell } from './lib/shell.svelte.ts';
  import { PART_NAMES, PARTS } from './lib/suite.ts';
  import type { Part } from './lib/suite.ts';
  import TasksPart from './parts/TasksPart.svelte';

  const deviceAccounts = accounts();
  const shell = new Shell(deviceAccounts);
  void shell.start();

  const STORAGE_LABELS: Record<Storage, string> = {
    microsoft: 'OneDrive',
    google: 'Google Drive',
    folder: 'A folder on this computer',
  };
  const PART_LINES: Record<Part, string> = {
    tasks: 'Today, this week and later, with habits.',
    time: 'Your Google Calendar as hours per project. Time reads your calendar.',
    goals: 'Life areas, their vision and dated goals, linked to your tasks and hours.',
  };

  // Tasks comes with the shell, so a Tasks-only start is as quick as Omark Tasks alone; the other parts load
  // the first time their tab shows.
  type Lazy = Exclude<Part, 'tasks'>;
  const LOADERS: Record<Lazy, () => Promise<{ default: Component<{ place: Place }> }>> = {
    time: () => import('./parts/TimePart.svelte'),
    goals: () => import('./parts/GoalsPart.svelte'),
  };
  const loaded = new Map<Lazy, Promise<{ default: Component<{ place: Place }> }>>();
  const load = (p: Lazy) => {
    if (!loaded.has(p)) loaded.set(p, LOADERS[p]());
    return loaded.get(p)!;
  };

  let ticks = $state<Record<Part, boolean>>({ tasks: false, time: false, goals: false });
  $effect(() => {
    if (shell.phase === 'parts') ticks = { tasks: false, time: false, goals: false, ...Object.fromEntries(shell.ticked.map((p) => [p, true])) };
  });
  const chosen = $derived(PARTS.filter((p) => ticks[p]));

  // Tasks' own sign-in again (an expired session) comes back to the part's address.
  const tasksPlace = $derived.by(() => {
    const given = shell.place?.tasks();
    return given && { ...given, auth: given.auth && shell.partAuth() };
  });

  const tabbed = $derived(shell.phase === 'ready' && shell.on.length > 1);
  // Lifts Tasks' + button and toasts above the tab bar on the phone (Tasks reads --part-tabs).
  $effect(() => {
    document.documentElement.classList.toggle('part-tabs', tabbed);
  });

  function tab(e: MouseEvent, p: Part): void {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    shell.go(`/${p}`);
  }

  /**
   * Alt+1, Alt+2, Alt+3: the first, second and third tab. Only when the key gives the digit itself: on a Mac,
   * Option+3 types # (and Option+2 €), which must stay text.
   */
  function onkeydown(e: KeyboardEvent): void {
    if (!tabbed || !e.altKey || e.ctrlKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
    const p = shell.on[Number(e.key) - 1];
    if (!p) return;
    e.preventDefault();
    shell.go(`/${p}`);
  }
</script>

<!-- A part turned on or off offline is written when the folder can be reached again. -->
<svelte:window {onkeydown} onpopstate={() => shell.phase === 'ready' && shell.route()} onfocus={() => void shell.flush()} ononline={() => void shell.flush()} />

{#if shell.phase === 'loading'}
  <p class="opening">Opening…</p>
{:else if shell.phase === 'error'}
  <section class="card" role="alert"><p>{shell.error}</p><button class="primary" onclick={() => location.reload()}>Try again</button></section>
{:else if shell.phase === 'welcome'}
  <section class="card first-run">
    <img src="/icons/favicon.svg" alt="" width="40" height="40" />
    <h1>Omark</h1>
    <p>Tasks, hours and goals in plain files you own, in your own storage.</p>
    <div class="choices">
      <a class="button" href={DEMO_URL}>Try the demo</a>
      <button class="primary" onclick={() => void shell.toWhere()}>Use Omark</button>
    </div>
  </section>
{:else if shell.phase === 'where'}
  <section class="card first-run">
    <h1>Where your files live</h1>
    <p>Omark keeps everything in one folder, Omark, in the storage you pick. You can change it later.</p>
    {#if shell.error}<p class="error" role="alert">{shell.error}</p>{/if}
    <div class="stack">
      {#each shell.storages as s (s)}
        <button class="primary" onclick={() => void shell.choose(s)}>{STORAGE_LABELS[s]}</button>
      {/each}
    </div>
  </section>
{:else if shell.phase === 'parts'}
  <section class="card first-run">
    <h1>What you want to use</h1>
    <p>Each part works on its own. You can change this any time.</p>
    {#if shell.error}<p class="error" role="alert">{shell.error}</p>{/if}
    <div class="stack">
      {#each PARTS as p (p)}
        <label class="part">
          <input type="checkbox" bind:checked={ticks[p]} />
          <span><strong>{PART_NAMES[p]}</strong><small>{PART_LINES[p]}</small></span>
        </label>
      {/each}
    </div>
    <button class="primary" disabled={chosen.length === 0} onclick={() => void shell.startWith(chosen)}>Start</button>
  </section>
{:else}
  {#if tabbed}
    <nav class="tabs" aria-label="Parts">
      {#each shell.on as p (p)}
        <a href="/{p}" aria-current={shell.current === p ? 'page' : undefined} onclick={(e) => tab(e, p)}>{PART_NAMES[p]}</a>
      {/each}
    </nav>
  {/if}
  {#if shell.error}<p class="error banner" role="alert">{shell.error}</p>{/if}
  {#each shell.visited as p (p)}
    <div class="part-view" hidden={shell.current !== p}>
      {#if p === 'tasks'}
        <TasksPart place={tasksPlace!} active={shell.current === 'tasks'} openSettings={() => shell.go(SETTINGS_PATH)} />
      {:else}
        {#await load(p) then mod}<mod.default place={shell.place!} />{/await}
      {/if}
    </div>
  {/each}
  {#if shell.settings}
    <!-- Loaded the first time: it brings Time's settings, which a Tasks-only start never needs. -->
    {#await import('./SettingsView.svelte') then view}<view.default {shell} accounts={deviceAccounts} />{/await}
  {/if}
  {#if shell.offer}
    <section class="card first-run">
      <h1>Omark {PART_NAMES[shell.offer]} is off</h1>
      <p>{PART_LINES[shell.offer]}</p>
      <button class="primary" onclick={() => void shell.turnOn(shell.offer!)}>Turn on Omark {PART_NAMES[shell.offer]}</button>
    </section>
  {/if}
{/if}

<style>
  .opening { margin: 48px auto; text-align: center; color: var(--muted); font-family: var(--sans); }
  .card { max-width: 30rem; margin: 48px auto; padding: 24px; border-radius: 14px; background: var(--surface); box-shadow: var(--shadow); font-family: var(--sans); color: var(--ink); }
  .card h1 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
  .card p { color: var(--muted); }
  .choices { display: flex; gap: 12px; flex-wrap: wrap; }
  .stack { display: grid; gap: 10px; margin: 16px 0; }
  .part { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
  .part span { display: grid; gap: 2px; }
  .part small { color: var(--muted); }
  .primary, .button { display: inline-block; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 500 15px var(--sans); text-decoration: none; cursor: pointer; text-align: center; }
  .primary { background: var(--accent); color: var(--on-accent); border-color: transparent; }
  .primary:disabled { opacity: .5; cursor: default; }
  .error { color: var(--danger); }
  .banner { text-align: center; font-family: var(--sans); }
  .tabs { position: sticky; top: 0; z-index: 40; display: flex; justify-content: center; gap: 4px; padding: 8px max(12px, env(safe-area-inset-left)); background: var(--bg); border-bottom: 1px solid var(--line); font-family: var(--sans); }
  .tabs a { padding: 6px 14px; border-radius: 8px; color: var(--muted); text-decoration: none; font-weight: 500; }
  .tabs a[aria-current='page'] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
  @media (max-width: 719.98px) {
    .tabs { position: fixed; top: auto; bottom: 0; left: 0; right: 0; justify-content: space-around; border-top: 1px solid var(--line); border-bottom: 0; padding-bottom: max(8px, env(safe-area-inset-bottom)); box-sizing: border-box; height: var(--part-tabs-bar); }
    /* --part-tabs-bar: the bar's own height, safe area included, for a part's bar that sits on top of it (Time's). */
    :global(html.part-tabs) { --part-tabs: 56px; --part-tabs-bar: calc(48px + max(8px, env(safe-area-inset-bottom))); }
    :global(html.part-tabs body) { padding-bottom: 56px; }
  }
</style>
