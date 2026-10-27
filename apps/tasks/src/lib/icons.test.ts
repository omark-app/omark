import { describe, expect, it } from 'vitest';
import { iconsFor } from './icons.ts';

describe('iconsFor', () => {
  it('gives staging its own icons', () => {
    expect(iconsFor('staging')).toEqual({
      favicon: '/icons/staging/favicon.svg',
      favicon32: '/icons/staging/favicon-32.png',
      appleTouch: '/icons/staging/apple-touch-icon.png',
    });
  });

  it('keeps the links in index.html for every other environment', () => {
    expect(iconsFor('production')).toBeNull();
    expect(iconsFor('preview')).toBeNull();
    expect(iconsFor('local')).toBeNull();
  });
});
