<script lang="ts">
  import SettingsPage from '@omark/settings/SettingsPage.svelte';
  import { part as tasksPart } from 'tasks/src/lib/part.svelte.ts';
  import StatusLine from 'tasks/src/components/StatusLine.svelte';
  import TimeSettings from 'time/src/components/Settings.svelte';
  import type { Accounts } from './lib/places.ts';
  import { isAccount } from './lib/places.ts';
  import { registry } from './lib/registry.svelte.ts';
  import type { Shell } from './lib/shell.svelte.ts';
  import { PART_NAMES, PARTS } from './lib/suite.ts';

  /**
   * The one Settings page (one app spec, section 8; roadmap U.5): the Omark card (storage, parts, sign-ins,
   * sign-out), then each part that is on. Tasks' own form is the page itself when Tasks is on; Time's view is
   * a section of it.
   */
  let { shell, accounts }: { shell: Shell; accounts: Accounts } = $props();

  const PROVIDER_NAMES = { microsoft: 'Microsoft', google: 'Google' };
  const SIGN_OUT_QUESTION = 'Sign out of Omark on this device? Your files stay where they are.';
  const PENDING_QUESTION = "A change to the parts hasn't reached the Omark folder yet; signing out drops it. Sign out anyway?";

  const place = $derived(shell.place!);
  const tasks = $derived(shell.on.includes('tasks') ? tasksPart.settings : null);
  const time = $derived(shell.on.includes('time') ? registry.time : null);

  // Sign-in cookies aren't reactive: read them again after this page changes one.
  let signIns = $state(0);
  const calendar = $derived.by(() => {
    void signIns;
    const c = accounts.calendar(place.storage);
    const connected = c.auth.isSignedIn() && (c.access === null || c.auth.accesses().includes(c.access));
    return { ...c, connected };
  });

  let error = $state<string | null>(null);
  async function connect(): Promise<void> {
    const { auth, access } = calendar;
    try {
      await auth.signIn(undefined, access ? { add: access, returnTo: '/settings' } : { returnTo: '/settings' });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    signIns++;
  }

  async function disconnect(): Promise<void> {
    try {
      await calendar.auth.signOut();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    signIns++;
  }

  function signOut(): void {
    if (window.confirm(shell.pending ? PENDING_QUESTION : SIGN_OUT_QUESTION)) void shell.signOut();
  }

  const back = $derived({ label: '‹ Back', href: '/', onclick: (e: MouseEvent) => shell.leaveSettings(e) });
  const sections = $derived([
    { id: 'omark', title: 'Omark', body: omarkCard },
    ...(shell.on.includes('time') ? [{ id: 'time', title: 'Omark Time', body: timeCard }] : []),
    // Tasks is on but not open (still starting, or its start failed): the Omark card stays in reach.
    ...(shell.on.includes('tasks') && !tasks ? [{ id: 'tasks', title: 'Omark Tasks', body: tasksWaiting }] : []),
  ]);
  const LINES: Record<string, string> = {
    tasks: 'Today, this week and later, with habits.',
    time: 'Your Google Calendar as hours per project.',
    goals: 'Life areas, their vision and dated goals.',
  };
</script>

{#snippet omarkCard()}
  <p>Your files are in <strong>{place.storageName}</strong>, in the Omark folder.</p>
  <button type="button" class="btn" onclick={() => void shell.changeStorage()}>Change</button>

  <h3>Parts</h3>
  <div class="parts">
    {#each PARTS as p (p)}
      {@const on = shell.on.includes(p)}
      <label class="part">
        <input
          type="checkbox"
          checked={on}
          disabled={on && shell.on.length === 1}
          onchange={(e) => void (e.currentTarget.checked ? shell.turnOn(p, { open: false }) : shell.turnOff(p))}
        />
        <span><strong>Omark {PART_NAMES[p]}</strong><small>{LINES[p]}</small></span>
      </label>
    {/each}
  </div>
  {#if shell.pending}<p class="muted" role="status">Saved on this device. The Omark folder gets it once it can be reached.</p>{/if}

  <h3>Sign-ins</h3>
  {#if isAccount(place.storage)}
    <p>{PROVIDER_NAMES[place.storage]}, for {place.storageName}.</p>
  {:else}
    <p>{place.storageName} needs no sign-in.</p>
  {/if}
  {#if shell.on.includes('time')}
    {#if calendar.connected}
      <p>Google Calendar, for Omark Time{calendar.access ? ', in the same Google sign-in' : ''}.</p>
      {#if calendar.access === null}
        <button type="button" class="btn" onclick={() => void disconnect()}>Disconnect</button>
      {/if}
    {:else}
      <button type="button" class="btn" onclick={() => void connect()}>Connect Google Calendar</button>
    {/if}
  {/if}

  {#if error || shell.error}<p class="error" role="alert">{error ?? shell.error}</p>{/if}

  <h3>This device</h3>
  <button type="button" class="btn" onclick={signOut}>Sign out</button>
{/snippet}

{#snippet tasksWaiting()}
  <p class="muted">Omark Tasks' settings show here once it opens.</p>
{/snippet}

{#snippet timeCard()}
  {#if time && time.phase === 'ready'}
    <div class="omark-time in-page"><TimeSettings store={time} inPage /></div>
  {:else}
    <p class="muted">Omark Time's settings show here once it is set up in its tab.</p>
  {/if}
{/snippet}

{#snippet status()}{#if tasks}<StatusLine status={tasks.status} settingsLink={false} demoControls={false} />{/if}{/snippet}

<div class="settings-view">
  {#if tasks}
    <SettingsPage
      schema={tasks.schema}
      text={tasks.text}
      onwrite={(text) => tasks.write(text)}
      {back}
      note={tasks.note}
      defaultText={tasks.defaultText}
      extraSections={sections}
      {status}
    />
  {:else}
    <!-- Tasks is off or not open: the same cards, without Tasks' form and its config.yaml. -->
    <div class="plain">
      <a class="back" data-testid="settings-back" href={back.href} onclick={back.onclick}>{back.label}</a>
      <h1>Settings</h1>
      {#each sections as s (s.id)}
        <section class="card" id="settings-{s.id}" data-testid="settings-section-{s.id}">
          <h2>{s.title}</h2>
          {@render s.body()}
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .settings-view { font-family: var(--sans); color: var(--ink); }
  h3 { margin: 18px 0 6px; font-size: 14px; font-weight: 600; }
  .parts { display: grid; gap: 8px; }
  .part { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
  .part span { display: grid; gap: 2px; }
  .part small, .muted { color: var(--muted); }
  .btn { padding: 7px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 500 14px var(--sans); cursor: pointer; }
  .error { color: var(--danger); }
  .plain { max-width: 44rem; margin: 0 auto; padding: 24px 16px 48px; }
  .plain .card { background: var(--surface); border-radius: 14px; box-shadow: var(--shadow); padding: 20px; margin-top: 16px; }
  .plain .card h2 { margin: 0 0 8px; font-size: 17px; }
  .back { color: var(--muted); text-decoration: none; }
  /* Time's own cards inside this page's Time section: flat, the section is the card. */
  .in-page :global(.card) { box-shadow: none; padding: 0; margin: 0 0 16px; background: none; }
</style>
