const allowed = new Set(['automod','auto-hunt','provider-challenge']);
/** Also filters persisted polls created before session-buy was removed. */
export function modeVoteOptions(payload: unknown): string[] {
 const raw = (payload as {options?:unknown}|null)?.options;
 const options = Array.isArray(raw) ? raw : ['automod','auto-hunt'];
 const filtered = [...new Set(options.filter((mode):mode is string => typeof mode==='string' && allowed.has(mode)))];
 return filtered.length ? filtered : ['automod','auto-hunt'];
}
