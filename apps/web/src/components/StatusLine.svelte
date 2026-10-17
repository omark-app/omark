<script lang="ts">
  import type { SyncStatus } from '@taskapp/storage';

  /** `onsignin` makes `sign in needed` a button that starts sign-in. */
  let { status, onsignin }: { status: SyncStatus; onsignin?: () => void } = $props();

  const TEXT: Record<SyncStatus, string> = {
    saved: 'saved',
    syncing: 'syncing',
    offline: 'offline',
    signin: 'sign in needed',
  };
</script>

{#if status === 'signin' && onsignin}
  <button type="button" class="status signin" data-testid="status" title="Sign in with Microsoft again" onclick={onsignin}>{TEXT.signin}</button>
{:else}
  <span class="status" data-testid="status">{TEXT[status]}</span>
{/if}

<style>
  .status { font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .signin { border: 0; background: none; padding: 0; text-align: left; color: var(--accent); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
