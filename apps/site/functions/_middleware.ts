import { wwwRedirect } from '../www.ts';

/** Cloudflare Pages middleware for every request: www.omark.app goes to omark.app. */
export const onRequest = async (context: { request: Request; next: () => Promise<Response> }): Promise<Response> =>
  wwwRedirect(new URL(context.request.url)) ?? context.next();
