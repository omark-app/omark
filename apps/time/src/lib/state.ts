import { createStore, del, get, set } from 'idb-keyval';
import type { UseStore } from 'idb-keyval';
import type { ColourPatch } from '@omark/time-core';

/** One colour patch still to send; `at` (the event's start, ms) orders the queue newest first. */
export interface ColourJob {
  calendarId: string;
  eventId: string;
  patch: ColourPatch;
  at: number;
}

/** What this device keeps for itself (spec 7.4); never written to the shared folder. */
export interface DeviceState {
  /** Sync token per calendar id. */
  tokens: Record<string, string>;
  /** `today` at the last sync, to find the days that entered the window since. */
  lastToday: string | null;
  /** The known codes at the last sync, sorted; null before the first. */
  knownCodes: string[] | null;
  /** The primary calendar's time zone, read once. */
  timeZone: string | null;
  /** Patches still to send, newest event first; saved before the first is sent, trimmed after each. */
  colourQueue: ColourJob[];
  /** The whole window has been planned for colouring since colouring was turned on. */
  colourPlanned: boolean;
  /** Patches that take the tracker's colours off, after colouring was turned off and the user said so. */
  clearQueue: ColourJob[];
}

export const freshState = (): DeviceState => ({
  tokens: {},
  lastToday: null,
  knownCodes: null,
  timeZone: null,
  colourQueue: [],
  colourPlanned: false,
  clearQueue: [],
});

export interface StateStore {
  load(): Promise<DeviceState>;
  save(state: DeviceState): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryState implements StateStore {
  private state = freshState();

  async load(): Promise<DeviceState> {
    return structuredClone(this.state);
  }

  async save(state: DeviceState): Promise<void> {
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.state = freshState();
  }
}

/** In IndexedDB, one record per storage place, so switching storage starts that place's own sync. */
export class IdbState implements StateStore {
  private readonly store: UseStore;

  constructor(
    private readonly key: string,
    store?: UseStore,
  ) {
    this.store = store ?? createStore('omark-time-state', 'state');
  }

  async load(): Promise<DeviceState> {
    return { ...freshState(), ...((await get<DeviceState>(this.key, this.store)) ?? {}) };
  }

  async save(state: DeviceState): Promise<void> {
    await set(this.key, state, this.store);
  }

  async clear(): Promise<void> {
    await del(this.key, this.store);
  }
}
