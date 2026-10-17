<script lang="ts">
  /** First run, or signed out: the only way in is a Microsoft account (the files live in its OneDrive). */
  let { onsignin, error = null }: { onsignin: () => void; error?: string | null } = $props();
</script>

<main class="signin">
  <h1>taskapp</h1>
  <p>Your tasks live in plain files in your OneDrive. Sign in to open them.</p>
  <button type="button" class="btn" onclick={onsignin}>Sign in with Microsoft</button>
  {#if error}<p class="err" role="alert">{error}</p>{/if}
</main>

<style>
  .signin { max-width: 420px; margin: 20vh auto 0; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  h1 { margin: 0; font: 600 18px var(--mono); letter-spacing: -.01em; }
  p { margin: 0; font: 14px/1.5 var(--sans); color: var(--muted); }
  .btn { border: 1px solid var(--accent); background: var(--accent); color: var(--on-accent); border-radius: 8px; padding: 9px 16px; font: 500 14px var(--sans); cursor: pointer; }
  .err { font: 13px var(--mono); color: var(--danger); }
</style>
