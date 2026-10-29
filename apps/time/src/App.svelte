<script lang="ts">
  import type { TimeStore } from './lib/store.svelte.ts';
  import FirstRun from './components/FirstRun.svelte';
  import Shell from './components/Shell.svelte';
  import { BUILD_ID, BUILD_NUMBER, STORAGE_MODE } from './env.ts';

  let { store }: { store: TimeStore } = $props();
</script>

<!-- Its shared styles stay inside this box: in the one Omark app, Tasks' own .card must not take them. -->
<div class="omark-time">
<header>
  <img src="/icons/favicon.svg" alt="" width="28" height="28" />
  <h1>Omark Time</h1>
</header>

<main>
  {#if store.phase === 'loading'}
    <p class="muted">Opening…</p>
  {:else if store.phase === 'error'}
    <section class="card" role="alert">
      <h2>Sign-in failed</h2>
      <p>{store.error}</p>
      <button class="primary" onclick={() => location.reload()}>Try again</button>
    </section>
  {:else if store.phase === 'signin'}
    <section class="card">
      <h2>Your calendar, as hours</h2>
      {#if store.embedded}
        <p>
          Omark Time reads your Google Calendar and keeps hours per project in CSV files in your Omark folder.
          Connecting lets it see your calendars and their events, and nothing else.
        </p>
        <button class="primary" onclick={() => store.signIn()}>Connect Google Calendar</button>
      {:else}
        <p>
          Omark Time reads your Google Calendar and keeps hours per project in CSV files in your own storage. Signing in
          lets it see your calendars and their events, and nothing else.
        </p>
        <button class="primary" onclick={() => store.signIn()}>Sign in with Google</button>
      {/if}
    </section>
  {:else if store.phase === 'storage' || store.phase === 'calendars'}
    <FirstRun {store} />
  {:else}
    <Shell {store} />
  {/if}
</main>

<footer class="muted">
  {STORAGE_MODE === 'fake' ? 'PREVIEW · fake calendar · ' : ''}v{BUILD_NUMBER ?? '?'} ({BUILD_ID})
</footer>
</div>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
  }
  h1 {
    font-size: 20px;
    margin: 0;
  }
  footer {
    margin-top: 32px;
    font-size: 12px;
    font-family: var(--mono);
  }
  .omark-time :global(.card) {
    background: var(--surface);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 20px;
    margin-bottom: 16px;
  }
  .omark-time :global(.card h2) {
    font-size: 17px;
    margin: 0 0 8px;
  }
  .omark-time :global(.muted) {
    color: var(--muted);
  }
  .omark-time :global(button.primary) {
    background: var(--accent);
    color: var(--on-accent);
    border: 0;
    border-radius: 10px;
    padding: 10px 16px;
    font-weight: 600;
    cursor: pointer;
  }
  .omark-time :global(button.secondary) {
    background: var(--chip);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 14px;
    cursor: pointer;
  }
  .omark-time :global(button:disabled) {
    opacity: 0.55;
    cursor: default;
  }
</style>
