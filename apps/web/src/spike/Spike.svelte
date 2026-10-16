<script lang="ts">
  import { createAuth, OneDriveAdapter } from '@taskapp/storage';
  import { MSAL_CLIENT_ID, ONEDRIVE_FOLDER } from '../env';

  const configured = MSAL_CLIENT_ID !== '';
  let signedIn = $state(false);
  let text = $state('');
  let etag = $state<string | null>(null);
  let error = $state('');

  const auth = configured
    ? createAuth({ clientId: MSAL_CLIENT_ID, redirectUri: window.location.origin + '/' })
    : null;
  const adapter = auth
    ? new OneDriveAdapter({ folder: ONEDRIVE_FOLDER, getToken: () => auth.getToken() })
    : null;

  const fail = (e: unknown) => (error = e instanceof Error ? `${e.name}: ${e.message}` : String(e));

  async function load() {
    if (!adapter) return;
    try {
      const file = await adapter.read('tasks.md');
      text = file?.text ?? '';
      etag = file?.etag ?? null;
      error = '';
    } catch (e) {
      fail(e);
    }
  }

  async function save() {
    if (!adapter) return;
    try {
      etag = (await adapter.write('tasks.md', text, etag)).etag;
      error = '';
    } catch (e) {
      fail(e);
    }
  }

  async function start() {
    if (!auth) return;
    try {
      await auth.handleRedirect();
      signedIn = auth.isSignedIn();
      if (signedIn) await load();
    } catch (e) {
      fail(e);
    }
  }

  $effect(() => {
    void start();
  });
</script>

<main>
  <h1>TaskApp spike</h1>
  {#if !configured}
    <p data-testid="spike-not-configured">Not configured: set VITE_MSAL_CLIENT_ID to try sign-in.</p>
  {:else if !signedIn}
    <button onclick={() => auth!.signIn().catch(fail)}>Sign in</button>
  {:else}
    <textarea rows="12" cols="48" bind:value={text}></textarea>
    <p><button onclick={save}>Save</button> <button onclick={load}>Reload</button></p>
  {/if}
  <p>eTag: {etag ?? '(none)'}</p>
  <p>Last error: {error || '(none)'}</p>
</main>
