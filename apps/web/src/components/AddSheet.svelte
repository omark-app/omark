<script module lang="ts">
  import type { ChoiceKey, Dismissed } from '@taskapp/core';

  /**
   * What was typed and chosen. It outlives a dismissed sheet and is cleared only by a successful Add. A
   * picked chip or Important toggle holds while the typed shortcut words still say what they said when it
   * was picked (`*For`); typing a new date word or `imp` takes over again (issue #19).
   */
  const draft = $state<{
    title: string;
    dismissed: Dismissed[];
    picked: ChoiceKey | 'day' | null;
    pickedFor: string;
    important: boolean | null;
    importantFor: boolean;
  }>({ title: '', dismissed: [], picked: null, pickedFor: '', important: null, importantFor: false });
</script>

<script lang="ts">
  import { addDays, dateChoices, dayMonth, readQuickAdd, weekdayShort } from '@taskapp/core';
  import type { DateChoice } from '@taskapp/core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import ShortcutField from './ShortcutField.svelte';

  let { store, onclose }: { store: AppStore; onclose: () => void } = $props();

  const typed = $derived(readQuickAdd(draft.title, store.ctx, draft.dismissed));
  const typedKey = $derived(JSON.stringify(typed.when));
  /** A typed weekday gets its own chip (Tomorrow's date shows as Tomorrow). */
  const typedDay = $derived(
    typeof typed.when === 'object' && typed.when !== null && typed.when.date !== addDays(store.ctx.today, 1)
      ? typed.when.date
      : null,
  );
  const chips = $derived.by(() => {
    const list: { key: ChoiceKey | 'day'; name: string }[] = dateChoices(store.ctx);
    if (typedDay) list.splice(list.length - 1, 0, { key: 'day', name: `${weekdayShort(typedDay)} ${dayMonth(typedDay, store.ctx)}` });
    return list;
  });
  const typedChip = $derived.by((): ChoiceKey | 'day' | null => {
    const w = typed.when;
    if (w === null) return null;
    if (typeof w === 'object') return typedDay ? 'day' : 'tomorrow';
    return w;
  });
  // The picked chip while the typed words are unchanged, else the typed one, else the configured bucket
  // for new tasks; Today when that chip is not offered (This week on its last day).
  const chip = $derived.by(() => {
    const wanted = (draft.picked !== null && draft.pickedFor === typedKey ? draft.picked : null) ?? typedChip ?? store.config.newTaskBucket;
    return chips.some((c) => c.key === wanted) ? wanted : 'today';
  });
  const important = $derived(
    draft.important !== null && draft.importantFor === typed.important ? draft.important : typed.important,
  );
  let input: HTMLInputElement | undefined = $state();

  function choose(key: ChoiceKey | 'day'): void {
    draft.picked = key;
    draft.pickedFor = typedKey;
    input?.focus();
  }

  function toggleImportant(): void {
    draft.important = !important;
    draft.importantFor = typed.important;
    input?.focus();
  }

  function add(): void {
    const when: DateChoice = chip === 'day' ? { date: typedDay! } : chip;
    if (store.add(typed.title, when, important)) {
      Object.assign(draft, { title: '', dismissed: [], picked: null, pickedFor: '', important: null, importantFor: false });
    }
    onclose();
  }
</script>

<form class="add" onsubmit={(e) => { e.preventDefault(); add(); }}>
  <ShortcutField
    bind:value={draft.title}
    bind:dismissed={draft.dismissed}
    bind:input
    class="fld wide"
    data-autofocus
    placeholder="What needs doing?"
    autocomplete="off"
    aria-label="New task"
  />
  <div class="chips">
    {#each chips as c (c.key)}
      <button type="button" class="chip" class:on={chip === c.key} aria-pressed={chip === c.key} onclick={() => choose(c.key)}>{c.name}</button>
    {/each}
  </div>
  <div class="flagrow">
    <button type="button" class="chip flag" class:on={important} aria-pressed={important} onclick={toggleImportant}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h12l-2.5 4 2.5 4H5"></path></svg>
      Important
    </button>
    <span class="tip">or type imp</span>
  </div>
  <div class="actions">
    <button type="button" class="btn ghost" onclick={onclose}>Cancel</button>
    <button type="submit" class="btn primary">Add</button>
  </div>
</form>

<style>
  .add { display: flex; flex-direction: column; gap: 12px; }
  .flagrow { display: flex; align-items: center; gap: 10px; }
  .flagrow .flag { display: inline-flex; align-items: center; gap: 6px; color: var(--imp); }
  .flagrow .flag.on { background: var(--imp); border-color: var(--imp); color: var(--on-imp); }
  .tip { font: 12px var(--mono); color: var(--muted); }
</style>
