/** A 301 to the bare host when the request is for `www.`, else null. Path and query are kept. */
export function wwwRedirect(url: URL): Response | null {
  if (!url.hostname.startsWith('www.')) return null;
  const target = new URL(url.href);
  target.protocol = 'https:';
  target.hostname = url.hostname.slice('www.'.length);
  target.hash = '';
  return new Response(null, { status: 301, headers: { Location: target.href } });
}
