<script lang="ts">
  import { untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { applyField, valueOf } from './edit.ts';
  import Field from './Field.svelte';
  import KeysCard from './KeysCard.svelte';
  import { readSettings } from './read.ts';
  import { fieldId } from './schema.ts';
  import type { Field as SettingField, Schema } from './schema.ts';
  import TextEditor from './TextEditor.svelte';

  /**
   * The Settings page, drawn from a schema. It knows nothing about the app: it shows `text` (the file
   * as it is now) and hands every change back through `onwrite` as the whole new text.
   */
  let {
    schema,
    text,
    onwrite,
    back,
    apps,
    note = null,
    status,
    defaultText,
  }: {
    schema: Schema;
    text: string;
    onwrite: (text: string) => void;
    back: { label: string; href: string };
    apps: { current: string; other: { label: string; href: string } };
    /** A message above the cards, e.g. that a change made elsewhere won. */
    note?: string | null;
    /** The save status, shown beside the file's buttons. */
    status?: Snippet;
    /** What Reset to defaults writes. */
    defaultText: string;
  } = $props();

  const RESET_QUESTION = 'Reset every setting to its default? Comments you added are lost.';
  const CONFIG_ID = 'config';

  const read = $derived(readSettings(schema, text));

  // A file that doesn't read opens the text editor, also when it breaks while the page is open.
  // Only the user goes back to the form (Done), never the page on its own.
  let editing = $state(untrack(() => readSettings(schema, text).error !== null));
  $effect(() => {
    if (read.error) editing = true;
  });

  function write(field: SettingField, value: unknown): string | null {
    const r = applyField(schema, text, field, value);
    if ('error' in r) return r.error;
    if (r.text !== text) onwrite(r.text);
    return null;
  }

  // Reset starts the text editor afresh, so it shows the defaults even over unsaved text.
  let resets = $state(0);
  function reset(): void {
    if (!window.confirm(RESET_QUESTION)) return;
    onwrite(defaultText);
    resets++;
  }

  const navItems = $derived([...schema.sections.map((s) => ({ id: s.id, title: s.title })), { id: CONFIG_ID, title: 'config.yaml' }]);

  // The nav marks the first card in the upper part of the screen.
  let current = $state('');
  let visible = new Set<string>();
  // After a nav click the clicked item stays marked while the page scrolls to it.
  let pinnedUntil = 0;
  $effect(() => {
    if (editing) return;
    const ids = navItems.map((n) => n.id);
    const cards = ids.map((id) => document.getElementById(`settings-${id}`)).filter((e): e is HTMLElement => e !== null);
    visible = new Set();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = e.target.id.slice('settings-'.length);
        if (e.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      if (performance.now() < pinnedUntil) return;
      current = ids.find((id) => visible.has(id)) ?? current;
    }, { rootMargin: '-10% 0px -60% 0px' });
    for (const c of cards) observer.observe(c);
    return () => observer.disconnect();
  });

  function go(e: MouseEvent, id: string): void {
    // No hash change: the app may route by the hash.
    e.preventDefault();
    current = id;
    pinnedUntil = performance.now() + 1000;
    document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

{#snippet fileLine()}
  <p class="file">This page writes <span class="mono">{schema.file}</span> and keeps its comments. Only changed settings are written.</p>
{/snippet}

{#snippet resetButton()}
  <button type="button" class="btn" data-testid="reset-defaults" onclick={reset}>Reset to defaults</button>
  {#if status}<span class="status">{@render status()}</span>{/if}
{/snippet}

<div class="settings" data-testid="settings">
  <div class="page">
    <header>
      <div class="title">
        <a class="back" data-testid="settings-back" href={back.href}>{back.label}</a>
        <h1>Settings</h1>
      </div>
      <div class="seg" role="group" aria-label="App">
        <button type="button" class="on" aria-pressed="true">{apps.current}</button>
        <a href={apps.other.href}>{apps.other.label} ↗</a>
      </div>
    </header>

    {#if note}
      <div class="note" data-testid="settings-note" role="status">{note}</div>
    {/if}

    {#if editing}
      <section class="card" id="settings-{CONFIG_ID}">
        <h2>config.yaml</h2>
        {@render fileLine()}
        {#key resets}
          <TextEditor {schema} {text} {onwrite} ondone={() => (editing = false)} actions={resetButton} />
        {/key}
      </section>
    {:else}
      <div class="layout">
        <nav class="nav" data-testid="settings-nav" aria-label="Sections">
          {#each navItems as n (n.id)}
            <a href="#settings-{n.id}" class:on={current === n.id} aria-current={current === n.id ? 'true' : undefined} onclick={(e) => go(e, n.id)}>{n.title}</a>
          {/each}
        </nav>

        <div class="cards">
          {#each schema.sections as section (section.id)}
            <section
              class="card"
              class:accented={section.accent !== undefined}
              id="settings-{section.id}"
              data-testid="settings-section-{section.id}"
              style:--section-accent={section.accent}
            >
              <h2>{section.title}</h2>
              {#each section.fields as field (fieldId(field))}
                {#if field.type === 'keys'}
                  <KeysCard
                    {field}
                    value={valueOf(read.values, field) as Record<string, string[]>}
                    write={(keys) => write(field, keys)}
                  />
                {:else}
                  <Field {field} value={valueOf(read.values, field)} write={(v) => write(field, v)} />
                {/if}
              {/each}
            </section>
          {/each}

          <section class="card" id="settings-{CONFIG_ID}" data-testid="settings-section-{CONFIG_ID}">
            <h2>config.yaml</h2>
            {@render fileLine()}
            <pre data-testid="config-text">{text}</pre>
            <div class="row">
              <button type="button" class="btn" data-testid="edit-as-text" onclick={() => (editing = true)}>Edit as text</button>
              {@render resetButton()}
            </div>
          </section>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .settings { box-sizing: border-box; min-height: 100%; background: var(--bg); color: var(--ink); font-family: var(--sans); padding: 28px 16px; }
  .page { max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 18px; }
  a { color: var(--accent); }

  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .title { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .back { font-size: 13px; text-decoration: none; }
  .back:hover { text-decoration: underline; }
  h1 { margin: 0; font-size: 22px; font-weight: 600; }

  .seg { display: flex; gap: 2px; background: var(--chip); border-radius: 8px; padding: 3px; }
  .seg > * { border: 0; background: transparent; border-radius: 6px; padding: 5px 10px; font-family: var(--sans); font-size: 12.5px; color: var(--muted); text-decoration: none; line-height: normal; }
  .seg > a:hover { color: var(--ink); }
  .seg > .on { background: var(--surface); color: var(--ink); font-weight: 500; box-shadow: var(--seg-shadow, 0 1px 2px rgba(16, 22, 34, .08)); cursor: default; }

  .note { font-size: 13px; color: var(--ink); background: var(--sel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }

  .layout { display: grid; grid-template-columns: minmax(150px, 200px) minmax(0, 1fr); gap: 20px; align-items: start; }
  .nav { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 2px; }
  .nav a { font-size: 13.5px; color: var(--muted); text-decoration: none; padding: 6px 10px; border-radius: 6px; }
  .nav a:hover { color: var(--ink); }
  .nav a.on { background: var(--sel); color: var(--ink); font-weight: 500; }
  .cards { min-width: 0; display: flex; flex-direction: column; gap: 16px; }
  @media (max-width: 640px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .nav { display: none; }
  }

  .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 2px; scroll-margin-top: 16px; min-width: 0; }
  .card.accented { border-color: color-mix(in srgb, var(--section-accent) 30%, var(--line)); }
  h2 { margin: 0 0 8px; font-size: 13px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .accented h2 { color: var(--section-accent); }

  .file { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
  .mono { font-family: var(--mono); }
  pre { margin: 0; background: var(--bg); border: 1px solid var(--chip); border-radius: 8px; padding: 12px 14px; font-family: var(--mono); font-size: 12.5px; line-height: 1.55; color: var(--ink); overflow-x: auto; white-space: pre; }
  .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .btn { font-family: var(--sans); font-size: 12.5px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 7px; padding: 7px 11px; cursor: pointer; }
  .btn:hover { border-color: var(--muted); }
  .status { font-size: 12px; }
</style>
