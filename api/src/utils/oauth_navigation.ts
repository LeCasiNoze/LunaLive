const OFFICIAL_ORIGINS = new Set([
  'https://lunalive.win', 'https://www.lunalive.win', 'https://lunalive.onrender.com',
]);

export function oauthReturnOrigin(candidate: unknown, fallback: string): string {
  if (typeof candidate !== 'string') return fallback;
  try {
    const url = new URL(candidate);
    if (url.username || url.password) return fallback;
    const configured = new URL(fallback).origin;
    return OFFICIAL_ORIGINS.has(url.origin) || url.origin === configured ? url.origin : fallback;
  } catch { return fallback; }
}

export function discordNeedsConsent(error: unknown, alreadyRetried: boolean): boolean {
  return !alreadyRetried && typeof error === 'string'
    && ['consent_required', 'interaction_required', 'login_required'].includes(error);
}
