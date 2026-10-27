import type { StorageProvider } from './environment.ts';

/** Where this device keeps its tasks: an account's storage, or a folder picked on this computer. */
export type StorageChoice = StorageProvider | 'folder';

const CHOICES: readonly string[] = ['microsoft', 'google', 'folder'] satisfies StorageChoice[];

/** The localStorage key of this device's choice. */
export const CHOICE_KEY = 'taskapp:storage';

type ChoiceStore = () => Pick<Storage, 'getItem' | 'setItem'>;
const local: ChoiceStore = () => localStorage;

/** This device's choice, or null when none is saved (or storage is blocked, or the value is unknown). */
export function loadChoice(storage: ChoiceStore = local): StorageChoice | null {
  try {
    const value = storage().getItem(CHOICE_KEY);
    return value !== null && CHOICES.includes(value) ? (value as StorageChoice) : null;
  } catch {
    return null;
  }
}

/** Saves this device's choice. With storage blocked it is not kept, and start-up asks again next time. */
export function saveChoice(choice: StorageChoice, storage: ChoiceStore = local): void {
  try {
    storage().setItem(CHOICE_KEY, choice);
  } catch {
    // Blocked: the next start decides from the session and the saved folder again.
  }
}

/**
 * What start-up opens: a storage (`save`: keep it as the choice, as none was saved yet), or the first-run
 * screen (`remembered`: the choice it could not open, offered first).
 */
export type Start = { open: StorageChoice; save: boolean } | { open: 'choose'; remembered: StorageChoice | null };

/**
 * Decides from the device's `choice`, the account signed in (`signedIn`) and whether a folder is saved.
 * With no choice yet (every device before the first-run screen existed), what is there opens: the folder,
 * else the account. A choice opens only that storage; when it can't (signed out, signed in with the other
 * provider, the folder gone), the first-run screen shows with it first.
 */
export function decideStart({
  choice,
  signedIn,
  folder,
}: {
  choice: StorageChoice | null;
  signedIn: StorageProvider | null;
  folder: boolean;
}): Start {
  if (choice === null) {
    if (folder) return { open: 'folder', save: true };
    if (signedIn) return { open: signedIn, save: true };
    return { open: 'choose', remembered: null };
  }
  const available = choice === 'folder' ? folder : signedIn === choice;
  return available ? { open: choice, save: false } : { open: 'choose', remembered: choice };
}
