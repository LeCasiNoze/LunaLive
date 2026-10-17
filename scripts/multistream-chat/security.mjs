import {createHash, createHmac, timingSafeEqual, verify} from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const equal = (a, b) => timingSafeEqual(Buffer.from(hash(String(a))), Buffer.from(hash(String(b))));

// Uses the existing LunaClip dashboard session; never accepts a URL token.
export function dashboardSessionValid(cookie, secret, now = Date.now()) {
  if (!secret) return false;
  const value = String(cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('lunaclip_session='))?.slice(17) || '';
  const parts = value.split('.'), expiry = Number(parts[0]), seconds = Math.floor(now / 1000);
  if (parts.length !== 3 || !Number.isSafeInteger(expiry) || expiry <= seconds || expiry > seconds + 30 * 86400) return false;
  const signature = createHmac('sha256', secret).update('dashboard-session:' + parts[0] + '.' + parts[1]).digest('base64url');
  return equal(signature, parts[2]);
}

export function verifyKickWebhook(headers, raw, publicKey, now = Date.now()) {
  const id = headers['kick-event-message-id'], stamp = headers['kick-event-message-timestamp'];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(id) || typeof stamp !== 'string') return false;
  const time = Date.parse(stamp);
  if (!Number.isFinite(time) || Math.abs(time - now) > 5 * 60_000) return false;
  if (headers['kick-event-type'] !== 'chat.message.sent' || headers['kick-event-version'] !== '1') return false;
  const signature = headers['kick-event-signature'];
  if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  try {
    return verify('RSA-SHA256', Buffer.concat([Buffer.from(id + '.' + stamp + '.'), raw]), publicKey, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

export function normalizeKickEvent(body) {
  if (!body || !body.message_id || !body.broadcaster?.user_id || !body.sender?.user_id || typeof body.content !== 'string') throw Error('invalid_kick_event');
  return {platform:'kick', channelId:String(body.broadcaster.user_id), messageId:String(body.message_id),
    userId:String(body.sender.user_id), username:String(body.sender.username || 'viewer'), text:body.content, createdAt:body.created_at};
}

export function normalizeTwitchEvent(body) {
  if (!body?.message_id || !body.broadcaster_user_id || !body.chatter_user_id || typeof body.message?.text !== 'string') throw Error('invalid_twitch_event');
  return {platform:'twitch', channelId:String(body.broadcaster_user_id), messageId:String(body.message_id),
    userId:String(body.chatter_user_id), username:String(body.chatter_user_name || body.chatter_user_login || 'viewer'), text:body.message.text};
}

export function twitchReconnectUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'wss:' || url.hostname !== 'eventsub.wss.twitch.tv' || url.port || url.username || url.password) throw Error('invalid_twitch_reconnect_url');
  return url.href;
}

export function twitchReplyAllowed(text) {
  // Do not funnel the Twitch audience into a simultaneous stream or a casino.
  return !/(?:https?:\/\/)?(?:www\.)?(?:rumble\.com|kick\.com|lunalive\.[\w.-]+|celsiuscasino\.com|shuffle\.com|stake\.com|rollbit\.com|duelbits\.com|roobet\.com|blaze\.com|gamdom\.com)\b/i.test(text);
}
