import { expect } from '@playwright/test';

/**
 * expect.poll, checking every 100 ms. Playwright's default backs off to once a second, so a check that waits for
 * the 1 s save passed about 0.8 s late (#132). A spec's own intervals or timeout still win.
 */
export function poll<T>(fn: () => T | Promise<T>, options?: { message?: string; timeout?: number; intervals?: number[] }) {
  return expect.poll(fn, { intervals: [100], ...options });
}
