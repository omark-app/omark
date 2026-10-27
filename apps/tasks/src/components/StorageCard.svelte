<script lang="ts">
  import type { StorageKind } from '../lib/environment.ts';
  import type { StorageOptions, StorageSwitch } from '../lib/boot.ts';
  import type { StorageChoice } from '../lib/storage-choice.ts';

  /**
   * Settings' Storage card: where the tasks are now (`current`, called `storageName` in the texts) and a
   * button for each other storage this build and browser offer. A folder already picked on this device is
   * offered by name and opens without the picker; "Pick another folder" shows the picker. `onswitch` saves
   * the new choice and opens it (`pick`: show the folder picker).
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
    onswitch: (to: StorageChoice, pick: boolean) => void;
  } = $props();

  interface Option {
    to: StorageChoice;
    label: string;
    pick: boolean;
  }

  let options = $state<StorageOptions | null>(null);
  $effect(() => {
    void storage.options().then((o) => (options = o));
  });

  const buttons = $derived.by((): Option[] => {
    if (!options) return [];
    const list: Option[] = [];
    if (current !== 'microsoft' && options.providers.includes('microsoft')) list.push({ to: 'microsoft', label: 'Use OneDrive', pick: false });
    if (current !== 'google' && options.providers.includes('google')) list.push({ to: 'google', label: 'Use Google Drive', pick: false });
    if (options.folders) {
      if (current !== 'folder' && options.savedFolder) list.push({ to: 'folder', label: `Use the folder ${options.savedFolder}`, pick: false });
      if (current !== 'folder' && !options.savedFolder) list.push({ to: 'folder', label: 'Use a folder on this computer', pick: true });
      else list.push({ to: 'folder', label: 'Pick another folder', pick: true });
    }
    return list;
  });
</script>

<p class="where">Your tasks are in {storageName}.</p>
<p class="file">Switching opens the files in the other place. Nothing is copied or deleted, and changes not saved yet are kept on this device for when you switch back.</p>
{#if buttons.length > 0}
  <div class="row">
    {#each buttons as b (b.label)}
      <button type="button" class="btn" onclick={() => onswitch(b.to, b.pick)}>{b.label}</button>
    {/each}
  </div>
{/if}

<style>
  .where { margin: 0 0 6px; font-size: 14px; color: var(--ink); }
  .file { margin: 0 0 10px; font-size: 13px; color: var(--muted); }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 6px 12px; font: 500 13px var(--sans); cursor: pointer; }
</style>
