<script lang="ts">
  let { lines }: { lines: readonly string[] } = $props();
</script>

<div class="alist">
  {#each lines as line, i (i)}
    <div class="aline" data-testid="always-line">{line}</div>
  {/each}
</div>

<style>
  .alist { display: flex; flex-direction: column; gap: 4px; }
  .aline { font: 15px/1.5 var(--mono); padding: 4px 6px; border-radius: 6px; overflow-wrap: anywhere; }
  .aline:hover { background: color-mix(in srgb, var(--sel) 60%, transparent); }
</style>
