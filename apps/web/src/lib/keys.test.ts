import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@omark/core';
import type { Shortcuts } from '@omark/core';
import { commandFor } from './keys.ts';

const sc = DEFAULT_CONFIG.shortcuts;
const ev = (key: string, over: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; repeat: boolean; typing: boolean }> = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  typing: false,
  ...over,
});

describe('commandFor', () => {
  it('maps m to tomorrow and i to important (#19)', () => {
    expect(commandFor(ev('m'), sc)).toBe('tomorrow');
    expect(commandFor(ev('i'), sc)).toBe('important');
  });

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

  it('ignores auto-repeat except for up and down', () => {
    expect(commandFor(ev('Delete', { repeat: true }), sc)).toBeNull();
    expect(commandFor(ev('x', { repeat: true }), sc)).toBeNull();
    expect(commandFor(ev('j', { repeat: true }), sc)).toBe('down');
    expect(commandFor(ev('ArrowUp', { repeat: true }), sc)).toBe('up');
  });

  it('does not treat Ctrl+Shift+Z as undo', () => {
    expect(commandFor(ev('Z', { ctrlKey: true, shiftKey: true }), sc)).toBeNull();
    expect(commandFor(ev('z', { ctrlKey: true, shiftKey: true }), sc)).toBeNull();
  });

  it('matches an uppercase letter (Caps Lock) to its lowercase shortcut, but not with Shift held', () => {
    expect(commandFor(ev('X'), sc)).toBe('complete');
    expect(commandFor(ev('X', { shiftKey: true }), sc)).toBeNull();
  });

  it('maps f and Ctrl+K (and Cmd+K) to search, but not while typing', () => {
    expect(commandFor(ev('f'), sc)).toBe('search');
    expect(commandFor(ev('k', { ctrlKey: true }), sc)).toBe('search');
    expect(commandFor(ev('K', { metaKey: true }), sc)).toBe('search');
    expect(commandFor(ev('f', { typing: true }), sc)).toBeNull();
    expect(commandFor(ev('k', { ctrlKey: true, typing: true }), sc)).toBeNull();
  });

  it('ignores AltGr characters', () => {
    expect(commandFor(ev('ż', { ctrlKey: true, altKey: true }), sc)).toBeNull();
  });
});
