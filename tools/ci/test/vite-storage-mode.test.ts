import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import configFn from '../../../apps/tasks/vite.config.ts';

// The storage mode each build gets: production stays on OneDrive unless VITE_STORAGE says otherwise,
// and `vite` (dev) reads apps/tasks/.env.development, which picks the demo.
// (Vite's ConfigEnv and UserConfig, cut down: tools/ci does not depend on vite.)
type ConfigEnv = { mode: string; command: 'build' | 'serve' };
const config = configFn as unknown as (env: ConfigEnv) => { define?: Record<string, unknown> };
const storageOf = (env: ConfigEnv): unknown => config(env).define?.__STORAGE_MODE__;

describe('apps/tasks/vite.config.ts storage mode', () => {
  // Vite's loadEnv also reads the shell, so take VITE_STORAGE out for each test and put it back after.
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.VITE_STORAGE;
    delete process.env.VITE_STORAGE;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.VITE_STORAGE;
    else process.env.VITE_STORAGE = saved;
  });

  it('is onedrive for a production build with no VITE_STORAGE', () => {
    expect(storageOf({ mode: 'production', command: 'build' })).toBe('"onedrive"');
  });

  it('is demo in development (apps/tasks/.env.development)', () => {
    expect(storageOf({ mode: 'development', command: 'serve' })).toBe('"demo"');
  });

  it('follows VITE_STORAGE from the shell', () => {
    process.env.VITE_STORAGE = 'demo';
    expect(storageOf({ mode: 'production', command: 'build' })).toBe('"demo"');
  });
});
