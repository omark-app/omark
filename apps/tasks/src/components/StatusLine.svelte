<script lang="ts">
  import type { SyncStatus } from '@omark/storage';
  import { BUILD_ID, BUILD_NUMBER, BUILD_TIME, LOOK, STORAGE_MODE } from '../env.ts';
  import type { Updates } from '../lib/updates.svelte.ts';
  import { versionLabel } from '../lib/version.ts';
  import DemoControls from './DemoControls.svelte';

  /**
   * The faint save status; `offline` and `sign in needed` are the sync banner's to say. A newer build
   * waiting to load is offered here (`onupdate` loads it), and `updating…` shows while it loads. A demo
   * build adds Reset demo and "Use it for real", unless `demoControls` is false (the phone shows them on
   * a line of their own). The line wraps where it is narrow (the week board's rail).
   */
  let {
    status,
    updates,
    onupdate,
    demoControls = true,
  }: {
    status: SyncStatus;
    updates?: Pick<Updates, 'available' | 'applying'>;
    onupdate?: () => void;
    demoControls?: boolean;
  } = $props();
</script>

<span class="line">
  {#if updates?.applying}<span class="status" data-testid="updating">updating…</span>
  {:else if status === 'saved' || status === 'syncing'}<span class="status" data-testid="status">{status}</span>{/if}
  {#if updates?.available && !updates.applying && onupdate}
    <button type="button" class="update" data-testid="update-available" onclick={onupdate}>New version · tap to update</button>
  {/if}
  <!-- Which build this device runs (a home-screen app can keep an old one for a while). -->
  {#if LOOK.label}<span class="env" data-testid="env-label">{LOOK.label}</span>{/if}
  {#if STORAGE_MODE === 'demo' && demoControls}<DemoControls />{/if}
  <span class="build" data-testid="build" title={`Build ${BUILD_ID}, ${BUILD_TIME}`}>{versionLabel(BUILD_NUMBER, BUILD_ID, BUILD_TIME)}</span>
</span>

<style>
  .line { display: inline-flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .build { font-size: 11px; opacity: .8; }
  .update { border: 0; padding: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
  .env { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--accent); }
</style>
