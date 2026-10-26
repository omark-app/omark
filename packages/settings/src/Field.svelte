<script lang="ts">
  import { numberInput, writeOnInput } from './edit.ts';
  import { fieldId } from './schema.ts';
  import type { ChoiceField, NumberField, SetField } from './schema.ts';

  /**
   * One settings row: the label and hint on the left, the control on the right.
   * `write` saves a value and returns the reason when it can't.
   */
  let {
    field,
    value,
    write,
  }: {
    field: ChoiceField | NumberField | SetField;
    value: unknown;
    write: (value: unknown) => string | null;
  } = $props();

  const id = $derived(fieldId(field));
  const inputId = $derived(`setting-${id}`);
  let error: string | null = $state(null);

  function commit(next: unknown): boolean {
    error = write(next);
    return error === null;
  }

  // A choice with a few short options is a segmented control, a longer one a select.
  const segmented = $derived(field.type === 'choice' && (field.display ?? (field.options.length <= 3 ? 'segmented' : 'select')) === 'segmented');

  // Number fields: what is typed stays in the box while it is invalid; blur puts the file's value back.
  // While the box has focus it is the user's; a change from the file shows once it loses focus.
  let focused = $state(false);
  let draft = $state('');
  $effect(() => {
    const shown = String(value);
    if (!focused) draft = shown;
  });

  function ontype(e: Event & { currentTarget: HTMLInputElement }): void {
    draft = e.currentTarget.value;
    const r = numberInput(field as NumberField, draft);
    if ('error' in r) error = r.error;
    else if (writeOnInput(field, r.value, value)) commit(r.value);
    else error = null;
  }

  /** Writes a valid value that waited (the default, see writeOnInput). */
  function flush(): void {
    const r = numberInput(field as NumberField, draft);
    if ('value' in r && r.value !== value) commit(r.value);
  }

  function onblur(): void {
    flush();
    focused = false;
    error = null;
  }

  function toggle(option: string, on: boolean, box: HTMLInputElement): void {
    const list = (value as string[]) ?? [];
    const options = (field as SetField).options.map((o) => o.value);
    const next = options.filter((v) => (v === option ? on : list.includes(v)));
    if (!commit(next)) box.checked = !on;
  }
</script>

<div class="f" data-testid="field-{id}">
  {#if field.type === 'number'}
    <label class="name" for={inputId}>{field.label}{#if field.hint}<span class="hint">{field.hint}</span>{/if}</label>
  {:else}
    <span class="name" id="{inputId}-label">{field.label}{#if field.hint}<span class="hint">{field.hint}</span>{/if}</span>
  {/if}

  {#if field.type === 'choice' && segmented}
    <div class="seg" role="group" aria-labelledby="{inputId}-label">
      {#each field.options as o (o.value)}
        <button type="button" class:on={value === o.value} aria-pressed={value === o.value} onclick={() => commit(o.value)}>{o.label}</button>
      {/each}
    </div>
  {:else if field.type === 'choice'}
    <select aria-labelledby="{inputId}-label" value={value} onchange={(e) => { if (!commit(e.currentTarget.value)) e.currentTarget.value = String(value); }}>
      {#each field.options as o (o.value)}
        <option value={o.value}>{o.label}</option>
      {/each}
    </select>
  {:else if field.type === 'number'}
    <input
      id={inputId}
      class="num"
      class:bad={error !== null}
      type={field.percent ? 'text' : 'number'}
      inputmode={field.percent ? 'text' : field.integer ? 'numeric' : 'decimal'}
      min={field.percent ? undefined : field.min}
      max={field.percent ? undefined : field.max}
      step={field.percent ? undefined : field.integer ? 1 : 'any'}
      value={draft}
      aria-invalid={error !== null}
      aria-describedby={error ? `${inputId}-error` : undefined}
      oninput={ontype}
      onchange={flush}
      onfocus={() => (focused = true)}
      {onblur}
    />
  {:else}
    <div class="set" role="group" aria-labelledby="{inputId}-label">
      {#each field.options as o (o.value)}
        <label><input type="checkbox" checked={((value as string[]) ?? []).includes(o.value)} onchange={(e) => toggle(o.value, e.currentTarget.checked, e.currentTarget)} /> {o.label}</label>
      {/each}
    </div>
  {/if}

  {#if error}
    <div class="error" id="{inputId}-error" data-testid="field-error-{id}" role="alert">{error}</div>
  {/if}
</div>

<style>
  .f { display: flex; align-items: center; justify-content: space-between; gap: 6px 16px; flex-wrap: wrap; padding: 10px 0; border-bottom: 1px solid var(--chip); font-size: 14px; }
  .f:last-child { border-bottom: 0; }
  .name { min-width: 0; }
  .hint { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
  .seg { display: flex; gap: 2px; background: var(--chip); border-radius: 8px; padding: 3px; flex-wrap: wrap; }
  .seg button { border: 0; background: transparent; border-radius: 6px; padding: 5px 10px; font-family: var(--sans); font-size: 12.5px; color: var(--muted); cursor: pointer; }
  .seg button:hover { color: var(--ink); }
  .seg button.on { background: var(--surface); color: var(--ink); font-weight: 500; box-shadow: var(--seg-shadow, 0 1px 2px rgba(16, 22, 34, .08)); }
  select, .num { font-family: var(--sans); font-size: 13px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 8px; background: var(--surface); color: var(--ink); }
  .num { width: 64px; }
  .num.bad { border-color: var(--danger); }
  .set { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; }
  .set label { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .set input { accent-color: var(--accent); margin: 0; }
  .error { flex-basis: 100%; font-size: 12px; color: var(--danger); text-align: right; }
  /* 16px keeps iOS from zooming in on focus. */
  @media (max-width: 640px) {
    select, .num { font-size: 16px; }
  }
</style>
