<script lang="ts">
  import { dayMonth, describeRepeat, doneNotes, weekdayShort } from '@omark/tasks-core';
  import type { DoneEntry } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import LinkedText from './LinkedText.svelte';

  /** A completed task found by search, read-only (reopening one is in the backlog). */
  let { store, entry, onclose }: { store: AppStore; entry: DoneEntry; onclose: () => void } = $props();

  const notes = $derived(doneNotes(entry));
  // The detail's long date form: `Wed 14 Oct`.
  const doneOn = $derived(entry.doneOn === null ? '' : `${weekdayShort(entry.doneOn)} ${dayMonth(entry.doneOn, store.ctx)}`);
</script>

<h3 class="done-title" data-testid="done-title"><LinkedText text={entry.title} /></h3>
<div class="sub">✅ Completed {doneOn}{entry.repeat ? ` · ↻ ${describeRepeat(entry.repeat)}` : ''}</div>
{#if notes.length > 0}
  <ul class="notes">
    {#each notes as note, i (i)}<li><LinkedText text={note} /></li>{/each}
  </ul>
{/if}
<div class="actions">
  <button class="btn primary" data-autofocus onclick={onclose}>Close</button>
</div>

<style>
  .done-title { text-decoration: line-through; text-decoration-color: var(--faint); }
  .sub { margin-top: -4px; }
  .notes { margin: 0; padding: 0 0 0 18px; font: 13px/1.6 var(--mono); color: var(--muted); overflow-wrap: anywhere; }
</style>
