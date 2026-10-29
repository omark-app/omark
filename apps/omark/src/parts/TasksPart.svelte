<script lang="ts">
  import TasksApp from 'tasks/src/App.svelte';
  import { openGiven } from 'tasks/src/lib/boot.ts';
  import type { GivenPlace } from 'tasks/src/lib/boot.ts';
  import { part } from 'tasks/src/lib/part.svelte.ts';

  /** Omark Tasks as a part: unchanged, on the `tasks/` folder the shell opened. */
  let { place, active }: { place: GivenPlace; active: boolean } = $props();

  $effect(() => {
    part.active = active;
  });
</script>

<TasksApp start={() => openGiven(place)} />
