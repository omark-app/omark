<script lang="ts">
  import type { SyncStatus } from '@taskapp/storage';
  import { BUILD_ID, BUILD_TIME, LOOK } from '../env.ts';

  /** The faint save status; `offline` and `sign in needed` are the sync banner's to say. */
  let { status }: { status: SyncStatus } = $props();
</script>

<span class="line">
  {#if status === 'saved' || status === 'syncing'}<span class="status" data-testid="status">{status}</span>{/if}
  <!-- Which build this device runs (a home-screen app can keep an old one for a while). -->
  {#if LOOK.label}<span class="env" data-testid="env-label">{LOOK.label}</span>{/if}
  <span class="build" data-testid="build" title={`Build ${BUILD_ID}, ${BUILD_TIME}`}>{BUILD_ID}</span>
</span>

<style>
  .line { display: inline-flex; gap: 10px; align-items: baseline; font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .build { font-size: 11px; opacity: .8; }
  .env { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--accent); }
</style>
