/**
 * Cloudflare Pages middleware.
 *
 * Redirects any request that hits the default Pages preview domain
 * (dev-tools-portal.pages.dev) to the canonical production host (tool.news),
 * preserving the path and query string. Everything else passes through.
 */
export const onRequest = async (context) => {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // Only redirect the default pages.dev host; leave branch-preview hosts
  // (e.g. foo.dev-tools-portal.pages.dev) alone so PR previews still work.
  if (host === "dev-tools-portal.pages.dev") {
    const target = `https://tool.news${url.pathname}${url.search}`;
    return Response.redirect(target, 301);
  }

  return context.next();
};
