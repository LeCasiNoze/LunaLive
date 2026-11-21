import fs from 'node:fs';

// Flux exporté par le VPS (~/bigwin/export/feed.json) : seulement les clips publiés et vérifiés.
// Lu au build : WINS_FEED_URL (prod) ou wins-feed.json à la racine du projet (dev). Sans flux, aucune page /wins/.
// bonus_buy : bet est alors le prix du bonus acheté, et multi = win / prix.
export type Clip = {rank: number; streamer: string; platform: 'kick' | 'rumble'; multi: number; win: number | null; bet: number | null; bonus_buy?: boolean; currency: string | null; at: string};
export type Video = {kind: 'daily' | 'weekly' | 'monthly'; period: string; label?: string; title?: string | null; youtube_id: string | null; short_id: string | null; thumb: string | null; publish_at: string | null; age_restricted: boolean | null; clips: Clip[]};
export type Feed = {generated_at: string; videos: Video[]};

// En dessous, pas de page (page mince). Les clips rejetés après publication sont retirés du flux.
export const MIN_CLIPS = 3;

let cache: Feed | null | undefined;
export async function loadFeed(): Promise<Feed | null> {
  if (cache !== undefined) return cache;
  const url = process.env.WINS_FEED_URL;
  try {
    if (url) {
      const r = await fetch(url);
      cache = r.ok ? await r.json() : null;
      if (!r.ok) console.warn(`[wins] feed HTTP ${r.status}, pages /wins/ non générées`);
    } else {
      cache = fs.existsSync('wins-feed.json') ? JSON.parse(fs.readFileSync('wins-feed.json', 'utf8')) : null;
    }
  } catch (e) {
    console.warn('[wins] feed illisible, pages /wins/ non générées', e);
    cache = null;
  }
  return cache ?? null;
}

export const byKind = (f: Feed | null, kind: Video['kind']) =>
  (f?.videos ?? []).filter(v => v.kind === kind && v.clips.length >= MIN_CLIPS).sort((a, b) => b.period.localeCompare(a.period));

// Du plus gros au plus petit, renuméroté : le flux peut avoir des trous de rang (clips rejetés).
export const top = (v: Video) => [...v.clips].sort((a, b) => b.multi - a.multi).map((c, i) => ({...c, rank: i + 1}));

const SYM: Record<string, string> = {USD: '$', CAD: 'CA$', NZD: 'NZ$'};
export const money = (n: number | null, cur: string | null) =>
  n == null ? '' : cur && SYM[cur] ? `${SYM[cur]}${n.toLocaleString('en-US', {maximumFractionDigits: 2})}` : n.toLocaleString('en-US', {maximumFractionDigits: 2});
export const multi = (m: number) => `x${Math.round(m).toLocaleString('en-US')}`;
export const streamerName = (s: string) => s.replace(/^rumble-/, '');
export const platformName = (p: Clip['platform']) => (p === 'rumble' ? 'Rumble' : 'Kick');
export const slug = (s: string) => streamerName(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'}).format(new Date(iso + 'T12:00:00Z'));
