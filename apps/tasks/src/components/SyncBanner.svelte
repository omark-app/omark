<script lang="ts">
  import type { AppStore } from '../lib/store.svelte.ts';
  import { bannerText, QUIET_SYNC_MS } from '../lib/sync-banner.ts';
  import type { Reconnect } from '../lib/sync-banner.ts';

  /**
   * `onsignin` adds a button while a sign-in is needed: Sign in, or Allow access when `reconnect` is
   * `allow` (a picked folder). `storageName` is what the texts call the storage.
   */
  let {
    store,
    onsignin,
    storageName = 'OneDrive',
    reconnect = 'signin',
  }: { store: AppStore; onsignin?: () => void; storageName?: string; reconnect?: Reconnect } = $props();

  // A sync that is quick stays quiet; one still running after a few seconds gets the banner too.
  let slow = $state(false);
  $effect(() => {
    if (store.status !== 'syncing') {
      slow = false;
      return;
    }
    const timer = setTimeout(() => (slow = true), QUIET_SYNC_MS);
    return () => clearTimeout(timer);
  });

  // With no network at all every call fails and the token call is just the first: the storage is named (#157).
  let online = $state(typeof navigator === 'undefined' || navigator.onLine);
  $effect(() => {
    const update = (): void => {
      online = navigator.onLine;
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  });

  const text = $derived(
    bannerText(store.status, slow, store.syncedAt, new Date(), storageName, reconnect, store.full, store.signInUnreachable && online),
  );
</script>

{#if text}
  <div class="banner" class:problem={store.status !== 'syncing'} role="status" data-testid="sync-banner">
    <span>{text}</span>
    {#if store.status === 'signin' && onsignin}
      <button type="button" class="signin" onclick={onsignin}>{reconnect === 'allow' ? 'Allow access' : 'Sign in'}</button>
    {/if}
  </div>
{/if}

<style>
  .banner { display: flex; align-items: center; justify-content: space-between; gap: 6px 14px; flex-wrap: wrap; margin: 0; padding: 8px 12px; border: 1px solid var(--line); border-left: 3px solid var(--faint); border-radius: 8px; background: var(--surface); font: 12px/1.5 var(--mono); color: var(--muted); }
  .banner.problem { border-left-color: var(--danger); color: var(--ink); }
  .signin { border: 1px solid var(--accent); border-radius: 8px; background: var(--accent); color: var(--on-accent); padding: 5px 13px; font: 500 13px var(--sans); cursor: pointer; }
</style>
