import { describe, expect, it } from 'vitest';
import { wwwRedirect } from '../www';

describe('wwwRedirect', () => {
  it('sends www to the bare host, keeping path and query', () => {
    const res = wwwRedirect(new URL('https://www.omark.app/privacy/?a=1'));
    expect(res?.status).toBe(301);
    expect(res?.headers.get('Location')).toBe('https://omark.app/privacy/?a=1');
  });

  it('leaves the bare host alone', () => {
    expect(wwwRedirect(new URL('https://omark.app/'))).toBeNull();
  });

  it('leaves preview hosts alone', () => {
    expect(wwwRedirect(new URL('https://pr-3.omark-site.pages.dev/'))).toBeNull();
  });
});
