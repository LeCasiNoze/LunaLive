import type { RumbleBotSession } from '../rumble_chat_session.js';

export class RaidError extends Error {
  constructor(public code: string, public uncertain = false) { super(code); }
}
export function raidUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !['rumble.com','www.rumble.com'].includes(u.hostname)
        || u.port || u.username || u.password || !/^\/v[a-z0-9]{5,20}(?:-[^/]*)?\.html$/i.test(u.pathname)) return null;
    return 'https://rumble.com' + u.pathname;
  } catch { return null; }
}
export function raidVideoId(value: string): string | null {
  return raidUrl(value)?.match(/^https:\/\/rumble\.com\/(v[a-z0-9]+)(?:-|\.html)/i)?.[1].toLowerCase() ?? null;
}
/** Native web protocol observed 2026-10-18: command prepares, confirm launches.
 * Never send /raid as an ordinary chat message or through the message mirror. */
export async function startRumbleRaid(input: {
  sourceVideoId: string; targetUrl: string; session: RumbleBotSession;
  sourceStillCurrent: () => Promise<boolean>; request?: typeof fetch;
}): Promise<void> {
  const { session, sourceVideoId } = input, targetUrl = raidUrl(input.targetUrl);
  if (!targetUrl || !/^\d{1,16}$/.test(sourceVideoId)) throw new RaidError('invalid_target');
  if (!session.cookie || session.cookie.length < 20) throw new RaidError('session_unavailable');
  const request = input.request ?? fetch;
  const cookie = session.cookie.split(';').map(s=>s.trim()).filter(s=>s&&!/^(cf_clearance|__cf_bm)=/i.test(s)).join('; ');
  const headers = {accept:'application/json',cookie,origin:'https://rumble.com',referer:'https://rumble.com/',
    'user-agent':session.userAgent || 'Mozilla/5.0'};
  async function json(url: string, init: RequestInit, confirming = false) {
    let response: Response;
    try { response = await request(url,{...init,redirect:'error',signal:AbortSignal.timeout(10000)}); }
    catch { throw new RaidError('rumble_unavailable',confirming); }
    let data: any;
    try { const text=await response.text(); if(text.length>200000)throw Error(); data=JSON.parse(text); }
    catch { throw new RaidError('rumble_unavailable',confirming); }
    if (![200,409].includes(response.status) || data?.errors?.length)
      throw new RaidError(response.status===401||response.status===403?'rumble_permission':'raid_refused',confirming);
    return data;
  }
  const prepared = await json('https://rumble.com/chat/command',{
    method:'POST',headers:{...headers,'content-type':'application/json'},
    body:JSON.stringify({video_id:sourceVideoId,message:'/raid '+targetUrl}),
  });
  if (raidVideoId(String(prepared?.data?.target_url || '')) !== raidVideoId(targetUrl)) throw new RaidError('raid_target_unconfirmed');
  if (!await input.sourceStillCurrent()) throw new RaidError('source_changed');
  const body = new FormData(); body.append('video_id',sourceVideoId);
  const confirmed = await json('https://rumble.com/service.php?name=raid.confirm',{method:'POST',headers,body},true);
  if (confirmed?.data?.success !== true) throw new RaidError('raid_refused');
}
