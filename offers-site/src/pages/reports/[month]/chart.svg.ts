import type {APIRoute} from 'astro';
import {report, reportMonths} from '../../../data/reports';
import {streamerName} from '../../../data/wins';

// Graphique intégrable du rapport : les 10 plus gros multiplicateurs du mois, en barres horizontales.
export async function getStaticPaths() { return (await reportMonths()).map(month => ({params: {month}})); }
export const GET: APIRoute = async ({params}) => {
  const month = params.month!;
  const r = await report(month);
  const top = r.top.slice(0, 10);
  const name = new Date(month + '-01T12:00:00Z').toLocaleString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const W = 720, H = 420, L = 250, top0 = 60, bh = 30, max = Math.max(...top.map(c => c.multi), 1);
  const bars = top.map((c, i) => {
    const y = top0 + i * bh, w = Math.max(2, (W - L - 90) * c.multi / max);
    const label = esc(`${streamerName(c.streamer)} · ${c.game ?? 'unidentified'}`).slice(0, 40);
    return `<text x="${L - 10}" y="${y + 19}" text-anchor="end" font-size="13" fill="#c9cbd6">${label}</text>`
      + `<rect x="${L}" y="${y + 5}" width="${w.toFixed(1)}" height="${bh - 10}" rx="3" fill="#ffcf4a"/>`
      + `<text x="${L + w + 8}" y="${y + 19}" font-size="13" fill="#f3f4fa">x${Math.round(c.multi).toLocaleString('en-US')}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter,Arial,sans-serif">`
    + `<rect width="${W}" height="${H}" fill="#0d0e14"/>`
    + `<text x="24" y="36" font-size="18" font-weight="700" fill="#f3f4fa">Biggest verified slot wins on stream, ${esc(name)} (× bet)</text>`
    + bars
    + `<text x="24" y="${H - 16}" font-size="12" fill="#8b8fa3">Data: Big Win Daily · bigwindaily.onrender.com/reports/${month}/ · CC BY 4.0</text>`
    + `</svg>`;
  return new Response(svg, {headers: {'Content-Type': 'image/svg+xml'}});
};
