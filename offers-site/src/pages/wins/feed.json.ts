import type {APIRoute} from 'astro';
import {loadFeed, byKind, top, streamerName, platformName, channelUrl, clipVideo} from '../../data/wins';

// Version lisible par machine des pages /wins/ : seulement les dailies publiés (au moins MIN_CLIPS clips vérifiés).
// Pas de devise : le flux ne la connaît pas encore, les montants sont des nombres bruts.
export const GET: APIRoute = async ({site}) => {
  const days = byKind(await loadFeed(), 'daily');
  const body = {
    source: 'Big Win Daily',
    home: new URL('/wins/', site).href,
    note: 'Verified slot wins from public Kick and Rumble casino livestreams. multi = win / bet (base stake). Amounts have no currency. A link back is appreciated.',
    days: days.map(v => ({
      date: v.period,
      page: new URL(`/wins/${v.period}/`, site).href,
      video: v.youtube_id ? `https://www.youtube.com/watch?v=${v.youtube_id}` : null,
      age_restricted: v.age_restricted,
      wins: top(v).map(c => ({
        rank: c.rank, streamer: streamerName(c.streamer), channel: channelUrl(c), platform: platformName(c.platform),
        game: c.game ?? null, provider: c.provider ?? null, multi: c.multi, bet: c.bet, win: c.win,
        bonus_buy: !!c.bonus_buy, buy_cost: c.buy_cost ?? null, at: c.at, video_at: clipVideo(v.youtube_id, c.t),
      })),
    })),
  };
  return new Response(JSON.stringify(body, null, 1), {headers: {'Content-Type': 'application/json; charset=utf-8'}});
};
