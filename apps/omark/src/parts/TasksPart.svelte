<script lang="ts">
  import TasksApp from 'tasks/src/App.svelte';
  import { openGiven } from 'tasks/src/lib/boot.ts';
  import type { GivenPlace } from 'tasks/src/lib/boot.ts';
  import { part } from 'tasks/src/lib/part.svelte.ts';

  /** Omark Tasks as a part: unchanged, on the `tasks/` folder the shell opened. */
  let { place, active, openSettings }: { place: GivenPlace; active: boolean; openSettings: () => void } = $props();

  // Tasks' gear and , open the one Settings page.
  // svelte-ignore state_referenced_locally
  part.openSettings = openSettings;

  $effect(() => {
    part.active = active;
  });
</script>

<TasksApp start={() => openGiven(place)} />
