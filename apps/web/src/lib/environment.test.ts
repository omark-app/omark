import { describe, expect, it } from 'vitest';
import { envForHost, folderFor, lookFor } from './environment.ts';

describe('envForHost', () => {
  it.each([
    ['tasks.alipka.com', 'production'],
    ['TASKS.Alipka.COM', 'production'],
    ['tasks.alipka.com.', 'production'],
    ['tasks-staging.alipka.com', 'staging'],
    ['tasks-staging.alipka.com.', 'staging'],
    ['pr-15.taskapp-staging.pages.dev', 'preview'],
    ['taskapp-64g.pages.dev', 'preview'],
    ['tasks-staging.alipka.com.pages.dev', 'preview'],
    ['localhost', 'local'],
    ['127.0.0.1', 'local'],
    ['tasks.alipka.com.evil.example', 'local'],
    ['eviltasks.alipka.com', 'local'],
    ['staging.tasks.alipka.com', 'local'],
    ['pages.dev', 'local'],
    ['', 'local'],
  ] as const)('%j is %s', (host, env) => {
    expect(envForHost(host)).toBe(env);
  });
});

describe('folderFor', () => {
  it('staging always uses the staging folder', () => {
    expect(folderFor('staging', 'ALAI/TaskApp')).toBe('ALAI/TaskApp-staging');
    expect(folderFor('staging', 'ALAI/Other')).toBe('ALAI/TaskApp-staging');
  });
  it('production always uses the production folder', () => {
    expect(folderFor('production', 'ALAI/TaskApp-e2e')).toBe('ALAI/TaskApp');
  });
  it('local and preview follow the build', () => {
    expect(folderFor('local', 'ALAI/TaskApp-e2e')).toBe('ALAI/TaskApp-e2e');
    expect(folderFor('local', 'ALAI/TaskApp')).toBe('ALAI/TaskApp');
    expect(folderFor('preview', 'ALAI/TaskApp-e2e')).toBe('ALAI/TaskApp-e2e');
  });
  it('a preview never uses the production folder (the staging build on its pages.dev hosts)', () => {
    expect(folderFor('preview', 'ALAI/TaskApp')).toBe('ALAI/TaskApp-staging');
  });
});

describe('lookFor', () => {
  it('staging has its own name, colour, manifest and label', () => {
    expect(lookFor('staging')).toEqual({
      title: 'TaskApp Staging',
      themeColor: '#F6E7C8',
      manifest: '/manifest-staging.webmanifest',
      label: 'STAGING',
    });
  });
  it('previews only get a label', () => {
    expect(lookFor('preview')).toEqual({ title: null, themeColor: null, manifest: null, label: 'PREVIEW' });
  });
  it('production and local look as today', () => {
    const plain = { title: null, themeColor: null, manifest: null, label: null };
    expect(lookFor('production')).toEqual(plain);
    expect(lookFor('local')).toEqual(plain);
  });
});
