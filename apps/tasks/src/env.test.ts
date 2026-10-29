import { describe, expect, it } from 'vitest';
import { demoUrl, realUseUrl, storageMode } from './env.ts';

describe('storageMode', () => {
  it.each([
    ['demo', 'demo'],
    ['fake', 'fake'],
    ['onedrive', 'onedrive'],
    [undefined, 'onedrive'],
    ['', 'onedrive'],
    ['Demo', 'onedrive'],
    [true, 'onedrive'],
  ] as const)('%j is %s', (value, mode) => {
    expect(storageMode(value)).toBe(mode);
  });
});

describe('realUseUrl', () => {
  it('defaults to omark.app when unset or blank', () => {
    expect(realUseUrl(undefined)).toBe('https://omark.app');
    expect(realUseUrl('  ')).toBe('https://omark.app');
  });
  it('trims a set value', () => {
    expect(realUseUrl(' https://example.test/real ')).toBe('https://example.test/real');
  });
});

describe('demoUrl', () => {
  it('defaults to the public demo when unset or blank', () => {
    expect(demoUrl(undefined)).toBe('https://demo.omark.app/tasks');
    expect(demoUrl('  ')).toBe('https://demo.omark.app/tasks');
  });
  it('trims a set value', () => {
    expect(demoUrl(' https://demo.example.test ')).toBe('https://demo.example.test');
  });
});
