<script lang="ts">
  import { BRAND } from '../brand.ts';
  import { SIGN_IN_NAMES, STORAGE_NAMES } from '../lib/environment.ts';
  import type { StorageProvider } from '../lib/environment.ts';
  /**
   * First run, or signed out: the way in is an account with one of `providers` (the files live in its
   * storage: OneDrive for Microsoft, Google Drive for Google). Each button names its provider, even when it
   * is the only one; `auth.signIn` keeps the plain `/api/auth/login` for the default. Where the browser
   * can, a folder on this computer is offered too; elsewhere a faint line says where it works.
   */
  let {
    providers,
    onsignin,
    folders = false,
    onfolder,
    error = null,
  }: {
    providers: string[];
    onsignin: (provider?: string) => void;
    /** The browser can pick a folder on this computer (Chrome and Edge on a computer); `onfolder` picks one. */
    folders?: boolean;
    onfolder?: () => void;
    error?: string | null;
  } = $props();

  const storages = $derived(providers.map((p) => STORAGE_NAMES[p as StorageProvider] ?? p).join(' or '));
</script>

<main class="signin">
  <h1>{BRAND.app.toLowerCase()}</h1>
  <p>Your tasks live in plain files in your {storages}. Sign in to open them.</p>
  <div class="buttons">
    {#each providers as provider (provider)}
      <button type="button" class="btn" onclick={() => onsignin(provider)}>
        Sign in with {SIGN_IN_NAMES[provider as StorageProvider] ?? provider}
      </button>
    {/each}
    {#if folders}
      <button type="button" class="btn secondary" onclick={() => onfolder?.()}>Use a folder on this computer</button>
    {/if}
  </div>
  {#if !folders}<p class="small">A folder on this computer works in Chrome or Edge on a computer.</p>{/if}
  {#if error}<p class="err" role="alert">{error}</p>{/if}
</main>

<style>
  .signin { max-width: 420px; margin: 20vh auto 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  h1 { margin: 0; font: 600 18px var(--mono); letter-spacing: -.01em; }
  p { margin: 0; font: 14px/1.5 var(--sans); color: var(--muted); }
  .buttons { display: flex; flex-wrap: wrap; gap: 10px; }
  .btn { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); border-radius: 8px; padding: 9px 16px; font: 500 14px var(--sans); cursor: pointer; }
  .btn.secondary { background: var(--surface); color: var(--ink); border-color: var(--line); }
  .small { font-size: 12px; }
  .err { font: 13px var(--mono); color: var(--danger); }
</style>
