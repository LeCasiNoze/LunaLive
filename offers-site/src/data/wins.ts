import fs from 'node:fs';
import {LANGS, t, type Lang} from '../i18n';

// Flux exporté par le VPS (~/bigwin/export/feed.json) : seulement les clips publiés et vérifiés.
// Lu au build : WINS_FEED_URL si elle existe, sinon la copie versionnée src/data/wins-feed.json
// (WINS_FEED_FILE la remplace pour un test local). Sans flux, aucune page /wins/.
// bet = mise de base ; bonus_buy = bonus acheté ; buy_cost = son prix relevé à l'image (null si non lu, prix alors jamais affiché).
// multi = win / bet, affiché en grand ; rank suit l'ordre de la vidéo (classement sur multi depuis le 21/11) ; paid_multi est seulement informatif.
export type Clip = {rank: number; streamer: string; platform: 'kick' | 'rumble'; multi: number; win: number | null; bet: number | null; bonus_buy?: boolean; buy_cost?: number | null; paid_multi?: number | null; game?: string | null; provider?: string | null; currency: string | null; at: string};
export type Video = {kind: 'daily' | 'weekly' | 'monthly'; period: string; label?: string; title?: string | null; youtube_id: string | null; short_id: string | null; thumb: string | null; publish_at: string | null; age_restricted: boolean | null; clips: Clip[]};
export type Feed = {generated_at: string; videos: Video[]};

// En dessous, pas de page (page mince). Les clips rejetés après publication sont retirés du flux.
export const MIN_CLIPS = 3;
// Une archive de semaine n'existe qu'à partir de 2 jours publiés.
export const MIN_DAYS = 2;
// Page par jeu ou par streamer seulement à partir de 2 gains vérifiés (sinon page mince).
export const MIN_GROUP = 2;

let cache: Feed | null | undefined;
export async function loadFeed(): Promise<Feed | null> {
  if (cache !== undefined) return cache;
  const url = process.env.WINS_FEED_URL;
  const file = process.env.WINS_FEED_FILE || 'src/data/wins-feed.json';
  try {
    if (url) {
      const r = await fetch(url);
      cache = r.ok ? await r.json() : null;
      if (!r.ok) console.warn(`[wins] feed HTTP ${r.status}, pages /wins/ non générées`);
    } else {
      cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    }
  } catch (e) {
    console.warn('[wins] feed illisible, pages /wins/ non générées', e);
    cache = null;
  }
  return cache ?? null;
}

// Pas de page avant publish_at : la vidéo est encore privée et le flux en ligne la contient déjà.
export const byKind = (f: Feed | null, kind: Video['kind']) =>
  (f?.videos ?? []).filter(v => v.kind === kind && v.clips.length >= MIN_CLIPS && (!v.publish_at || Date.parse(v.publish_at) <= Date.now())).sort((a, b) => b.period.localeCompare(a.period));

// Ordre de la vidéo, renuméroté : le flux peut avoir des trous de rang (clips rejetés).
export const top = (v: Video) => [...v.clips].sort((a, b) => a.rank - b.rank).map((c, i) => ({...c, rank: i + 1}));

// Semaine ISO (AAAA-Www) d'un jour AAAA-MM-JJ, et ses bornes lundi–dimanche.
export function isoWeek(day: string) {
  const d = new Date(day + 'T12:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  const thu = new Date(d); thu.setUTCDate(d.getUTCDate() - wd + 3);
  const y = thu.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((thu.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export function weekBounds(week: string) {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4); mon.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return [mon, sun];
}

// Pages à générer, identiques dans les 6 langues (hreflang réciproque).
export type Hit = Clip & {day: string; youtube_id: string | null};
export type Group = {sub: string; name: string; hits: Hit[]};
export type WinsPage = {sub: string; kind: 'latest' | 'day' | 'week' | 'slot' | 'streamer' | 'month' | 'records'; v?: Video; days: Video[]; week?: string; prev?: string; next?: string; weekSub?: string;
  name?: string; hits?: Hit[]; last?: string; slots?: Group[]; streamers?: Group[]; monthSub?: string; recordsSub?: string};
export const slug = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Seuls les Tops du jour comptent : un même clip repasse dans le Top de la semaine.
function groups(days: Video[], key: (c: Clip) => string | null | undefined, base: string): Group[] {
  const m = new Map<string, Hit[]>();
  for (const v of days) for (const c of v.clips) {
    const k = slug(key(c)?.trim() || '');
    if (k) m.set(k, [...(m.get(k) ?? []), {...c, day: v.period, youtube_id: v.youtube_id}]);
  }
  return [...m].filter(([, h]) => h.length >= MIN_GROUP).map(([k, h]) => {
    const hits = h.sort((a, b) => b.multi - a.multi).map((c, i) => ({...c, rank: i + 1}));
    return {sub: `wins/${base}/${k}/`, name: key(hits[0])!.trim(), hits};
  }).sort((a, b) => b.hits[0].multi - a.hits[0].multi);
}
const near = (gs: Group[], vs: Video[]) => gs.filter(g => g.hits.some(h => vs.some(v => v.period === h.day)));
export async function winsPages(): Promise<WinsPage[]> {
  const f = await loadFeed();
  const days = byKind(f, 'daily'), weeklies = byKind(f, 'weekly');
  if (!days.length) return [];
  const daySub = (v: Video) => `wins/${v.period}/`;
  const weeks = [...new Set(days.map(v => isoWeek(v.period)))].filter(w => days.filter(v => isoWeek(v.period) === w).length >= MIN_DAYS).sort().reverse();
  const weekSub = (w: string) => (weeks.includes(w) ? `wins/week/${w}/` : undefined);
  const slots = groups(days, c => c.game, 'slot'), streamers = groups(days, c => streamerName(c.streamer), 'streamer');
  const last = (g: Group) => g.hits.reduce((a, h) => (h.day > a ? h.day : a), '');
  // Page du mois : le top 30 des gains de tous les jours du mois, dès 2 jours publiés.
  const months = [...new Set(days.map(v => v.period.slice(0, 7)))].filter(m => days.filter(v => v.period.startsWith(m)).length >= MIN_DAYS).sort().reverse();
  const monthSub = (day: string) => (months.includes(day.slice(0, 7)) ? `wins/month/${day.slice(0, 7)}/` : undefined);
  return [
    {sub: 'wins/', kind: 'latest', v: days[0], days: days.slice(1, 8), weekSub: weekSub(isoWeek(days[0].period)), monthSub: monthSub(days[0].period), recordsSub: days.length >= 3 ? 'wins/records/' : undefined, slots, streamers},
    ...days.map((v, i) => ({sub: daySub(v), kind: 'day' as const, v, days: [], prev: days[i + 1] && daySub(days[i + 1]), next: days[i - 1] && daySub(days[i - 1]), weekSub: weekSub(isoWeek(v.period)), monthSub: monthSub(v.period), slots: near(slots, [v]), streamers: near(streamers, [v])})),
    ...weeks.map((w, i) => {
      const wd = days.filter(v => isoWeek(v.period) === w);
      return {sub: `wins/week/${w}/`, kind: 'week' as const, week: w, v: weeklies.find(x => x.period === w), days: wd,
        prev: weeks[i + 1] && `wins/week/${weeks[i + 1]}/`, next: weeks[i - 1] && `wins/week/${weeks[i - 1]}/`, slots: near(slots, wd), streamers: near(streamers, wd)};
    }),
    // Records de tous les temps : le top 50 de tous les Tops du jour, dès 3 jours publiés (avant, il doublerait une page jour).
    ...(days.length >= 3 ? [{sub: 'wins/records/', kind: 'records' as const, name: days[days.length - 1].period, last: days[0].period, days: [],
      hits: days.flatMap(v => v.clips.map(c => ({...c, day: v.period, youtube_id: v.youtube_id}))).sort((a, b) => b.multi - a.multi).slice(0, 50).map((c, j) => ({...c, rank: j + 1})),
      slots, streamers}] : []),
    ...months.map((m, i) => {
      const md = days.filter(v => v.period.startsWith(m));
      const hits = md.flatMap(v => v.clips.map(c => ({...c, day: v.period, youtube_id: v.youtube_id}))).sort((a, b) => b.multi - a.multi).slice(0, 30).map((c, j) => ({...c, rank: j + 1}));
      return {sub: `wins/month/${m}/`, kind: 'month' as const, name: m, hits, last: md[0].period, days: md,
        prev: months[i + 1] && `wins/month/${months[i + 1]}/`, next: months[i - 1] && `wins/month/${months[i - 1]}/`, slots: near(slots, md), streamers: near(streamers, md)};
    }),
    ...slots.map(g => ({sub: g.sub, kind: 'slot' as const, name: g.name, hits: g.hits, last: last(g), days: [], streamers: streamers.filter(x => x.hits.some(h => slug(h.game ?? '') === slug(g.name)))})),
    ...streamers.map(g => ({sub: g.sub, kind: 'streamer' as const, name: g.name, hits: g.hits, last: last(g), days: [], slots: slots.filter(x => x.hits.some(h => slug(streamerName(h.streamer)) === slug(g.name)))})),
  ];
}
export const winsPaths = async (langs: readonly Lang[]) => {
  const pages = await winsPages();
  return langs.flatMap(lang => pages.map(page => ({lang, page})));
};

const SYM: Record<string, string> = {USD: '$', CAD: 'CA$', NZD: 'NZ$'};
export const money = (n: number | null, cur: string | null, lang: Lang = 'en') => {
  if (n == null) return '';
  const s = n.toLocaleString(t(lang).locale, {maximumFractionDigits: 2});
  return cur && SYM[cur] ? `${SYM[cur]}${s}` : s;
};
export const multi = (m: number) => `x${Math.round(m).toLocaleString('en-US')}`;
export const streamerName = (s: string) => s.replace(/^rumble-/i, '');
export const platformName = (p: Clip['platform']) => (p === 'rumble' ? 'Rumble' : 'Kick');
// Rumble redirige /user/<nom> vers la casse exacte de la chaîne ; Kick attend le slug en minuscules.
export const channelUrl = (c: Clip) => (c.platform === 'rumble' ? `https://rumble.com/user/${streamerName(c.streamer)}` : `https://kick.com/${streamerName(c.streamer).toLowerCase()}`);
export const monthLabel = (lang: Lang, ym: string) => new Intl.DateTimeFormat(t(lang).locale, {month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(ym + '-15T12:00:00Z'));
export const dayLabel = (lang: Lang, iso: string) => new Intl.DateTimeFormat(t(lang).locale, {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(iso + 'T12:00:00Z'));
export const weekLabel = (lang: Lang, week: string) => {
  const [a, b] = weekBounds(week);
  return new Intl.DateTimeFormat(t(lang).locale, {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}).formatRange(a, b);
};
export {LANGS};
