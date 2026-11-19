import type {APIRoute} from 'astro';
export const GET: APIRoute = ({site}) => new Response(`User-agent: *\nAllow: /\nDisallow: /go/\n\nSitemap: ${site!.origin}/sitemap.xml\n`, {headers: {'Content-Type': 'text/plain'}});
