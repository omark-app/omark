<script lang="ts">
  import { DEFAULT_CONFIG_YAML, TASKS_SCHEMA } from '@omark/tasks-core';
  import type { DoneEntry, ISODate } from '@omark/tasks-core';
  import SettingsPage from '@omark/settings/SettingsPage.svelte';
  import { BRAND } from './brand.ts';
  import { boot } from './lib/boot.ts';
  import { part } from './lib/part.svelte.ts';
  import type { StorageChoice } from './lib/storage-choice.ts';
  import { conflictNote } from './lib/folder-note.ts';
  import type { BootResult } from './lib/boot.ts';
  import TaskListView from './components/TaskListView.svelte';
  import WeekBoardView from './components/WeekBoardView.svelte';
  import { createPhone } from './lib/commands.svelte.ts';
  import type { ShellCommand } from './lib/commands.svelte.ts';
  import Sheet from './components/Sheet.svelte';
  import DatePicker from './components/DatePicker.svelte';
  import RepeatPicker from './components/RepeatPicker.svelte';
  import AddSheet from './components/AddSheet.svelte';
  import EditSheet from './components/EditSheet.svelte';
  import MoveSheet from './components/MoveSheet.svelte';
  import Fab from './components/Fab.svelte';
  import FirstRun from './components/FirstRun.svelte';
  import StorageCard from './components/StorageCard.svelte';
  import SearchPanel from './components/SearchPanel.svelte';
  import DoneSheet from './components/DoneSheet.svelte';
  import StatusLine from './components/StatusLine.svelte';
  import { timeSettingsUrl } from './lib/other-app.ts';
  import HabitHistory from './components/HabitHistory.svelte';
  import { createSearch } from './lib/search.svelte.ts';
  import type { SearchResult } from './lib/search.svelte.ts';
  import { commandFor, keyInput } from './lib/keys.ts';
  import { mouseDragging } from './lib/drag/mouse-drag.ts';
  import { touchDragging } from './lib/drag/touch-drag.ts';

  /**
   * The open sheet. A drop on Later sets `suggested` and `beforeId`. Add, edit and move are phone sheets;
   * done shows a completed task found by search.
   */
  type OpenSheet =
    | { kind: 'date'; id: string; suggested?: ISODate; beforeId?: string }
    | { kind: 'repeat'; id: string; habit?: boolean }
    | { kind: 'add' }
    | { kind: 'edit'; id: string }
    | { kind: 'move'; id: string }
    | { kind: 'done'; entry: DoneEntry };

  let result = $state.raw<BootResult | null>(null);
  let error = $state<string | null>(null);
  let signInError = $state<string | null>(null);
  /** Sync clients' conflict copies in the picked folder. */
  let conflicts = $state<string[]>([]);
  /** The browser or the user refused access to the picked folder. */
  let folderRefused = $state(false);
  let sheet = $state<OpenSheet | null>(null);
  // Settings is its own page at #settings, so browser back leaves it.
  const loadedOnSettings = location.hash === '#settings';
  let onSettings = $state(loadedOnSettings);
  // A direct load of #settings has no list behind it, so its ‹ Tasks follows the link. The entry is
  // marked, so it is known when browser back or forward returns to it. Opened from the app (the gear,
  // `,`), ‹ Tasks goes back instead: a second entry would make browser back reopen Settings.
  const DIRECT = 'settingsLoadedDirect';
  if (loadedOnSettings) history.replaceState({ ...history.state, [DIRECT]: true }, '');
  let settingsDirect = $state(loadedOnSettings);
  /** The History of habits is open (a sheet on the phone, a dialog on desktop). */
  let historyOpen = $state(false);
  // Phones always get the Task list (whatever the view), with the + button.
  const phone = createPhone();
  const search = createSearch();

  const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

  /** How this Tasks starts: its own boot, or the one Omark app's, which hands it the storage it opened. */
  let { start = boot }: { start?: () => Promise<BootResult> } = $props();

  // Tasks boots once, with the start it was given.
  // svelte-ignore state_referenced_locally
  start().then(
    (r) => {
      result = r;
      if (r.kind === 'ready') r.updates.setBusy(busy);
      void checkConflicts();
    },
    (e: unknown) => {
      error = message(e);
    },
  );

  function openSheet(command: ShellCommand, id: string): void {
    if (command === 'pickDate') sheet = { kind: 'date', id };
    else if (command === 'repeat') sheet = { kind: 'repeat', id };
    else if (command === 'habitRepeat') sheet = { kind: 'repeat', id, habit: true };
    else if (command === 'move') sheet = { kind: 'move', id };
    // On desktop, edit means the detail's title field, which the view focuses itself.
    else if (command === 'edit' && phone.value) sheet = { kind: 'edit', id };
  }

  const closeSheet = (): void => {
    sheet = null;
  };

  function openDropDate(id: string, suggested: ISODate, beforeId: string | null): void {
    sheet = { kind: 'date', id, suggested, beforeId: beforeId ?? undefined };
  }

  function backToTasks(e: MouseEvent): void {
    e.preventDefault();
    history.back();
  }

  /** Settings replaces the views; whatever was open over them closes. */
  function onhashchange(): void {
    onSettings = location.hash === '#settings';
    if (!onSettings) return;
    settingsDirect = (history.state as Record<string, unknown> | null)?.[DIRECT] === true;
    window.scrollTo(0, 0);
    sheet = null;
    historyOpen = false;
    if (search.mode !== 'closed') search.close(false);
  }

  /**
   * `f` or Ctrl+K opens search and `,` opens Settings, anywhere but a field or an open sheet (the views
   * ignore both). Neither works on the Settings page or while search is open.
   */
  function onkeydown(e: KeyboardEvent): void {
    if (!part.active || result?.kind !== 'ready' || onSettings || search.mode === 'open') return;
    const command = commandFor(keyInput(e), result.store.config.shortcuts);
    if (command === 'search') {
      e.preventDefault();
      search.open();
    } else if (command === 'settings') {
      e.preventDefault();
      location.hash = 'settings';
    }
  }

  /** An open task shows in the desktop detail or the phone's edit sheet; a completed one in its own sheet. */
  function openResult(r: SearchResult): void {
    if (result?.kind !== 'ready') return;
    if (r.kind === 'done') {
      sheet = { kind: 'done', entry: r.entry };
      search.view(null);
    } else if (phone.value) {
      sheet = { kind: 'edit', id: r.id };
      search.view(null);
    } else {
      result.store.select(r.id);
      search.view(r.id);
    }
  }

  // Closing the opened result goes back to search. Selecting another task on desktop leaves search.
  $effect(() => {
    if (search.mode !== 'viewing' || result?.kind !== 'ready') return;
    const selectedId = result.store.selectedId;
    if (search.viewing === null) {
      if (sheet === null) search.back();
    } else if (selectedId === null) search.back();
    else if (selectedId !== search.viewing) search.close(false);
  });

  const loseEdits = (doing: string, storageName: string): string =>
    `You have changes that aren't saved to ${storageName} yet. ${doing} will lose them. Continue?`;

  const waitingEdits = (storageName: string): string =>
    `You have changes that aren't saved to ${storageName} yet. They stay on this device and are saved when you switch back. Switch anyway?`;

  /**
   * Pending edits go to the cache first; if some would still be lost (memory-only cache, or the cache write
   * failed), the user decides. False when they are not saved or the user says no. Edits in the cache stay
   * there through a sign-in redirect or a switch of storage, and are saved when that storage opens again;
   * `leaving` (switching to another storage) asks about those too, as they then wait out of sight.
   */
  async function editsKept(doing: string, leaving = false): Promise<boolean> {
    if (result?.kind !== 'ready') return true;
    try {
      await result.store.flush();
    } catch (e) {
      signInError = `Could not save your changes before ${doing.toLowerCase()}: ${message(e)}`;
      return false;
    }
    if (result.store.wouldLoseEdits()) return window.confirm(loseEdits(doing, result.storageName));
    return !leaving || !result.store.hasUnsyncedEdits() || window.confirm(waitingEdits(result.storageName));
  }

  /** Signs in again by redirect, which leaves the page, with the provider the open storage belongs to. */
  async function signIn(provider: string): Promise<void> {
    if (result?.kind !== 'ready' || !result.auth) return;
    signInError = null;
    if (!(await editsKept('Signing in again'))) return;
    try {
      await result.auth.signIn(provider);
    } catch (e) {
      signInError = `Sign-in failed: ${message(e)}`;
    }
  }

  /**
   * Keeps the tasks in `to` from now on, on this device (the first-run screen, Settings, Pick the folder
   * again): a reload, a sign-in redirect, or the folder picker first. `again`: the folder in use is picked
   * once more (it moved, or access was refused); its offline copy carries over. `pick`: show the folder
   * picker even when a folder is saved.
   */
  async function useStorage(to: StorageChoice, opts: { again?: boolean; pick?: boolean } = {}): Promise<void> {
    if (result === null || !result.storage) return;
    signInError = null;
    const same = result.kind === 'ready' && result.provider === to;
    if (!(await editsKept(opts.again ? 'Picking the folder again' : 'Switching storage', !same))) return;
    try {
      await result.storage.use(to, opts);
    } catch (e) {
      signInError = to === 'folder' ? `Could not open the folder: ${message(e)}` : `Sign-in failed: ${message(e)}`;
    }
  }

  /** The banner's Allow access: asks for the picked folder again (needs this click), then re-reads it. */
  async function allowFolder(): Promise<void> {
    if (result?.kind !== 'ready' || !result.folder) return;
    try {
      folderRefused = !(await result.folder.allow());
    } catch (e) {
      signInError = `Could not open the folder: ${message(e)}`;
    }
    void checkConflicts();
  }

  /** Looks for conflict copies in the picked folder: at start and when the app regains focus. */
  async function checkConflicts(): Promise<void> {
    if (result?.kind !== 'ready' || !result.folder) return;
    conflicts = await result.folder.conflicts();
  }

  /**
   * Something is in progress (a sheet, search, a drag, a focused field or a draft in the add field), so a
   * newer build waits instead of reloading the page under the user. Edits in the task detail need no
   * rule: the store commits them before it saves.
   */
  function busy(): boolean {
    const field = document.activeElement;
    const drafts = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-draft]');
    return (
      sheet !== null ||
      historyOpen ||
      search.mode === 'open' ||
      [...drafts].some((el) => el.value.trim() !== '') ||
      mouseDragging() ||
      touchDragging() ||
      (field instanceof HTMLElement && (field.matches('input, textarea, select') || field.isContentEditable))
    );
  }

  /** The footer's "New version · tap to update": edits are saved first, or the user agrees to lose them. */
  function update(): void {
    if (result?.kind !== 'ready') return;
    const storageName = result.storageName;
    void result.updates.updateNow(() => window.confirm(loseEdits('Updating now', storageName)));
  }

  // While the page reloads into a newer build it takes no input, so no edit can miss the reload.
  $effect(() => {
    const root = document.getElementById('app');
    if (root) root.inert = result?.kind === 'ready' && result.updates.applying;
  });

  // config.yaml's theme forces light or dark; `system` leaves it to the device (tokens.css).
  $effect(() => {
    const theme = result?.kind === 'ready' ? result.store.config.theme : 'system';
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  });
</script>

<svelte:window {onkeydown} {onhashchange} onfocus={() => void checkConflicts()} />

{#if error !== null}
  <div class="notice">
    <p role="alert">{BRAND.app} could not start: {error}</p>
    <!-- A fresh start re-runs sign-in from scratch (a stale redirect, a cache that failed to open). -->
    <button type="button" class="retry" onclick={() => window.location.reload()}>Try again</button>
  </div>
{:else if result === null}
  <p class="notice">Loading…</p>
{:else if result.kind === 'choose'}
  {@const remembered = result.remembered}
  <FirstRun
    options={result.options}
    {remembered}
    onchoose={(choice) => useStorage(choice, { pick: true })}
    error={signInError}
  />
{:else}
  {@const store = result.store}
  {@const provider = result.provider}
  {@const onSignIn = result.auth ? () => signIn(provider) : result.folder ? allowFolder : undefined}
  {@const reconnect = result.folder ? 'allow' : 'signin'}
  {@const folderNote = conflictNote(conflicts)}
  {@const storageName = result.storageName}
  {@const updates = result.updates}
  {#if signInError}<p class="signin-error" role="alert">{signInError}</p>{/if}
  {#if folderNote}<p class="folder-note" role="status" data-testid="folder-note">{folderNote}</p>{/if}
  <!-- A folder that was moved or renamed, or whose access was refused, is picked again from here. -->
  {#if result.folder && (folderRefused || store.status === 'offline')}
    <p class="folder-note" role="status" data-testid="folder-again">
      {folderRefused ? `Access to ${storageName} was refused.` : `If ${storageName} was moved or renamed, pick it again.`}
      <button type="button" class="again" onclick={() => useStorage('folder', { again: true })}>Pick the folder again</button>
    </p>
  {/if}
  {#if onSettings}
    {@const storage = result.storage}
    {#snippet storageCard()}
      {#if storage}<StorageCard current={provider} {storageName} {storage} onswitch={(to, pick) => useStorage(to, { pick })} />{/if}
    {/snippet}
    <div class="settings-page">
      <SettingsPage
        schema={TASKS_SCHEMA}
        text={store.configText}
        onwrite={(text) => store.writeConfig(text)}
        back={{ label: '‹ Tasks', href: '#', onclick: settingsDirect ? undefined : backToTasks }}
        apps={{ current: 'Omark Tasks', other: { label: 'Omark Time', href: timeSettingsUrl(location.host) } }}
        note={store.configNote}
        defaultText={DEFAULT_CONFIG_YAML}
        extraSections={storage ? [{ id: 'storage', title: 'Storage', body: storageCard }] : []}
      >
        {#snippet status()}<StatusLine status={store.status} {updates} onupdate={update} settingsLink={false} />{/snippet}
      </SettingsPage>
    </div>
  {:else}
    {#if store.view === 'board' && !phone.value}
      <WeekBoardView {store} onCommand={openSheet} onDropPickDate={openDropDate} {onSignIn} {storageName} {reconnect} onHistory={() => (historyOpen = true)} {updates} onUpdate={update} />
    {:else}
      <TaskListView
        {store}
        onCommand={openSheet}
        onDropPickDate={openDropDate}
        {onSignIn}
        {storageName}
        {reconnect}
        onSearch={() => search.open()}
        onHistory={() => (historyOpen = true)}
        {updates}
        onUpdate={update}
      />
    {/if}
    {#if historyOpen}<HabitHistory {store} variant={phone.value ? 'sheet' : 'dialog'} onclose={() => (historyOpen = false)} />{/if}
    {#if phone.value}<Fab onclick={() => (sheet = { kind: 'add' })} />{/if}
    {#if search.mode === 'open'}<SearchPanel {store} {search} onopen={openResult} />{/if}
    <!-- One sheet per kind, so a sheet opened from another (move → date) gets its own focus and backdrop guard. -->
    {#key sheet?.kind}
      <Sheet open={sheet !== null} onclose={closeSheet}>
        {#if sheet?.kind === 'date'}
          <DatePicker {store} taskId={sheet.id} suggested={sheet.suggested} beforeId={sheet.beforeId} onclose={closeSheet} />
        {:else if sheet?.kind === 'repeat'}
          <RepeatPicker {store} taskId={sheet.id} habit={sheet.habit} onclose={closeSheet} />
        {:else if sheet?.kind === 'add'}
          <AddSheet {store} onclose={closeSheet} />
        {:else if sheet?.kind === 'edit'}
          {@const id = sheet.id}
          <EditSheet {store} taskId={id} oncommand={(c) => openSheet(c, id)} onclose={closeSheet} />
        {:else if sheet?.kind === 'move'}
          {@const id = sheet.id}
          <MoveSheet {store} taskId={id} oncommand={(c) => openSheet(c, id)} onclose={closeSheet} />
        {:else if sheet?.kind === 'done'}
          <DoneSheet {store} entry={sheet.entry} onclose={closeSheet} />
        {/if}
      </Sheet>
    {/key}
  {/if}
{/if}

<style>
  .notice { max-width: 420px; margin: 20vh auto 0; font: 14px var(--mono); color: var(--muted); }
  .retry { border: 1px solid var(--line); background: var(--surface); border-radius: 8px; padding: 7px 14px; font: 500 14px var(--sans); cursor: pointer; }
  /* The page has its own padding: it takes over the app's side and top padding (the notch inset stays). */
  .settings-page { margin: -18px -16px 0; }
  .folder-note { max-width: 1160px; margin: 0 auto 12px; font: 12px/1.5 var(--mono); color: var(--ink); }
  .again { margin-left: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 8px; padding: 4px 11px; font: 500 13px var(--sans); cursor: pointer; }
  .signin-error { max-width: 1160px; margin: 0 auto 12px; font: 12px var(--mono); color: var(--danger); }
</style>
