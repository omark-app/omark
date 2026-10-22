<script lang="ts">
  import type { SyncStatus } from '@omark/storage';
  import { BUILD_ID, BUILD_TIME, LOOK } from '../env.ts';
  import type { Updates } from '../lib/updates.svelte.ts';

  /**
   * The faint save status; `offline` and `sign in needed` are the sync banner's to say. A newer build
   * waiting to load is offered here (`onupdate` loads it), and `updating…` shows while it loads.
   */
  let {
    status,
    updates,
    onupdate,
  }: { status: SyncStatus; updates?: Pick<Updates, 'available' | 'applying'>; onupdate?: () => void } = $props();
</script>

<span class="line">
  {#if updates?.applying}<span class="status" data-testid="updating">updating…</span>
  {:else if status === 'saved' || status === 'syncing'}<span class="status" data-testid="status">{status}</span>{/if}
  {#if updates?.available && !updates.applying && onupdate}
    <button type="button" class="update" data-testid="update-available" onclick={onupdate}>New version · tap to update</button>
  {/if}
  <!-- Which build this device runs (a home-screen app can keep an old one for a while). -->
  {#if LOOK.label}<span class="env" data-testid="env-label">{LOOK.label}</span>{/if}
  <span class="build" data-testid="build" title={`Build ${BUILD_ID}, ${BUILD_TIME}`}>{BUILD_ID}</span>
</span>

<style>
  .line { display: inline-flex; gap: 10px; align-items: baseline; font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .build { font-size: 11px; opacity: .8; }
  .update { border: 0; padding: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
  .env { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--accent); }
</style>
