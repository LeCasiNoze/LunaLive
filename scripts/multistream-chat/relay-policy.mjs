import { createHash } from 'node:crypto';

const PLATFORMS = new Set(['lunalive', 'rumble', 'kick', 'twitch']);
const LABELS = {lunalive:'LunaLive', rumble:'Rumble', kick:'Kick', twitch:'Twitch'};

/** Pure routing policy. Adapters must authenticate events and persist the dedupe key before executing.
 * This module sends no message and never adds a live call itself.
 */
export function planChatEvent(event, config) {
  const ignore = reason => ({ignored:true, reason, deliveries:[], command:null});
  const platform = event?.platform;
  if (!PLATFORMS.has(platform)) return ignore('unsupported_platform');
  if (config?.streamerSlug !== 'lecasinoze') return ignore('streamer_not_allowed');
  const sourceChannel = config.channels?.[platform];
  if (!sourceChannel || String(event.channelId) !== String(sourceChannel)) return ignore('wrong_channel');
  const botIds = config.botUserIds?.[platform];
  if (!Array.isArray(botIds) || !botIds.length) return ignore('bot_identity_not_configured');
  if (!event.messageId || !event.userId) return ignore('external_identity_missing');
  // A temporary broadcaster credential is shared with the human owner. Only
  // adapter-confirmed outgoing IDs/text are echoes in that mode.
  const sharedSender = String(config.sharedSenderIds?.[platform] || '') === String(event.userId);
  if ((!sharedSender && botIds.map(String).includes(String(event.userId))) || event.origin === 'relay') return ignore('bot_or_relay_echo');
  const text = String(event.text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!text || text.length > 2000) return ignore('invalid_message');
  const username = String(event.username || 'viewer').replace(/[\u0000-\u001f\u007f]/g, '').slice(0,50);
  const externalIdentity = `${platform}:${event.userId}`;
  const eventKey = createHash('sha256').update(JSON.stringify([platform, String(event.channelId), String(event.messageId)])).digest('hex');
  const match = text.match(/^!(call|discord)(?:\s+(.*))?$/i);
  const command = match ? {
    name:match[1].toLowerCase(), argument:match[2]?.trim() || '',
    actor:{externalIdentity, platform, userId:String(event.userId), username, role:'viewer'},
    streamerSlug:'lecasinoze', dedupeKey:eventKey,
    replyTo:{platform, channelId:String(event.channelId), messageId:String(event.messageId)}
  } : null;
  const body = `[${LABELS[platform]}] ${username} : ${text}`;
  const deliveries = [];
  for (const target of config.mirrorTargets?.[platform] || []) {
    if (!PLATFORMS.has(target) || target === platform || !config.channels?.[target]) continue;
    // Simulcast default: Twitch receives local bot replies, not a merged external chat.
    if (target === 'twitch') continue;
    if (deliveries.some(delivery => delivery.platform === target)) continue;
    const limit = target === 'rumble' ? 200 : 500;
    const chars = Array.from(body);
    deliveries.push({platform:target, channelId:String(config.channels[target]),
      text:chars.length > limit ? chars.slice(0,limit-1).join('')+'…' : body,
      origin:'relay', originEventKey:eventKey});
  }
  return {ignored:false, eventKey, externalIdentity, command, deliveries,
    executionRequires:'authenticated_event_and_durable_inbox_claim'};
}
