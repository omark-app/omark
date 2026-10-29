import type { TimeStore } from 'time/src/lib/store.svelte.ts';

/**
 * What the parts publish for the one Settings page (U.5): Time's store once its part is open. Tasks publishes on
 * its own `part` (apps/tasks/src/lib/part.svelte.ts), which apps/tasks reads too.
 */
class Registry {
  time = $state.raw<TimeStore | null>(null);
}

export const registry = new Registry();
