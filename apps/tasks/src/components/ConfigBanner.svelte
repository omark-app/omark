<script lang="ts">
  import type { ConfigError } from '@omark/tasks-core';

  let { error }: { error: ConfigError } = $props();

  const where = $derived(error.line === null ? 'config.yaml' : `config.yaml, line ${error.line}`);
</script>

<p class="banner" role="status" data-testid="config-banner">
  <b>{where}:</b> {error.message} — using the default settings until it is fixed.
  <a href="#settings" data-testid="config-banner-settings">Open Settings</a>
</p>

<style>
  .banner { margin: 0; padding: 8px 12px; border: 1px solid var(--line); border-left: 3px solid var(--danger); border-radius: 8px; background: var(--surface); font: 12px/1.5 var(--mono); color: var(--muted); }
  a { color: var(--accent); white-space: nowrap; }
  b { font-weight: 600; color: var(--ink); }
</style>
