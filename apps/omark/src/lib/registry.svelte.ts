import type { TimeStore } from 'time/src/lib/store.svelte.ts';
import type { GoalsStore } from '../parts/goals/store.svelte.ts';

/**
 * What the parts publish for the one Settings page (U.5): Time's and Goals' stores once their part is open. Tasks publishes on
 * its own `part` (apps/tasks/src/lib/part.svelte.ts), which apps/tasks reads too.
 */
class Registry {
  time = $state.raw<TimeStore | null>(null);
  goals = $state.raw<GoalsStore | null>(null);
}

export const registry = new Registry();
