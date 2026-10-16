import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@taskapp/core';
import type { Shortcuts } from '@taskapp/core';
import { commandFor } from './keys.ts';

const sc = DEFAULT_CONFIG.shortcuts;
const ev = (key: string, over: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; typing: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  typing: false,
  ...over,
});

describe('commandFor', () => {
  it('maps j to down and ArrowUp to up', () => {
    expect(commandFor(ev('j'), sc)).toBe('down');
    expect(commandFor(ev('ArrowUp'), sc)).toBe('up');
  });

  it('ignores everything while typing', () => {
    expect(commandFor(ev('j', { typing: true }), sc)).toBeNull();
  });

  it('maps Ctrl+z (and Cmd+z) to undo, but not while typing', () => {
    expect(commandFor(ev('z', { ctrlKey: true }), sc)).toBe('undo');
    expect(commandFor(ev('z', { metaKey: true }), sc)).toBe('undo');
    expect(commandFor(ev('z', { ctrlKey: true, typing: true }), sc)).toBeNull();
  });

  it('ignores Alt combinations and other Ctrl combinations', () => {
    expect(commandFor(ev('x', { altKey: true }), sc)).toBeNull();
    expect(commandFor(ev('x', { ctrlKey: true }), sc)).toBeNull();
  });

  it('follows the configured shortcuts', () => {
    const custom: Shortcuts = { ...sc, complete: ['c'] };
    expect(commandFor(ev('c'), custom)).toBe('complete');
    expect(commandFor(ev('x'), custom)).toBeNull();
  });
});
