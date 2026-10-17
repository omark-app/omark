<script lang="ts">
  import { tick } from 'svelte';
  import type { Snippet } from 'svelte';

  let { open, onclose, children }: { open: boolean; onclose: () => void; children: Snippet } = $props();

  const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  /** A backdrop click this soon after opening is the tap that opened the sheet, not a dismissal. */
  const IGNORE_BACKDROP_MS = 400;

  let panel: HTMLDivElement | undefined = $state();
  let openedAt = 0;

  // Remember the opener on open, move focus into the sheet, and hand focus back on close. Without a
  // `data-autofocus` field the panel itself takes focus, so no choice looks picked and no keyboard pops up.
  $effect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    openedAt = performance.now();
    void tick().then(() => {
      (panel?.querySelector<HTMLElement>('[data-autofocus]') ?? panel)?.focus();
    });
    return () => {
      if (opener && opener.isConnected) opener.focus();
    };
  });

  function onkeydown(e: KeyboardEvent): void {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !panel) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (!panel.contains(active) || active === panel) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onbackdrop(): void {
    if (performance.now() - openedAt >= IGNORE_BACKDROP_MS) onclose();
  }
</script>

<svelte:window {onkeydown} />

{#if open}
  <div class="modal" data-testid="sheet">
    <!-- Esc is the keyboard way out (handled on the window), so the backdrop needs no key handler. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={onbackdrop}></div>
    <div class="panel" role="dialog" aria-modal="true" tabindex="-1" bind:this={panel}>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .modal { position: fixed; inset: 0; z-index: 60; }
  .backdrop { position: absolute; inset: 0; background: rgba(8, 12, 20, .38); }
  .panel { position: absolute; left: 50%; top: 14vh; transform: translateX(-50%); width: min(420px, calc(100% - 32px)); max-height: 76vh; overflow: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 16px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 12px; }
  .panel:focus { outline: none; }
  /* The panel scrolls as a whole; its contents keep their size (a grown notes box included). */
  .panel > :global(*) { flex-shrink: 0; }
  @media (max-width: 719.98px) {
    .panel { left: 0; right: 0; top: auto; bottom: 0; transform: none; width: auto; max-height: calc(100dvh - 48px - env(safe-area-inset-top, 0px)); border-radius: 18px 18px 0 0; padding: 18px max(16px, env(safe-area-inset-right, 0px)) calc(18px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); }
  }

  /* The building blocks every sheet's content uses (pickers, add, edit, move), styled once here. */
  .panel :global {
    h3 { margin: 0; font: 600 15px var(--mono); overflow-wrap: anywhere; }
    .sub { font: 12px var(--mono); color: var(--muted); margin-top: -8px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .fld { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); padding: 8px 10px; font: 14px var(--mono); outline: 0; min-width: 0; }
    .fld:focus { border-color: var(--accent); }
    .fld.small { width: 64px; }
    .fld.wide, textarea.fld { width: 100%; }
    textarea.fld { resize: none; overflow-y: hidden; font-size: 13px; line-height: 1.5; }
    .btn { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 7px 13px; font: 500 13px var(--sans); cursor: pointer; }
    .btn:hover { border-color: var(--faint); }
    .btn.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .btn.ghost { border-color: transparent; color: var(--muted); }
    .btn.danger { color: var(--danger); }
    .actions { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .actions > :only-child { margin-left: auto; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 5px 10px; font: 12.5px var(--mono); cursor: pointer; }
    .chip:hover { border-color: var(--faint); }
    .chip.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
    .opts { display: flex; flex-direction: column; gap: 2px; }
    .opt { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; padding: 10px; border: 0; border-radius: 8px; background: none; color: var(--ink); cursor: pointer; text-align: left; font: 14px var(--mono); }
    .opt:hover, .opt:focus-visible { background: var(--sel); }
    .opt .r { color: var(--faint); font-size: 12px; }
  }
  @media (max-width: 719.98px) {
    .panel :global(.opt) { padding: 13px 10px; font-size: 15px; }
  }
</style>
