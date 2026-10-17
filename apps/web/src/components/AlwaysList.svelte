<script lang="ts">
  import { tick } from 'svelte';
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store }: { store: AppStore } = $props();

  /** The line being edited. `origin` is its saved text (null for a line not added yet). */
  type Editing = { el: HTMLElement; index: number; origin: string | null };

  let adding = $state(false);
  let editing = $state.raw<Editing | null>(null);
  let els: HTMLElement[] = $state([]);

  const rows = $derived(adding ? [...store.state.doc.always, ''] : store.state.doc.always);

  // The DOM of a line is owned here, not by Svelte's text rendering, so a refresh that re-renders the
  // lines never touches the line being typed in.
  $effect(() => {
    rows.forEach((text, i) => {
      const el = els[i];
      if (el && editing?.el !== el && el.textContent !== text) el.textContent = text;
    });
  });

  const clean = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

  /**
   * Saves the line being edited against the latest lines. `final` ends the edit (blur, Enter, unmount);
   * otherwise (page hidden, refresh) the line stays open and an emptied line is left for the blur.
   */
  function commit(final: boolean): void {
    const cur = editing;
    if (!cur) return;
    const text = clean(cur.el);
    const lines = store.state.doc.always;
    let at = -1;
    if (cur.origin !== null) at = lines[cur.index] === cur.origin ? cur.index : lines.indexOf(cur.origin);
    if (text === '') {
      if (!final) return;
      if (at >= 0) store.setAlways(lines.filter((_, i) => i !== at));
    } else if (at >= 0) {
      if (text !== lines[at]) store.setAlways(lines.map((l, i) => (i === at ? text : l)));
    } else {
      store.setAlways([...lines, text]);
      at = lines.length;
    }
    if (final) {
      editing = null;
      adding = false;
      cur.el.textContent = text;
    } else {
      editing = { el: cur.el, index: at, origin: text };
      adding = false;
    }
  }

  // The store runs this before every flush and refresh.
  $effect(() => {
    const off = store.registerPending(() => commit(false));
    return () => {
      off();
      commit(true);
    };
  });

  function focused(el: HTMLElement, index: number): void {
    editing = { el, index, origin: store.state.doc.always[index] ?? null };
  }

  function keydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  }

  // Soft keyboards report Enter here rather than through keydown.
  function beforeinput(e: InputEvent): void {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  }

  function paste(e: ClipboardEvent): void {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  }

  async function add(): Promise<void> {
    adding = true;
    await tick();
    els[store.state.doc.always.length]?.focus();
  }
</script>

<div class="alist">
  {#each rows as _, i (i)}
    <div
      class="aline"
      data-testid="always-line"
      contenteditable="true"
      role="textbox"
      tabindex="0"
      spellcheck="false"
      bind:this={els[i]}
      onfocus={(e) => focused(e.currentTarget, i)}
      onblur={() => commit(true)}
      onkeydown={keydown}
      onbeforeinput={beforeinput}
      onpaste={paste}
    ></div>
  {/each}
  <button class="aadd" data-testid="always-add" type="button" onclick={add}>+ Add a line</button>
</div>

<style>
  .alist { display: flex; flex-direction: column; gap: 4px; }
  .aline { font: 15px/1.5 var(--mono); padding: 4px 6px; border-radius: 6px; outline: 0; overflow-wrap: anywhere; min-height: 1.5em; }
  .aline:hover { background: color-mix(in srgb, var(--sel) 60%, transparent); }
  .aline:focus { background: var(--sel); }
  .aadd { align-self: flex-start; border: 0; background: none; padding: 4px 6px; font: 13px var(--mono); color: var(--faint); cursor: pointer; border-radius: 6px; }
  .aadd:hover { color: var(--ink); }
</style>
