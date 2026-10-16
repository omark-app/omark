<script lang="ts">
  import type { SyncStatus } from '@taskapp/storage';

  let { status }: { status: SyncStatus } = $props();

  const TEXT: Record<SyncStatus, string> = {
    saved: 'saved',
    syncing: 'syncing',
    offline: 'offline',
    signin: 'sign in needed',
  };
</script>

<span class="status" data-testid="status">{TEXT[status]}</span>

<style>
  .status { font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
</style>
