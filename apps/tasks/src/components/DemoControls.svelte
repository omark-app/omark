<script lang="ts">
  import { REAL_USE_URL } from '../env.ts';
  import { requestDemoReset, RESET_CONFIRM } from '../lib/demo.ts';

  /** The demo's Reset demo button and its link to the real app. */
  async function reset(): Promise<void> {
    if (!confirm(RESET_CONFIRM)) return;
    await requestDemoReset();
    location.reload();
  }
</script>

<span class="demo">
  <button type="button" data-testid="reset-demo" onclick={reset}>Reset demo</button>
  <a data-testid="real-use" href={REAL_USE_URL}>Use it for real</a>
</span>

<style>
  .demo { display: inline-flex; gap: 10px; align-items: baseline; font: 12px var(--mono); white-space: nowrap; }
  button, a { border: 0; padding: 0; background: none; font: inherit; color: var(--accent); text-decoration: none; cursor: pointer; }
</style>
