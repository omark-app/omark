<script lang="ts">
  import { BRAND } from '../brand.ts';
  import { DEMO_URL } from '../env.ts';
  import { STORAGE_NAMES } from '../lib/environment.ts';
  import type { StorageProvider } from '../lib/environment.ts';
  import type { StorageOptions } from '../lib/boot.ts';
  import type { StorageChoice } from '../lib/storage-choice.ts';

  /**
   * The first-run screen: where this device keeps its tasks. It offers the accounts in `options.providers`,
   * a folder on this computer where the browser can pick one (elsewhere a small line says where it works),
   * and a link to the demo. `remembered` is a choice that could not be opened (signed out, the folder gone):
   * it comes first, and the line says so. `onchoose` saves the choice and opens it.
   */
  let {
    options,
    remembered = null,
    onchoose,
    error = null,
  }: {
    options: StorageOptions;
    remembered?: StorageChoice | null;
    onchoose: (choice: StorageChoice) => void;
    error?: string | null;
  } = $props();

  const LABELS: Record<StorageChoice, string> = {
    microsoft: 'Use my OneDrive',
    google: 'Use my Google Drive',
    folder: 'Use a folder on this computer',
  };

  // A remembered account comes first even when the helper did not list it in time (it lists just the
  // default after 3 s), so "Sign in to open your tasks in Google Drive" always has its button.
  const choices = $derived.by(() => {
    const all: StorageChoice[] = [...options.providers, ...(options.folders ? ['folder' as const] : [])];
    if (!remembered || (remembered === 'folder' && !options.folders)) return all;
    return [remembered, ...all.filter((c) => c !== remembered)];
  });

  const intro = $derived(
    remembered === 'folder'
      ? "The folder you picked can't be opened. Pick it again, or choose another place."
      : remembered
        ? `Sign in to open your tasks in ${STORAGE_NAMES[remembered as StorageProvider]}, or choose another place.`
        : 'Your tasks live in three plain Markdown files. Choose where to keep them.',
  );
</script>

<main class="first-run">
  <h1>{BRAND.app.toLowerCase()}</h1>
  <p>{intro}</p>
  <div class="buttons" data-testid="first-run-choices">
    {#each choices as choice, i (choice)}
      <button type="button" class="btn" class:secondary={i > 0} onclick={() => onchoose(choice)}>{LABELS[choice]}</button>
    {/each}
  </div>
  {#if !options.folders}<p class="small">A folder on this computer works in Chrome or Edge on a computer.</p>{/if}
  <p class="small">Just looking? <a href={DEMO_URL}>Try the demo</a>, with sample tasks and no sign-in.</p>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
</main>

<style>
  .first-run { max-width: 420px; margin: 20vh auto 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  h1 { margin: 0; font: 600 18px var(--mono); letter-spacing: -.01em; }
  p { margin: 0; font: 14px/1.5 var(--sans); color: var(--muted); }
  .buttons { display: flex; flex-direction: column; align-items: stretch; gap: 10px; width: 100%; }
  .btn { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); border-radius: 8px; padding: 9px 16px; font: 500 14px var(--sans); cursor: pointer; text-align: left; }
  .btn.secondary { background: var(--surface); color: var(--ink); border-color: var(--line); }
  .small { font-size: 12px; }
  a { color: var(--accent); }
  .err { font: 13px var(--mono); color: var(--danger); }
</style>
