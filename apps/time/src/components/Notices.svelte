<script lang="ts">
  import type { TimeStore } from '../lib/store.svelte.ts';

  /** What needs the user's attention, on every view: from #57's home, moved here. */
  let { store }: { store: TimeStore } = $props();
</script>

{#if store.sync === 'folder'}
  <section class="card" role="alert">
    <h2>Allow access to {store.storageName}</h2>
    <p>
      {store.folderRefused
        ? `Access to ${store.storageName} was refused. Allow it, or pick the folder again.`
        : 'Your browser asks again before Omark Time may read and write the folder. If you moved or renamed it, pick it again.'}
    </p>
    <div class="row">
      <button class="primary" onclick={() => store.allowFolder()}>Allow access</button>
      {#if !store.embedded}<button class="secondary" onclick={() => store.pickFolderAgain()}>Pick the folder again</button>{/if}
    </div>
  </section>
{:else if store.sync === 'offline' && store.storage === 'local-folder' && !store.embedded}
  <p class="card" role="status" data-testid="folder-again">
    If {store.storageName} was moved or renamed, pick it again.
    <button class="secondary" onclick={() => store.pickFolderAgain()}>Pick the folder again</button>
  </p>
{/if}

{#if store.signOutPending}
  <section class="card" role="alert">
    <h2>Some changes are not saved yet</h2>
    <p>A settings change has not reached your storage yet. Signing out now drops it from this device.</p>
    <div class="row">
      <button class="primary" onclick={() => store.syncNow()}>Sync now</button>
      <button class="secondary" onclick={() => store.signOut({ anyway: true })}>Sign out anyway</button>
    </div>
  </section>
{/if}

{#if store.sync === 'signin'}
  <section class="card" role="alert">
    <p>Your Google sign-in has lapsed.</p>
    <button class="primary" onclick={() => store.signIn()}>Sign in with Google</button>
  </section>
{/if}

{#if store.colour === 'needs-edit'}
  <section class="card" role="alert">
    <h2>Colouring needs edit access</h2>
    <p>This device's Google sign-in can only read your calendar. Give Omark Time edit access to colour your events here.</p>
    <button class="primary" onclick={() => store.giveEditAccess()}>Give edit access</button>
  </section>
{/if}

{#if store.clearOffer !== null}
  <section class="card" role="alert">
    <h2>Clear the colours Omark Time set?</h2>
    <p>{store.clearOffer} {store.clearOffer === 1 ? 'event has' : 'events have'} a colour Omark Time set. Colours you set yourself stay.</p>
    <div class="row">
      <button class="primary" onclick={() => store.answerClear(true)}>Clear them</button>
      <button class="secondary" onclick={() => store.answerClear(false)}>Keep them</button>
    </div>
  </section>
{/if}

{#if store.colour === 'running'}
  <p class="card muted" data-testid="colouring" role="status">Colouring events… {store.colourLeft > 0 ? `${store.colourLeft} left` : ''}</p>
{/if}

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
</style>
