<script lang="ts">
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store }: { store: AppStore } = $props();
</script>

{#if store.toast}
  <div class="toast" data-testid="toast" role="status">
    <span class="msg">{store.toast.message}</span>
    {#if store.toast.undo}<button data-testid="toast-undo" onclick={() => store.undo()}>Undo</button>{/if}
  </div>
{/if}

<style>
  .toast { position: fixed; z-index: 70; left: 50%; transform: translateX(-50%); bottom: calc(64px + env(safe-area-inset-bottom, 0px)); display: flex; align-items: center; gap: 12px; max-width: calc(100% - 32px); padding: 9px 10px 9px 14px; border-radius: 10px; background: var(--ink); color: var(--bg); font: 13px var(--mono); box-shadow: var(--shadow); }
  button { border: 0; background: color-mix(in srgb, var(--bg) 16%, transparent); color: var(--bg); border-radius: 6px; padding: 4px 9px; font: 500 12px var(--sans); cursor: pointer; white-space: nowrap; }
  .msg { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 719.98px) { .toast { bottom: calc(138px + env(safe-area-inset-bottom, 0px)); } }
</style>
