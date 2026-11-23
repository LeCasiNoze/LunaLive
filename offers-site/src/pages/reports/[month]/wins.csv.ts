import type {APIRoute} from 'astro';
import {report, reportMonths} from '../../../data/reports';
import {streamerName, clipVideo} from '../../../data/wins';

// CSV du rapport mensuel (CC BY 4.0, crédit : lien vers la page du rapport).
export async function getStaticPaths() { return (await reportMonths()).map(month => ({params: {month}})); }
export const GET: APIRoute = async ({params, site}) => {
  const month = params.month!;
  const r = await report(month);
  const q = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['rank', 'date', 'streamer', 'platform', 'game', 'provider', 'bet', 'win', 'multiplier', 'bonus_buy', 'win_per_price_paid', 'clip_url', 'credit'];
  const credit = `Big Win Daily ${site!.origin}/reports/${month}/ (CC BY 4.0)`;
  const rows = r.top.map((c, i) => [i + 1, c.day, streamerName(c.streamer), c.platform, c.game, c.provider, c.bet, c.win, c.multi, c.bonus_buy ? 'yes' : 'no', c.bonus_buy ? c.paid_multi : '', clipVideo(c.video, c.t), credit].map(q).join(','));
  return new Response([head.join(','), ...rows].join('\n') + '\n', {headers: {'Content-Type': 'text/csv; charset=utf-8'}});
};
