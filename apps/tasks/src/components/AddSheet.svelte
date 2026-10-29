<script module lang="ts">
  import type { ChoiceKey, Dismissed } from '@omark/tasks-core';

  /**
   * What was typed and chosen. It outlives a dismissed sheet and is cleared only by a successful Add. A
   * picked chip or Important or Habit toggle holds while the typed shortcut words still say what they said when it
   * was picked (`*For`); typing a new date word, `imp` or `hab` takes over again (issue #19).
   */
  const draft = $state<{
    title: string;
    dismissed: Dismissed[];
    picked: ChoiceKey | 'day' | null;
    pickedFor: string;
    important: boolean | null;
    importantFor: boolean;
    habit: boolean | null;
    habitFor: boolean;
  }>({ title: '', dismissed: [], picked: null, pickedFor: '', important: null, importantFor: false, habit: null, habitFor: false });
</script>

<script lang="ts">
  import { addDays, dateChoices, dayMonth, endOfWeek, readQuickAdd, weekdayShort } from '@omark/tasks-core';
  import type { DateChoice } from '@omark/tasks-core';
  import type { AppStore } from '../lib/store.svelte.ts';
  import { part } from '../lib/part.svelte.ts';
  import ShortcutField from './ShortcutField.svelte';

  let { store, onclose }: { store: AppStore; onclose: () => void } = $props();

  const typed = $derived(readQuickAdd(draft.title, store.ctx, draft.dismissed));
  const typedKey = $derived(JSON.stringify(typed.when));
  const habit = $derived(draft.habit !== null && draft.habitFor === typed.habit ? draft.habit : typed.habit);
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
  // The picked chip while the typed words are unchanged, else the typed one, else Today for a habit, else
  // the configured bucket for new tasks. This week is not offered at the week's end, where its date is tomorrow or today (#26).
  const chip = $derived.by(() => {
    // A habit with no date word starts today.
    const wanted =
      (draft.picked !== null && draft.pickedFor === typedKey ? draft.picked : null) ?? typedChip ?? (habit ? 'today' : store.config.newTaskBucket);
    if (chips.some((c) => c.key === wanted)) return wanted;
    return endOfWeek(store.ctx) === store.ctx.today ? 'today' : 'tomorrow';
  });
  const important = $derived(
    draft.important !== null && draft.importantFor === typed.important ? draft.important : typed.important,
  );
  let input: HTMLInputElement | undefined = $state();

  // A pick the typed words have since overruled is gone for good, so deleting the word doesn't bring it back.
  $effect(() => {
    if (draft.picked !== null && draft.pickedFor !== typedKey) draft.picked = null;
    if (draft.important !== null && draft.importantFor !== typed.important) draft.important = null;
    if (draft.habit !== null && draft.habitFor !== typed.habit) draft.habit = null;
  });

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

  /** Turning it on at the limit says why (the store's toast) and leaves it off. */
  function toggleHabit(): void {
    if (!habit && !store.habitRoom()) return;
    draft.habit = !habit;
    draft.habitFor = typed.habit;
    input?.focus();
  }

  function add(): void {
    const when: DateChoice = chip === 'day' ? { date: typedDay! } : chip;
    if (store.add(typed.title, when, important, habit)) {
      Object.assign(draft, { title: '', dismissed: [], picked: null, pickedFor: '', important: null, importantFor: false, habit: null, habitFor: false });
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
    data-draft
    placeholder="What needs doing?"
    autocomplete="off"
    aria-label="New task"
    tags={part.tags}
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
  <div class="flagrow">
    <button type="button" class="chip flag hab" class:on={habit} aria-pressed={habit} onclick={toggleHabit}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21v-9"></path><path d="M12 12c0-4 3-7 8-7 0 4-3 7-8 7z"></path><path d="M12 14c0-3-2-5-6-5 0 3 2 5 6 5z"></path></svg>
      Habit
    </button>
    <span class="tip">or type hab</span>
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
  .flagrow .flag.hab { color: var(--habit-ink); }
  .flagrow .flag.hab.on { background: var(--habit-soft); border-color: var(--habit); color: var(--habit-ink); font-weight: 600; }
  .tip { font: 12px var(--mono); color: var(--muted); }
</style>
