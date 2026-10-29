<script lang="ts">
  import type { TimeStore } from '../lib/store.svelte.ts';
  import { viewOf, VIEWS } from '../lib/views.ts';
  import type { View } from '../lib/views.ts';
  import Calendar from './Calendar.svelte';
  import Charts from './Charts.svelte';
  import FixList from './FixList.svelte';
  import Hours from './Hours.svelte';
  import Notices from './Notices.svelte';
  import Projects from './Projects.svelte';
  import Report from './Report.svelte';
  import Settings from './Settings.svelte';

  /** The signed-in app: a status line, the navigation (a side bar on a computer, a bottom bar on a phone) and one view. */
  let { store }: { store: TimeStore } = $props();
  /** The Calendar view is the demo's only. */
  const views = VIEWS.filter((v) => v.id !== 'calendar' || store.calendarView);
  const shown = (v: View): View => (views.some((x) => x.id === v) ? v : 'hours');
  let view = $state<View>(shown(viewOf(location.hash)));

  function onHash() {
    view = shown(viewOf(location.hash));
    window.scrollTo(0, 0);
  }

  const status = $derived.by(() => {
    const fix = store.fixCount === 1 ? '1 to fix' : `${store.fixCount} to fix`;
    switch (store.sync) {
      case 'syncing':
        return 'Syncing…';
      case 'offline':
        return `Offline · ${fix}`;
      case 'signin':
        return 'Sign in again to sync';
      case 'storage':
        return `Sign in again to reach ${store.storageName} · ${fix}`;
      case 'folder':
        return `Allow access to ${store.storageName} to sync · ${fix}`;
      case 'failed':
        return `Sync failed: ${store.error ?? 'unknown error'}`;
      default:
        return `Synced ${store.syncedAt ? new Date(store.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} · ${fix}`;
    }
  });
</script>

<svelte:window onhashchange={onHash} />

<div class="shell">
  <nav aria-label="Views">
    {#each views as v (v.id)}
      <a href="#/{v.id}" aria-current={view === v.id ? 'page' : undefined} aria-label={v.id === 'fix' && store.fixCount > 0 ? `${v.label}, ${store.fixCount} to fix` : v.label}>
        <span class="long">{v.label}</span><span class="short" aria-hidden="true">{v.short}</span>{#if v.id === 'fix' && store.fixCount > 0}<span class="badge" aria-hidden="true">{store.fixCount}</span>{/if}
      </a>
    {/each}
  </nav>
  <div class="content">
    <section class="card status">
      <p>
        <span data-testid="status" role="status">{status}</span>
        {#if store.fixCount > 0 && view !== 'fix'}<a href="#/fix" class="fix">Open the fix list</a>{/if}
      </p>
      <button class="secondary" disabled={store.sync === 'syncing'} onclick={() => store.syncNow()}>Sync now</button>
    </section>
    <Notices {store} />
    {#if view === 'hours'}<Hours {store} />
    {:else if view === 'charts'}<Charts {store} />
    {:else if view === 'fix'}<FixList {store} />
    {:else if view === 'projects'}<Projects {store} />
    {:else if view === 'report'}<Report {store} />
    {:else if view === 'calendar'}<Calendar {store} />
    {:else}<Settings {store} />{/if}
  </div>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 170px 1fr;
    gap: 24px;
    align-items: start;
  }
  nav {
    position: sticky;
    top: 24px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  nav a {
    color: var(--ink);
    text-decoration: none;
    padding: 9px 12px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  nav a[aria-current='page'] {
    background: var(--surface);
    box-shadow: var(--shadow);
    font-weight: 600;
  }
  .short {
    display: none;
  }
  .badge {
    background: var(--danger);
    color: #fff;
    border-radius: 999px;
    font-size: 12px;
    padding: 0 7px;
    margin-left: 6px;
  }
  .content {
    min-width: 0;
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .status p {
    margin: 0;
  }
  .fix {
    color: var(--accent);
    margin-left: 6px;
    white-space: nowrap;
  }
  @media (max-width: 719.98px) {
    .shell {
      display: block;
      padding-bottom: 64px;
    }
    nav {
      position: fixed;
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
      flex-direction: row;
      overflow-x: auto;
      background: var(--surface);
      border-top: 1px solid var(--line);
      padding: 6px 6px calc(6px + env(safe-area-inset-bottom, 0px));
    }
    /* In the one Omark app, just above its tab bar (whose height, safe area included, it sets as --part-tabs-bar). */
    :global(html.part-tabs) nav {
      bottom: var(--part-tabs-bar, 0px);
      padding-bottom: 6px;
    }
    nav a {
      flex: 1 1 0;
      min-width: 0;
      justify-content: center;
      font-size: 13px;
      padding: 8px 2px;
    }
    .long {
      display: none;
    }
    .short {
      display: inline;
    }
    .badge {
      margin-left: 3px;
      padding: 0 5px;
    }
    nav a[aria-current='page'] {
      box-shadow: none;
      background: var(--chip);
    }
  }
</style>
