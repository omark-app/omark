<script lang="ts">
  import type { SyncStatus } from '@omark/storage';
  import { BUILD_ID, BUILD_NUMBER, BUILD_TIME, LOOK } from '../env.ts';
  import type { Updates } from '../lib/updates.svelte.ts';
  import { versionLabel } from '../lib/version.ts';

  /**
   * The faint save status; `offline` and `sign in needed` are the sync banner's to say. A newer build
   * waiting to load is offered here (`onupdate` loads it), and `updating…` shows while it loads. The gear
   * opens Settings; the Settings page itself shows the line without it.
   */
  let {
    status,
    updates,
    onupdate,
    settingsLink = true,
  }: {
    status: SyncStatus;
    updates?: Pick<Updates, 'available' | 'applying'>;
    onupdate?: () => void;
    settingsLink?: boolean;
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
  <span class="build" data-testid="build" title={`Build ${BUILD_ID}, ${BUILD_TIME}`}>{versionLabel(BUILD_NUMBER, BUILD_ID, BUILD_TIME)}</span>
  {#if settingsLink}
    <a class="gear" href="#settings" data-testid="open-settings" aria-label="Settings" title="Settings">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor">
        <!-- A ring with eight teeth (a dashed circle) round a hole. -->
        <circle cx="8" cy="8" r="6.1" stroke-width="2.2" stroke-dasharray="2.3 2.49" />
        <circle cx="8" cy="8" r="3.9" stroke-width="2.2" />
      </svg>
    </a>
  {/if}
</span>

<style>
  .line { display: inline-flex; gap: 10px; align-items: baseline; font: 12px var(--mono); color: var(--faint); white-space: nowrap; }
  .build { font-size: 11px; opacity: .8; }
  .update { border: 0; padding: 0; background: none; font: inherit; color: var(--accent); cursor: pointer; }
  /* A small icon that stays inside the line (it ends the board's rail); touch screens get a finger-sized target. */
  .gear { display: inline-grid; place-items: center; align-self: center; width: 20px; height: 16px; margin: 0 -3px; border-radius: 6px; color: var(--muted); }
  @media (pointer: coarse) {
    .gear { width: 28px; height: 28px; margin: -8px -6px; border-radius: 8px; }
  }
  .gear:hover { color: var(--ink); }
  .gear:active { background: var(--sel); }
  .env { font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--accent); }
</style>
