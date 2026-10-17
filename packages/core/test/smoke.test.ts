import { expect, test } from 'vitest';
import { VERSION } from '../src/index.ts';

test('exports VERSION', () => {
  expect(VERSION).toBe('0.1.0');
});
