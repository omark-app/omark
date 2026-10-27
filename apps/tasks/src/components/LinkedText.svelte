<script lang="ts">
  import { linkParts } from '@omark/tasks-core';

  /**
   * Text with its web links clickable (issue #73). A link opens in a new tab (in the installed app, the
   * default browser), never selecting the row it sits in, and a drag from it drags the row, not the link.
   */
  let { text }: { text: string } = $props();

  const parts = $derived(linkParts(text));
</script>

{#each parts as p, i (i)}{#if p.href}<a class="link" href={p.href} target="_blank" rel="noopener noreferrer" draggable="false" onclick={(e) => e.stopPropagation()}>{p.text}</a>{:else}{p.text}{/if}{/each}

<style>
  .link { color: inherit; text-decoration: underline; text-decoration-color: var(--faint); text-underline-offset: 2px; cursor: pointer; }
  .link:hover { text-decoration-color: currentColor; }
</style>
