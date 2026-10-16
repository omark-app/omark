import type { Command, Shortcuts } from '@taskapp/core';

export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
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
    return e.key.toLowerCase() === 'z' && shortcuts.undo.some((k) => k.toLowerCase() === 'z') ? 'undo' : null;
  }
  for (const [command, keys] of Object.entries(shortcuts) as [Command, string[]][]) {
    if (keys.includes(e.key)) return command;
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
