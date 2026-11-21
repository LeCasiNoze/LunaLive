import type {APIRoute} from 'astro';
import {LANGS, t, href} from '../i18n';
import {CASINOS, PAIRS, CHECKED, NOINDEX} from '../data/casinos';
import {winsPages} from '../data/wins';

// Sitemap avec alternates hreflang pour chaque page et chaque langue.
export const GET: APIRoute = async ({site}) => {
  const base = site!.origin;
  // Pages /wins/ : mêmes pages dans les 6 langues, lastmod = date de la vidéo.
  const wins = (await winsPages()).map(w => [w.sub, w.v?.period ?? w.last ?? w.days[0]?.period ?? CHECKED] as const);
  const lastmod = new Map<string, string>(wins);
  const paths = [...wins.map(([p]) => p), '', ...CASINOS.filter(c => !NOINDEX.includes(c.id)).map(c => `casinos/${c.id}/`), ...PAIRS.filter(p => !p.some(id => NOINDEX.includes(id))).map(([a, b]) => `vs/${a}-vs-${b}/`), 'guide/', 'about/', 'responsible-gambling/', 'privacy/', 'telegram/'];
  const urls = paths.flatMap(p => LANGS.map(l => {
    const alts = LANGS.map(a => `<xhtml:link rel="alternate" hreflang="${t(a).locale.slice(0, 2)}" href="${base}${href(a, p)}"/>`).join('')
      + `<xhtml:link rel="alternate" hreflang="x-default" href="${base}${href('en', p)}"/>`;
    const pr = p === '' ? '1.0' : p.startsWith('casinos') ? '0.9' : p.startsWith('wins') ? '0.8' : p.startsWith('vs') ? '0.7' : '0.5';
    return `<url><loc>${base}${href(l, p)}</loc><lastmod>${lastmod.get(p) ?? CHECKED}</lastmod><priority>${pr}</priority>${alts}</url>`;
  }));
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`, {headers: {'Content-Type': 'application/xml'}});
};
