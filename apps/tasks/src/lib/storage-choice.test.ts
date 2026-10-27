import { describe, expect, it } from 'vitest';
import { CHOICE_KEY, decideStart, loadChoice, saveChoice } from './storage-choice.ts';
import type { StorageChoice } from './storage-choice.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const blocked = (): Pick<Storage, 'getItem' | 'setItem'> => {
  throw new DOMException('blocked', 'SecurityError');
};

describe('loadChoice and saveChoice', () => {
  it('keep the choice in storage', () => {
    const s = memoryStorage();
    expect(loadChoice(() => s)).toBeNull();
    saveChoice('google', () => s);
    expect(s.map.get(CHOICE_KEY)).toBe('google');
    expect(loadChoice(() => s)).toBe('google');
  });

  it('read an unknown value as no choice', () => {
    const s = memoryStorage();
    s.map.set(CHOICE_KEY, 'dropbox');
    expect(loadChoice(() => s)).toBeNull();
  });

  it('read blocked storage as no choice, and saving to it does not throw', () => {
    expect(loadChoice(blocked)).toBeNull();
    expect(() => saveChoice('folder', blocked)).not.toThrow();
  });
});

describe('decideStart', () => {
  const choices: (StorageChoice | null)[] = [null, 'microsoft', 'google', 'folder'];
  const sessions: ('microsoft' | 'google' | null)[] = [null, 'microsoft', 'google'];

  it('with no choice yet, opens a saved folder, else the signed-in account, else asks', () => {
    expect(decideStart({ choice: null, signedIn: 'google', folder: true })).toEqual({ open: 'folder', save: true });
    expect(decideStart({ choice: null, signedIn: 'google', folder: false })).toEqual({ open: 'google', save: true });
    expect(decideStart({ choice: null, signedIn: 'microsoft', folder: false })).toEqual({ open: 'microsoft', save: true });
    expect(decideStart({ choice: null, signedIn: null, folder: false })).toEqual({ open: 'choose', remembered: null });
  });

  it('opens a remembered account only when signed in with it', () => {
    expect(decideStart({ choice: 'microsoft', signedIn: 'microsoft', folder: true })).toEqual({ open: 'microsoft', save: false });
    expect(decideStart({ choice: 'google', signedIn: 'google', folder: false })).toEqual({ open: 'google', save: false });
    expect(decideStart({ choice: 'microsoft', signedIn: 'google', folder: false })).toEqual({ open: 'choose', remembered: 'microsoft' });
    expect(decideStart({ choice: 'google', signedIn: null, folder: true })).toEqual({ open: 'choose', remembered: 'google' });
  });

  it('opens a remembered folder only when one is saved', () => {
    expect(decideStart({ choice: 'folder', signedIn: 'microsoft', folder: true })).toEqual({ open: 'folder', save: false });
    expect(decideStart({ choice: 'folder', signedIn: 'microsoft', folder: false })).toEqual({ open: 'choose', remembered: 'folder' });
  });

  it('never opens a storage other than the one chosen', () => {
    for (const choice of choices.filter((c) => c !== null)) {
      for (const signedIn of sessions) {
        for (const folder of [true, false]) {
          const start = decideStart({ choice, signedIn, folder });
          expect(start.open === 'choose' || start.open === choice).toBe(true);
        }
      }
    }
  });
});
