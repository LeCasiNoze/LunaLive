/** Source accents never override the streamer's or viewer's text skins. */
export function messagePresentation(message: {userId?: number; body?: string; externalSource?: string | null; msgColor?: string | null; style?: {msgColor?: string | null}; rumble?: boolean}) {
  const source = String(message.externalSource || '').toLowerCase();
  const legacy = message.userId === 0 ? String(message.body || '').match(/^\[(Kick|Twitch)\] /i)?.[1]?.toLowerCase() : undefined;
  const platform = source === 'kick' || source === 'twitch' ? source : legacy;
  const accent = platform === 'kick' ? '#53FC18' : platform === 'twitch' ? '#BF94FF' : null;
  const candidate = message.msgColor ?? message.style?.msgColor;
  const textColor = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(candidate || '') ? candidate! : undefined;
  return {platform, accent, textColor, label: platform === 'kick' ? 'Kick' : platform === 'twitch' ? 'Twitch' : null};
}
