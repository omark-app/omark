<script lang="ts">
  import { tick } from 'svelte';
  import type { AppStore } from '../lib/store.svelte.ts';

  let { store }: { store: AppStore } = $props();

  type Row = { id: number; text: string };
  /** The line being edited, by row id. */
  type Editing = { el: HTMLElement; id: number };

  let adding = $state(false);
  let editing = $state.raw<Editing | null>(null);
  const els = new Map<number, HTMLElement>();

  let nextId = 0;
  let prev: Row[] = [];

  /**
   * Rows carry a stable id so an edited element survives inserts and deletes around it. Ids carry over
   * from the previous rows by common prefix/suffix, then an in-place edit (same count), then equal text.
   */
  function reconcile(texts: readonly string[]): Row[] {
    const out: (Row | undefined)[] = new Array(texts.length);
    let lo = 0;
    while (lo < texts.length && lo < prev.length && texts[lo] === prev[lo]!.text) {
      out[lo] = prev[lo];
      lo++;
    }
    let hn = texts.length;
    let hp = prev.length;
    while (hn > lo && hp > lo && texts[hn - 1] === prev[hp - 1]!.text) {
      hn--;
      hp--;
      out[hn] = prev[hp];
    }
    const spare = prev.slice(lo, hp);
    if (spare.length === hn - lo) {
      for (let i = lo; i < hn; i++) out[i] = { id: spare[i - lo]!.id, text: texts[i]! };
    } else {
      for (let i = lo; i < hn; i++) {
        const k = spare.findIndex((r) => r.text === texts[i]);
        out[i] = k >= 0 ? spare.splice(k, 1)[0] : { id: nextId++, text: texts[i]! };
      }
    }
    return (prev = out as Row[]);
  }

  const rows = $derived(reconcile(adding ? [...store.state.doc.always, ''] : store.state.doc.always));

  // The DOM of a line is owned here, not by Svelte's text rendering, so a refresh that re-renders the
  // lines never touches the line being typed in.
  $effect(() => {
    for (const row of rows) {
      const el = els.get(row.id);
      if (el && editing?.el !== el && el.textContent !== row.text) el.textContent = row.text;
    }
  });

  function track(el: HTMLElement, id: number) {
    els.set(id, el);
    return { destroy: () => void (els.get(id) === el && els.delete(id)) };
  }

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
    const found = rows.findIndex((r) => r.id === cur.id);
    const at = found >= 0 && found < lines.length ? found : -1;
    if (text === '') {
      if (!final) return;
      if (at >= 0) store.setAlways(lines.filter((_, i) => i !== at));
    } else if (at >= 0) {
      if (text !== lines[at]) store.setAlways(lines.map((l, i) => (i === at ? text : l)));
    } else {
      store.setAlways([...lines, text]);
    }
    adding = false;
    if (final) {
      editing = null;
      cur.el.textContent = text;
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

  function focused(el: HTMLElement, id: number): void {
    editing = { el, id };
  }

  function keydown(e: KeyboardEvent): void {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      (e.currentTarget as HTMLElement).blur();
    }
  }

  // Soft keyboards report Enter here rather than through keydown.
  function beforeinput(e: InputEvent): void {
    if (e.isComposing) return;
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
    els.get(rows[rows.length - 1]!.id)?.focus();
  }
</script>

<div class="alist">
  {#each rows as row (row.id)}
    <div
      class="aline"
      data-testid="always-line"
      contenteditable="true"
      role="textbox"
      tabindex="0"
      spellcheck="false"
      use:track={row.id}
      onfocus={(e) => focused(e.currentTarget, row.id)}
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
  /* iOS zooms the page in when an editable line under 16px takes focus, and doesn't zoom back out. */
  @media (max-width: 719.98px) {
    .aline { font-size: 16px; }
  }
  .aadd { align-self: flex-start; border: 0; background: none; padding: 4px 6px; font: 13px var(--mono); color: var(--faint); cursor: pointer; border-radius: 6px; }
  .aadd:hover { color: var(--ink); }
</style>
