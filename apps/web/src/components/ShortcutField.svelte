<script lang="ts">
  import { carryDismissed, shortcutWords } from '@taskapp/core';
  import type { Dismissed } from '@taskapp/core';
  import type { HTMLInputAttributes } from 'svelte/elements';

  /**
   * A text input that shows the shortcut words of a new task's title bold as they are typed (issue #19).
   * The input's own text is transparent; a copy of it, with the words marked, is drawn underneath at the
   * same place. Backspace right after a bold word turns it back into text instead of deleting a letter.
   */
  let {
    value = $bindable(''),
    dismissed = $bindable([]),
    input = $bindable(),
    class: cls = '',
    ...rest
  }: {
    value?: string;
    dismissed?: Dismissed[];
    input?: HTMLInputElement;
    class?: string;
  } & Omit<HTMLInputAttributes, 'value' | 'class'> = $props();

  let mirror: HTMLSpanElement | undefined = $state();

  const words = $derived(shortcutWords(value, dismissed));
  const parts = $derived.by(() => {
    const out: { text: string; kind: string | null }[] = [];
    let at = 0;
    for (const w of words) {
      if (w.start > at) out.push({ text: value.slice(at, w.start), kind: null });
      out.push({ text: w.word, kind: w.kind });
      at = w.end;
    }
    if (at < value.length) out.push({ text: value.slice(at), kind: null });
    return out;
  });

  /** Lines the copy up with the input: same box, font and padding, scrolled the same. */
  function sync(): void {
    if (!input || !mirror) return;
    const cs = getComputedStyle(input);
    for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'borderLeftWidth', 'borderRightWidth', 'borderTopWidth', 'borderBottomWidth'] as const) {
      mirror.style[p] = cs[p];
    }
    mirror.scrollLeft = input.scrollLeft;
  }

  $effect(() => {
    void value;
    sync();
  });

  function oninput(): void {
    const next = input!.value;
    dismissed = carryDismissed(dismissed, value, next);
    value = next;
  }

  function onbeforeinput(e: InputEvent): void {
    if (e.inputType !== 'deleteContentBackward' || !input) return;
    const at = input.selectionStart;
    if (at === null || at !== input.selectionEnd) return;
    const word = words.find((w) => w.end === at);
    if (!word) return;
    e.preventDefault();
    dismissed = [...dismissed, { start: word.start, word: word.word }];
  }
</script>

<span class="sf">
  <span class="mirror" aria-hidden="true" bind:this={mirror}><span class="line">{#each parts as p, i (i)}{#if p.kind}<b data-testid="shortcut-word" class:imp={p.kind === 'important'}>{p.text}</b>{:else}{p.text}{/if}{/each}</span></span>
  <input
    bind:this={input}
    {...rest}
    class={cls}
    style="color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--ink)"
    {value}
    {oninput}
    {onbeforeinput}
    onscroll={sync}
    onselect={sync}
    onkeyup={sync}
    onfocus={sync}
  />
</span>

<style>
  .sf { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
  /* The input's own text is made transparent inline, so no field style (e.g. the sheets' .fld) can win. */
  .sf > input { flex: 1; min-width: 0; }
  .sf > input::placeholder { color: var(--faint); -webkit-text-fill-color: var(--faint); }
  .mirror {
    position: absolute; inset: 0; display: flex; align-items: center; overflow: hidden;
    color: var(--ink); pointer-events: none; border: 0 solid transparent; box-sizing: border-box;
  }
  /* The 1px matches the room the input keeps for the caret after the last letter, so both scroll alike. */
  .line { flex: none; white-space: pre; padding-right: 1px; }
  b { font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: 3px; }
  b.imp { color: var(--imp); background: var(--imp-soft); }
</style>
