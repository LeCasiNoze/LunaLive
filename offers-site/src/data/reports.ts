import {loadFeed, type Clip} from './wins';
import {STATS} from './maxwin';
import games from './games.json';

// Rapport mensuel /reports/AAAA-MM/ : top 20 du mois (clips publiés, horodatés), jeux à 1 000x et plus, éditeurs.
// Sources : feed.json (clips publiés) et games.json (gains vérifiés par jeu), tous deux exports de la production.
// PUBLIC : mois publiés (indexés, au sitemap). Les autres sont construits en noindex pour relecture.
export const PUBLIC: string[] = [];
// Gains écartés à la relecture, par motif : rejected_by_month de games.json (classement par mots-clés côté production).
const REJ = ((games as {rejected_by_month?: Record<string, Record<string, number>>}).rejected_by_month) ?? {};
const REASON: Record<string, string> = {
  bonus_buy: 'a bought bonus read as a bet, or a buy paying under 3× its price',
  balance_read_as_win: 'a balance read as a win',
  win_not_final_or_outside_clip: 'a win not final or outside the clip',
  amount_or_bet_misread: 'an amount or bet misread',
  ad_not_blurred: 'an unblurred ad on screen (rule dropped on 22/11)',
  jackpot_or_cap_screen: 'a jackpot or cap screen',
  stream_intro_or_replay: 'a stream intro or replay',
  other: 'other reasons',
};
export const rejected = (month: string) => Object.entries(REJ[month] ?? {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({reason: REASON[k] ?? k, n}));
export const LICENCE = {name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/'};

export interface Row extends Clip {day: string; video: string | null}

export async function report(month: string) {
  const feed = await loadFeed();
  const rows: Row[] = (feed?.videos ?? [])
    .filter(v => v.kind === 'daily' && v.period.startsWith(month) && v.youtube_id)
    .flatMap(v => v.clips.map(c => ({...c, day: v.period, video: v.youtube_id})))
    // Même ordre que le Top du jour : multiplicateur de la mise.
    .sort((a, b) => b.multi - a.multi);
  const games = STATS
    .map(g => ({game: g.game, provider: g.provider, n1000: g.wins_1000x_by_month[month] ?? 0, best: g.top10.filter(w => w.day.startsWith(month)).sort((a, b) => b.multi - a.multi)[0]}))
    .filter(g => g.n1000 > 0 && g.best)
    .sort((a, b) => b.n1000 - a.n1000 || b.best!.multi - a.best!.multi);
  const byProv = new Map<string, number[]>();
  for (const g of STATS) for (const w of g.top10) if (w.day.startsWith(month)) byProv.set(g.provider || 'provider not identified', [...(byProv.get(g.provider || 'provider not identified') ?? []), w.multi]);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const providers = [...byProv].map(([provider, xs]) => ({provider, wins: xs.length, big: xs.filter(x => x >= 1000).length, median: median(xs)}))
    .sort((a, b) => b.big - a.big || b.wins - a.wins);
  const days = [...new Set(rows.map(r => r.day))].sort();
  return {top: rows.slice(0, 20), games, providers, days, verified: STATS.reduce((n, g) => n + g.top10.filter(w => w.day.startsWith(month)).length, 0)};
}

export const reportMonths = async () => {
  const feed = await loadFeed();
  return [...new Set((feed?.videos ?? []).filter(v => v.kind === 'daily' && v.youtube_id).map(v => v.period.slice(0, 7)))].sort();
};
