import type { Command, Shortcuts } from '@taskapp/core';

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  /** True for auto-repeat while the key is held. */
  repeat?: boolean;
  /** True for input, textarea, select, contenteditable and any open sheet. */
  typing: boolean;
}

/**
 * The command a key press stands for, or null to leave it to the browser. Nothing fires while typing (so
 * letters type and Ctrl+Z is the field's own text undo). Ctrl/Cmd only ever means undo.
 */
export function commandFor(e: KeyInput, shortcuts: Shortcuts): Command | null {
  if (e.typing || e.altKey) return null;
  const chord = e.ctrlKey || e.metaKey;
  if (chord) {
    if (e.shiftKey || e.repeat) return null;
    return e.key.toLowerCase() === 'z' && shortcuts.undo.some((k) => k.toLowerCase() === 'z') ? 'undo' : null;
  }
  // With Caps Lock on a letter arrives uppercase; without Shift held that is still the lowercase shortcut.
  const keys = [e.key];
  if (!e.shiftKey && e.key.length === 1 && e.key !== e.key.toLowerCase()) keys.push(e.key.toLowerCase());
  for (const key of keys) {
    for (const [command, bound] of Object.entries(shortcuts) as [Command, string[]][]) {
      if (!bound.includes(key)) continue;
      // Holding a key repeats it; only moving the selection should.
      if (e.repeat && command !== 'up' && command !== 'down') return null;
      return command;
    }
  }
  return null;
}

/** True when the event target is somewhere text is typed. */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** True while a bottom sheet or modal dialog is open (sheets arrive in a later task). */
export function sheetOpen(): boolean {
  return document.querySelector('[data-testid="sheet"], dialog[open]') !== null;
}
