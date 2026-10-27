import { describe, expect, it } from 'vitest';
import {
  cacheName,
  syncedAtKey,
  envForHost,
  folderStorageName,
  folderFor,
  googleFolderFor,
  hostConfig,
  legacyCacheApplies,
  lookFor,
  STORAGE_NAMES,
} from './environment.ts';

const CFG = hostConfig({
  VITE_PROD_HOST: 'tasks.example.test',
  VITE_STAGING_HOST: 'staging-tasks.example.test',
  VITE_PREVIEW_HOST_SUFFIXES: 'tasks-preview.pages.dev, other-preview.pages.dev',
  VITE_PROD_FOLDER: 'Prod/Tasks',
  VITE_STAGING_FOLDER: 'Prod/Tasks-staging',
});
const NONE = hostConfig({});

describe('hostConfig', () => {
  it('trims values, lower-cases hosts and drops empty suffixes', () => {
    expect(hostConfig({ VITE_PREVIEW_HOST_SUFFIXES: ' a.pages.dev,,B.pages.dev ' }).previewSuffixes).toEqual([
      'a.pages.dev',
      'b.pages.dev',
    ]);
    expect(hostConfig({ VITE_PROD_HOST: '  Tasks.Example.TEST ' }).prodHost).toBe('tasks.example.test');
  });
  it('treats missing and non-string values as unset', () => {
    expect(NONE).toEqual({ prodHost: '', stagingHost: '', previewSuffixes: [], prodFolder: '', stagingFolder: '' });
    expect(hostConfig({ VITE_PROD_HOST: true, VITE_PROD_FOLDER: 5 })).toEqual(NONE);
  });
});

describe('envForHost', () => {
  it.each([
    ['tasks.example.test', 'production'],
    ['TASKS.Example.TEST', 'production'],
    ['tasks.example.test.', 'production'],
    ['staging-tasks.example.test', 'staging'],
    ['tasks-preview.pages.dev', 'preview'],
    ['pr-15.tasks-preview.pages.dev', 'preview'],
    ['x.other-preview.pages.dev', 'preview'],
    ['unlisted.pages.dev', 'local'],
    ['pages.dev', 'local'],
    ['tasks.example.test.evil.example', 'local'],
    ['eviltasks.example.test', 'local'],
    ['staging.tasks.example.test', 'local'],
    ['localhost', 'local'],
    ['', 'local'],
  ] as const)('%j is %s', (host, env) => {
    expect(envForHost(host, CFG)).toBe(env);
  });
  it('with nothing configured every host is local', () => {
    expect(envForHost('tasks.example.test', NONE)).toBe('local');
  });
});

describe('folderFor', () => {
  it.each([
    ['production', 'Other', 'Prod/Tasks'],
    ['staging', 'Other', 'Prod/Tasks-staging'],
    ['local', 'Dev/Tasks', 'Dev/Tasks'],
    // a preview never gets the production folder (the staging build on its pages.dev hosts)
    ['preview', 'Prod/Tasks', 'Prod/Tasks-staging'],
  ] as const)('%s with build folder %j is %j', (env, build, folder) => {
    expect(folderFor(env, build, CFG)).toBe(folder);
  });
  it('with nothing configured the folder is empty', () => {
    expect(folderFor('production', '', NONE)).toBe('');
    expect(folderFor('local', '', NONE)).toBe('');
    expect(folderFor('preview', '', NONE)).toBe('');
  });
  it('a preview with no build folder gets the staging folder', () => {
    expect(folderFor('preview', '', CFG)).toBe('Prod/Tasks-staging');
  });
  // The one place the owner's values may appear in a test: proof that his deployment keeps its folder.
  // Roadmap item 3.7 deletes this test.
  it('the owner deployment keeps its folder', () => {
    const BRIDGE = hostConfig({
      VITE_PROD_HOST: 'tasks.alipka.com',
      VITE_STAGING_HOST: 'tasks-staging.alipka.com',
      VITE_PREVIEW_HOST_SUFFIXES: 'taskapp-staging.pages.dev,taskapp-64g.pages.dev',
      VITE_PROD_FOLDER: 'ALAI/TaskApp',
      VITE_STAGING_FOLDER: 'ALAI/TaskApp-staging',
    });
    expect(folderFor(envForHost('tasks.alipka.com', BRIDGE), '', BRIDGE)).toBe('ALAI/TaskApp');
    expect(folderFor(envForHost('taskapp-64g.pages.dev', BRIDGE), '', BRIDGE)).toBe('ALAI/TaskApp-staging');
  });
});

describe('googleFolderFor', () => {
  it.each([
    ['production', 'Other', 'Omark Tasks'],
    ['staging', 'Other', 'Omark Tasks Staging'],
    ['preview', 'Other', 'Other'],
    ['local', 'Other', 'Other'],
    ['preview', '', 'Omark Tasks Dev'],
    ['local', '', 'Omark Tasks Dev'],
  ] as const)('%s with build folder %j is %j', (env, build, folder) => {
    expect(googleFolderFor(env, build)).toBe(folder);
  });
});

describe('cacheName', () => {
  it('keeps the OneDrive name of today and gives Google Drive its own', () => {
    expect(cacheName('microsoft', 'Dev/Tasks')).toBe('taskapp:Dev/Tasks');
    expect(cacheName('google', 'Dev/Tasks')).toBe('taskapp:google:Dev/Tasks');
  });
  it('never shares a cache between the two storages for the same folder', () => {
    expect(cacheName('google', 'Omark Tasks')).not.toBe(cacheName('microsoft', 'Omark Tasks'));
  });
  it('names each storage', () => {
    expect(STORAGE_NAMES).toEqual({ microsoft: 'OneDrive', google: 'Google Drive' });
  });
});

describe('folder storage', () => {
  it('gives each picked folder its own cache and synced-at key', () => {
    expect(cacheName('folder', '6f1c')).toBe('taskapp:folder:6f1c');
    expect(syncedAtKey('folder', '6f1c')).toBe('taskapp:synced-at:folder:6f1c');
  });
  it('names the folder in the texts', () => {
    expect(folderStorageName('Tasks')).toBe('the folder Tasks');
  });
});

describe('syncedAtKey', () => {
  it('keeps the OneDrive key of today and gives Google Drive its own', () => {
    expect(syncedAtKey('microsoft', 'Dev/Tasks')).toBe('taskapp:synced-at:Dev/Tasks');
    expect(syncedAtKey('google', 'Dev/Tasks')).toBe('taskapp:synced-at:google:Dev/Tasks');
  });
});

describe('legacyCacheApplies', () => {
  it('only the production folder, and only when one is configured', () => {
    expect(legacyCacheApplies('Prod/Tasks', CFG)).toBe(true);
    expect(legacyCacheApplies('Prod/Tasks-staging', CFG)).toBe(false);
    expect(legacyCacheApplies('', NONE)).toBe(false);
  });
});

describe('lookFor', () => {
  it('staging has its own name, colour, manifest and label', () => {
    expect(lookFor('staging')).toEqual({
      title: 'Omark Tasks Staging',
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
  it('a demo build says DEMO, except on a preview', () => {
    expect(lookFor('local', 'demo')).toEqual({ title: null, themeColor: null, manifest: null, label: 'DEMO' });
    expect(lookFor('production', 'demo').label).toBe('DEMO');
    expect(lookFor('preview', 'demo').label).toBe('PREVIEW');
    expect(lookFor('local', 'fake').label).toBe(null);
    expect(lookFor('local', 'onedrive').label).toBe(null);
  });
});
