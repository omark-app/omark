<script lang="ts">
  import { findLinks } from '@omark/tasks-core';

  /** The links in a task's title and notes (issue #73), clickable while those fields are being edited. */
  let { title, notes }: { title: string; notes: string } = $props();

  const links = $derived(findLinks(`${title}\n${notes}`));
</script>

{#if links.length > 0}
  <ul class="links" data-testid="task-links">
    {#each links as link (link.href)}
      <li><a href={link.href} target="_blank" rel="noopener noreferrer" title={link.href}><span class="arrow" aria-hidden="true">↗</span>{link.text}</a></li>
    {/each}
  </ul>
{/if}

<style>
  .links { display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0 6px; list-style: none; min-width: 0; }
  .links li { min-width: 0; }
  .links a { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; font: 13px/1.5 var(--mono); color: var(--accent); text-underline-offset: 2px; }
  .arrow { margin-right: .4em; color: var(--faint); }
</style>
