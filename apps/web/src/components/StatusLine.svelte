<script lang="ts">
  import type { SyncStatus } from '@taskapp/storage';
  import { BUILD_ID } from '../env.ts';

  /** `onsignin` makes `sign in needed` a button that starts sign-in. */
  let { status, onsignin }: { status: SyncStatus; onsignin?: () => void } = $props();

  const TEXT: Record<SyncStatus, string> = {
    saved: 'saved',
    syncing: 'syncing',
    offline: 'offline',
    signin: 'sign in needed',
  };
</script>

<!-- The build sits beside the status, so we can tell which build a device runs. -->
<span class="line">
  {#if status === 'signin' && onsignin}
    <button type="button" class="status signin" data-testid="status" title="Sign in with Microsoft again" onclick={onsignin}>{TEXT.signin}</button>
  {:else}
    <span class="status" data-testid="status">{TEXT[status]}</span>
  {/if}
  <span class="build" data-testid="build" title="Build {BUILD_ID}">{BUILD_ID}</span>
</span>

<style>
  .line { display: inline-flex; gap: 8px; align-items: baseline; }
  .status { font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .build { font: 11px var(--mono); color: var(--faint); opacity: .7; }
  .signin { border: 0; background: none; padding: 0; text-align: left; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
