<script lang="ts">
  import { tick } from 'svelte';
  import { carryDismissed, completeTag, matchTags, shortcutWords, tagAtCaret } from '@omark/tasks-core';
  import type { Dismissed } from '@omark/tasks-core';
  import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';
  import { autogrow } from '../lib/autogrow.ts';

  /**
   * A text input that shows the shortcut words of a new task's title bold as they are typed (issue #19).
   * The input's own text is transparent; a copy of it, with the words marked, is drawn underneath at the
   * same place. Backspace right after a bold word turns it back into text instead of deleting a letter.
   * `wrap` makes it a box that grows onto more lines instead of scrolling sideways; a title is still one
   * line, so a pasted line break becomes a space.
   */
  let {
    value = $bindable(''),
    dismissed = $bindable([]),
    input = $bindable(),
    class: cls = '',
    wrap = false,
    ontype,
    tags,
    onkeydown: onkey,
    onblur: onleave,
    ...rest
  }: {
    value?: string;
    dismissed?: Dismissed[];
    input?: HTMLInputElement | HTMLTextAreaElement;
    class?: string;
    wrap?: boolean;
    /** Called after each change the user types, once `value` holds it. */
    ontype?: () => void;
    /**
     * Tags to offer as `#` is typed (Goals spec 9: the project codes and area tags, in the one Omark app); none
     * offered without.
     */
    tags?: readonly string[];
    onkeydown?: (e: KeyboardEvent) => void;
    onblur?: (e: FocusEvent) => void;
  } & Omit<HTMLInputAttributes, 'value' | 'class' | 'oninput'> = $props();

  let mirror: HTMLSpanElement | undefined = $state();

  // Tag suggestions: the #word at the caret, matched against `tags`; Escape closes them until the next keystroke.
  let caret = $state<number | null>(null);
  let focused = $state(false);
  let closed = $state(false);
  let chosen = $state(0);
  const at = $derived(tags && tags.length > 0 && focused ? tagAtCaret(value, caret) : null);
  const hits = $derived(at && !closed ? matchTags(at.query, tags!) : []);
  const listId = `tags-${Math.random().toString(36).slice(2, 8)}`;
  /** Read by assistive tech: the field controls the list while it is open, with the chosen option active. */
  const combo = $derived(
    tags ? { role: 'combobox' as const, 'aria-autocomplete': 'list' as const, 'aria-expanded': hits.length > 0, 'aria-controls': listId, 'aria-activedescendant': hits.length > 0 ? `${listId}-${chosen}` : undefined } : {},
  );
  const noteCaret = (): void => {
    caret = input?.selectionStart ?? null;
  };

  async function choose(tag: string): Promise<void> {
    if (!at || !input) return;
    const done = completeTag(value, at, tag);
    // Dismissed shortcut words after the tag move with the text.
    dismissed = carryDismissed(dismissed, value, done.text);
    value = done.text;
    ontype?.();
    await tick();
    input.setSelectionRange(done.caret, done.caret);
    caret = done.caret;
  }

  function keydown(e: KeyboardEvent): void {
    if (hits.length > 0 && !e.isComposing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        chosen = (chosen + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length;
        return;
      }
      if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
        e.preventDefault();
        void choose(hits[Math.min(chosen, hits.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        // Only the list closes: not the sheet or the field around it.
        e.preventDefault();
        e.stopPropagation();
        closed = true;
        return;
      }
    }
    onkey?.(e);
  }

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
    mirror.scrollTop = input.scrollTop;
  }

  $effect(() => {
    void value;
    sync();
  });

  // Moving the caret by tap or with the space bar on iOS can scroll the input with no key or scroll event.
  $effect(() => {
    const onselection = (): void => {
      if (document.activeElement === input) {
        sync();
        // A click or tap that moves the caret fires no key event.
        noteCaret();
      }
    };
    document.addEventListener('selectionchange', onselection);
    return () => document.removeEventListener('selectionchange', onselection);
  });

  const oneLine = (text: string): string => text.replace(/\r?\n|\r/g, ' ');

  function oninput(): void {
    // A fallback for line breaks that got past onbeforeinput (an IME, say).
    if (wrap && /[\r\n]/.test(input!.value)) {
      const at = input!.selectionStart;
      const before = at === null ? null : oneLine(input!.value.slice(0, at)).length;
      input!.value = oneLine(input!.value);
      if (before !== null) input!.setSelectionRange(before, before);
    }
    const next = input!.value;
    dismissed = carryDismissed(dismissed, value, next);
    value = next;
    closed = false;
    chosen = 0;
    noteCaret();
    ontype?.();
  }

  function onbeforeinput(e: InputEvent): void {
    if (wrap && keepOneLine(e)) return;
    if (e.inputType !== 'deleteContentBackward' || !input) return;
    const at = input.selectionStart;
    if (at === null || at !== input.selectionEnd) return;
    const word = words.find((w) => w.end === at);
    if (!word) return;
    e.preventDefault();
    dismissed = [...dismissed, { start: word.start, word: word.word }];
  }
  /**
   * Puts pasted, dropped or typed text in with its line breaks made spaces, as the browser's own edit so
   * the caret lands after it and Ctrl+Z takes it back. True when it handled the event.
   */
  function keepOneLine(e: InputEvent): boolean {
    if (!e.cancelable) return false;
    if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
      e.preventDefault();
      return true;
    }
    const text = e.data ?? e.dataTransfer?.getData('text/plain') ?? null;
    if (!e.inputType.startsWith('insert') || text === null || !/[\r\n]/.test(text)) return false;
    e.preventDefault();
    document.execCommand('insertText', false, oneLine(text));
    return true;
  }
</script>

<span class="sf" class:wrap>
  <span class="mirror" aria-hidden="true" bind:this={mirror}><span class="line">{#each parts as p, i (i)}{#if p.kind}<b data-testid="shortcut-word" class:imp={p.kind === 'important'} class:hab={p.kind === 'habit'}>{p.text}</b>{:else}{p.text}{/if}{/each}</span></span>
  {#if wrap}
    <textarea
      bind:this={input}
      {...rest as HTMLTextareaAttributes}
      class={cls}
      style="color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--ink)"
      rows={1}
      {value}
      use:autogrow={value}
      {oninput}
      {onbeforeinput}
      onscroll={sync}
      onselect={() => (sync(), noteCaret())}
      onkeyup={() => (sync(), noteCaret())}
      onfocus={() => (sync(), (focused = true), noteCaret())}
      onblur={(e) => ((focused = false), onleave?.(e))}
      onkeydown={keydown}
      {...combo}
    ></textarea>
  {:else}
    <input
      bind:this={input}
      {...rest}
      class={cls}
      style="color: transparent; -webkit-text-fill-color: transparent; caret-color: var(--ink)"
      {value}
      {oninput}
      {onbeforeinput}
      onscroll={sync}
      onselect={() => (sync(), noteCaret())}
      onkeyup={() => (sync(), noteCaret())}
      onfocus={() => (sync(), (focused = true), noteCaret())}
      onblur={(e) => ((focused = false), onleave?.(e))}
      onkeydown={keydown}
      {...combo}
    />
  {/if}
  {#if hits.length > 0}
    <ul class="tags" id={listId} role="listbox" aria-label="Tags" data-testid="tag-suggestions">
      {#each hits as t, i (i)}
        <!-- mousedown, so the field keeps its focus and the list is still there for the click. -->
        <li role="option" id="{listId}-{i}" aria-selected={i === chosen} class:on={i === chosen} onmousedown={(e) => (e.preventDefault(), void choose(t))}>#{t}</li>
      {/each}
    </ul>
  {/if}
</span>

<style>
  .sf { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
  /* The input's own text is made transparent inline, so no field style (e.g. the sheets' .fld) can win. */
  .sf > input { flex: 1; min-width: 0; }
  .sf > input::placeholder { color: var(--faint); -webkit-text-fill-color: var(--faint); }
  .mirror {
    position: absolute; inset: 0; display: flex; align-items: center; overflow: hidden;
    color: var(--sf-ink, var(--ink)); pointer-events: none; border: 0 solid transparent; box-sizing: border-box;
  }
  /* The 1px matches the room the input keeps for the caret after the last letter, so both scroll alike. */
  .line { flex: none; white-space: pre; padding-right: 1px; }
  /* Both wrap alike: same width, padding and wrapping rules, so the bold copy breaks lines where the text does. */
  .wrap > textarea { display: block; resize: none; overflow: hidden; white-space: pre-wrap; overflow-wrap: break-word; }
  .wrap .mirror { align-items: flex-start; }
  .wrap .line { flex: 1 1 auto; min-width: 0; white-space: pre-wrap; overflow-wrap: break-word; padding-right: 0; }
  b { font-weight: 600; color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: 3px; }
  b.imp { color: var(--imp); background: var(--imp-soft); }
  b.hab { color: var(--habit-ink); background: var(--habit-soft); }
  .tags { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; min-width: 12rem; max-width: 100%; margin: 0; padding: 4px; list-style: none; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; box-shadow: var(--shadow); }
  .tags li { padding: 6px 10px; border-radius: 6px; font: 14px var(--mono); color: var(--ink); cursor: pointer; }
  .tags li.on { background: var(--sel, var(--chip)); }
</style>
