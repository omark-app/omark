import { expect, it } from 'vitest';
import { redirectFor } from './redirect.ts';

const at = (q: string) => redirectFor(`https://app.example/time${q}`);

it('leaves a calendar sign-in error for Time, and shows a storage one in the shell (U.4)', () => {
  expect(at('')).toBeNull();
  expect(at('?x=1')).toBeNull();
  expect(at('?signin_error=cancelled&provider=googlecal')).toBe('time');
  expect(at('?signin_error=expired&provider=googlecal')).toBe('time');
  expect(at('?signin_error=cancelled&provider=google&add=calendar')).toBe('time');
  expect(at('?signin_error=scope&provider=google&add=edit')).toBe('time');
  expect(at('?signin_error=scope&provider=google')).toBe('google');
  expect(at('?signin_error=failed&provider=microsoft')).toBe('microsoft');
  expect(at('?signin_error=expired')).toBe('microsoft');
  expect(at('?signin_error=failed&provider=toString')).toBe('microsoft');
});
