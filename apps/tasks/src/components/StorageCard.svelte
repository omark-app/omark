<script lang="ts">
  import type { StorageKind } from '../lib/environment.ts';
  import type { StorageSwitch, StorageOptions } from '../lib/boot.ts';
  import type { StorageChoice } from '../lib/storage-choice.ts';

  /**
   * Settings' Storage card: where the tasks are now (`current`, called `storageName` in the texts) and a
   * button for each other storage this build and browser offer. `onswitch` saves the new choice and opens it.
   */
  let {
    current,
    storageName,
    storage,
    onswitch,
  }: {
    current: StorageKind;
    storageName: string;
    storage: StorageSwitch;
    onswitch: (to: StorageChoice) => void;
  } = $props();

  const LABELS: Record<StorageChoice, string> = {
    microsoft: 'Use OneDrive',
    google: 'Use Google Drive',
    folder: 'Use a folder on this computer',
  };

  let options = $state<StorageOptions | null>(null);
  $effect(() => {
    void storage.options().then((o) => (options = o));
  });

  const others = $derived(
    options ? [...options.providers, ...(options.folders ? ['folder' as const] : [])].filter((c) => c !== current) : [],
  );
</script>

<p class="where">Your tasks are in {storageName}.</p>
<p class="file">Switching opens the files in the other place. Nothing is copied or deleted, and changes not saved yet are kept on this device for when you switch back.</p>
{#if others.length > 0}
  <div class="row">
    {#each others as choice (choice)}
      <button type="button" class="btn" onclick={() => onswitch(choice)}>{LABELS[choice]}</button>
    {/each}
  </div>
{/if}

<style>
  .where { margin: 0 0 6px; font-size: 14px; color: var(--ink); }
  .file { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 6px 12px; font: 500 13px var(--sans); cursor: pointer; }
</style>
