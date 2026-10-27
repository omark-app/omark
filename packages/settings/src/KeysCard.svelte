<script lang="ts">
  import { tick } from 'svelte';
  import { capturedKey, captureKey, displayKey } from './edit.ts';
  import { fieldId } from './schema.ts';
  import type { KeysField } from './schema.ts';

  /**
   * The rows of a keys field: one per command, a chip per key. Click a chip, then press the new key.
   * `value` holds the keys each command has now; `write` saves the whole map and returns the reason when it can't.
   */
  let {
    field,
    value,
    write,
  }: {
    field: KeysField;
    value: Record<string, string[]>;
    write: (keys: Record<string, string[]>) => string | null;
  } = $props();

  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Fn', 'OS']);

  let armed: { cmd: string; index: number } | null = $state(null);
  let error: string | null = $state(null);
  let showAll = $state(false);
  let root: HTMLDivElement | undefined = $state();
  // A key bound by Space or Enter must not then click the chip it was pressed on.
  let swallowKeyup: string | null = null;

  const shown = $derived(showAll || field.visible === undefined ? field.commands : field.commands.slice(0, field.visible));
  const hidden = $derived(field.commands.length - shown.length);

  function arm(cmd: string, index: number): void {
    armed = { cmd, index };
    error = null;
  }

  function disarm(): void {
    armed = null;
    error = null;
  }

  const isArmed = (cmd: string, index: number): boolean => armed?.cmd === cmd && armed.index === index;

  // Capture on the window, before anything else sees the key, so the app's shortcuts don't fire.
  $effect(() => {
    if (!armed) return;
    const at = armed;
    const onkeydown = (e: KeyboardEvent): void => {
      if (MODIFIERS.has(e.key) || e.key === 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Also when the key is refused: Space or Enter must not click the armed chip and disarm it.
      swallowKeyup = e.key;
      const r = captureKey(field, value, at.cmd, at.index, capturedKey(e));
      const reason = 'error' in r ? r.error : write(r.keys);
      if (reason !== null) {
        error = reason;
        return;
      }
      disarm();
      // A "+" chip is replaced by the new key's chip; keep the focus on it.
      void tick().then(() => root?.querySelector<HTMLElement>(`[data-key-chip="${at.cmd}-${at.index}"]`)?.focus());
    };
    const onpointerdown = (e: PointerEvent): void => {
      const chip = (e.target as Element | null)?.closest?.('[data-key-chip]');
      if (chip?.getAttribute('data-key-chip') !== `${at.cmd}-${at.index}`) disarm();
    };
    window.addEventListener('keydown', onkeydown, true);
    window.addEventListener('pointerdown', onpointerdown, true);
    return () => {
      window.removeEventListener('keydown', onkeydown, true);
      window.removeEventListener('pointerdown', onpointerdown, true);
    };
  });

  $effect(() => {
    const onkeyup = (e: KeyboardEvent): void => {
      if (swallowKeyup === null) return;
      if (e.key === swallowKeyup) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      swallowKeyup = null;
    };
    window.addEventListener('keyup', onkeyup, true);
    return () => window.removeEventListener('keyup', onkeyup, true);
  });
</script>

{#snippet chip(cmd: string, label: string, index: number, key: string | null)}
  <button
    type="button"
    class="key"
    class:armed={isArmed(cmd, index)}
    class:empty={key === null}
    data-testid="key-{cmd}-{index}"
    data-key-chip="{cmd}-{index}"
    aria-pressed={isArmed(cmd, index)}
    aria-label="{label}: {isArmed(cmd, index) ? 'press a key' : key === null ? 'add a key' : displayKey(key)}"
    onclick={() => (isArmed(cmd, index) ? disarm() : arm(cmd, index))}
    onblur={() => { if (isArmed(cmd, index)) disarm(); }}
  >{isArmed(cmd, index) ? 'press a key' : key === null ? '+' : displayKey(key)}</button>
{/snippet}

<div class="keys" bind:this={root} data-testid="field-{fieldId(field)}" role="group" aria-label={field.label}>
  {#each shown as c (c.id)}
    {@const list = value[c.id] ?? []}
    <div class="f">
      <span>{c.label}</span>
      <span class="chips">
        {#each list as k, i (i)}
          {@render chip(c.id, c.label, i, k)}
        {:else}
          {@render chip(c.id, c.label, 0, null)}
        {/each}
      </span>
      {#if error && armed?.cmd === c.id}
        <!-- "`k` is already Up": the key between backticks shows as a key. -->
        <div class="error" data-testid="keys-error" role="alert">
          {#each error.split('`') as part, i (i)}{#if i % 2 === 1}<kbd>{displayKey(part)}</kbd>{:else}{part}{/if}{/each}
        </div>
      {/if}
    </div>
  {/each}
  {#if hidden > 0}
    <div class="f more" data-testid="keys-show-all">
      <span>{hidden} more · click a key, then press the new one</span>
      <button type="button" class="link" onclick={() => (showAll = true)}>Show all</button>
    </div>
  {/if}
</div>

<style>
  .keys { display: flex; flex-direction: column; }
  .f { display: flex; align-items: center; justify-content: space-between; gap: 6px 16px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--chip); font-size: 14px; }
  .f:last-child { border-bottom: 0; }
  .chips { display: inline-flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
  .key { font-family: var(--mono); font-size: 12px; line-height: 1.4; min-width: 26px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; padding: 2px 7px; background: var(--surface); color: var(--ink); cursor: pointer; }
  .key:hover { border-color: var(--muted); }
  .key.empty { color: var(--muted); border-style: dashed; border-bottom-width: 1px; }
  .key.armed { border-color: var(--accent); color: var(--accent); font-family: var(--sans); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent); }
  .more { color: var(--muted); font-size: 13px; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-size: 13px; color: var(--accent); cursor: pointer; }
  .link:hover { text-decoration: underline; }
  .error { flex-basis: 100%; font-size: 12px; color: var(--danger); text-align: right; }
  kbd { font-family: var(--mono); font-size: 11.5px; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; }
</style>
