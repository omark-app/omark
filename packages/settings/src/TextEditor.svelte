<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { readSettings } from './read.ts';
  import type { Schema } from './schema.ts';

  /**
   * The settings file as plain text, with line numbers and the problem line marked.
   * Each change that reads cleanly is written at once; a text with a problem is never written.
   */
  let {
    schema,
    text,
    onwrite,
    ondone,
    actions,
  }: {
    schema: Schema;
    text: string;
    onwrite: (text: string) => void;
    ondone: () => void;
    /** More buttons for the row under the editor. */
    actions?: Snippet;
  } = $props();

  /** Must match `line-height` and `padding-top` below. */
  const LINE_PX = 20;
  const PAD_PX = 10;

  let draft = $state(untrack(() => text));
  // The outside text the draft last came from or wrote. A change made elsewhere replaces the draft,
  // unless the draft holds unsaved text (it doesn't read yet): that is kept, and replaces the change once it reads.
  let synced = untrack(() => text);
  let changedElsewhere = $state(false);
  $effect(() => {
    const t = text;
    untrack(() => {
      if (t === synced) return;
      if (draft !== synced) {
        changedElsewhere = true;
        return;
      }
      synced = t;
      draft = t;
    });
  });

  const error = $derived(readSettings(schema, draft).error);
  const lineCount = $derived(draft.split('\n').length);
  const rows = $derived(Math.min(Math.max(lineCount + 1, 8), 24));

  let area: HTMLTextAreaElement | undefined = $state();
  let gutter: HTMLDivElement | undefined = $state();
  let scrollTop = $state(0);

  function oninput(e: Event & { currentTarget: HTMLTextAreaElement }): void {
    draft = e.currentTarget.value;
    if (error !== null) return;
    synced = draft;
    changedElsewhere = false;
    if (draft !== text) onwrite(draft);
  }

  function onscroll(): void {
    if (!area) return;
    scrollTop = area.scrollTop;
    if (gutter) gutter.scrollTop = area.scrollTop;
  }

  onMount(() => {
    void tick().then(() => {
      if (!area) return;
      const line = error?.line;
      if (line) {
        area.scrollTop = Math.max(0, (line - 1) * LINE_PX - area.clientHeight / 2);
        onscroll();
      }
      area.scrollIntoView({ block: 'nearest' });
    });
  });
</script>

<div class="editor">
  <div class="box" class:bad={error !== null} style:--gutter="calc({Math.max(String(lineCount).length, 2)}ch + 18px)">
    <div class="gutter" bind:this={gutter} aria-hidden="true">
      {#each { length: lineCount }, i (i)}
        <div class="n" data-testid="text-line-{i + 1}" data-problem={error?.line === i + 1 ? 'true' : undefined}>{i + 1}</div>
      {/each}
    </div>
    <div class="body">
      {#if error?.line}
        <div class="band" style:top="{PAD_PX + (error.line - 1) * LINE_PX - scrollTop}px"></div>
      {/if}
      <textarea
        bind:this={area}
        data-testid="text-editor"
        aria-label={schema.file}
        aria-invalid={error !== null}
        aria-describedby={error ? 'settings-text-error' : undefined}
        {rows}
        wrap="off"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        value={draft}
        {oninput}
        {onscroll}
      ></textarea>
    </div>
  </div>

  {#if changedElsewhere}
    <div class="elsewhere" data-testid="text-changed-elsewhere" role="status">{schema.file.split('/').pop()} changed elsewhere. Your text replaces it once it reads.</div>
  {/if}

  {#if error}
    <div class="error" id="settings-text-error" data-testid="text-error" role="alert">
      {error.line === null ? error.message : `Line ${error.line}: ${error.message}`}
    </div>
  {/if}

  <div class="row">
    <button type="button" class="btn primary" data-testid="text-done" disabled={error !== null} onclick={ondone}>Done</button>
    {@render actions?.()}
  </div>
</div>

<style>
  .editor { display: flex; flex-direction: column; gap: 8px; }
  .box { position: relative; background: var(--bg); border: 1px solid var(--chip); border-radius: 8px; overflow: hidden; font-family: var(--mono); font-size: 12.5px; line-height: 20px; }
  .box:focus-within { border-color: var(--accent); }
  .box.bad { border-color: var(--danger); }
  /* The gutter takes the textarea's height, not its own, so the textarea scrolls. */
  .gutter { position: absolute; top: 0; bottom: 0; left: 0; width: var(--gutter); overflow: hidden; padding: 10px 0 40px; text-align: right; color: var(--faint); background: var(--chip); user-select: none; }
  .n { padding: 0 8px 0 10px; }
  .n[data-problem='true'] { color: var(--danger); font-weight: 600; background: color-mix(in srgb, var(--danger) 14%, transparent); }
  .body { position: relative; margin-left: var(--gutter); display: flex; }
  .band { position: absolute; left: 0; right: 0; height: 20px; background: color-mix(in srgb, var(--danger) 14%, transparent); pointer-events: none; }
  textarea { position: relative; flex: 1; min-width: 0; margin: 0; border: 0; outline: 0; resize: vertical; padding: 10px 14px; background: transparent; color: var(--ink); font: inherit; line-height: 20px; white-space: pre; overflow: auto; }
  .error { font-size: 12.5px; color: var(--danger); }
  .elsewhere { font-size: 12.5px; color: var(--muted); }
  .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .btn { font-family: var(--sans); font-size: 12.5px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 7px; padding: 7px 11px; cursor: pointer; }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent, var(--surface)); }
  .btn:disabled { opacity: .45; cursor: default; }
  /* 16px keeps iOS from zooming in on focus. */
  @media (max-width: 640px) {
    .box { font-size: 16px; }
  }
</style>
