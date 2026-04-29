// web/src/lib/utm.ts
//
// Capture silencieuse des UTM params + referrer + landing path dès que
// l'utilisateur arrive sur le site. Stocké en localStorage avec TTL 30 jours.
// Envoyé avec /auth/register pour identifier la source des nouveaux comptes.

const UTM_KEY = "lunalive_utm_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export type UtmData = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath?: string;
  referrer?: string;
  capturedAt?: string;
};

/**
 * À appeler une fois au montage de l'app. Si l'URL contient des utm_*, on les
 * capture (last-touch attribution). Sinon on ne fait rien.
 */
export function captureUtmFromUrl(): UtmData | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const data: UtmData = {};
    let hasUtm = false;
    for (const p of UTM_PARAMS) {
      const v = url.searchParams.get(p);
      if (v) {
        const key = p.replace("utm_", "") as keyof UtmData;
        (data as any)[key] = String(v).slice(0, 200);
        hasUtm = true;
      }
    }
    if (!hasUtm) return null;
    data.landingPath = url.pathname.slice(0, 500);
    data.referrer = (document.referrer || "").slice(0, 500);
    data.capturedAt = new Date().toISOString();
    localStorage.setItem(UTM_KEY, JSON.stringify(data));
    return data;
  } catch {
    return null;
  }
}

/**
 * Récupère les UTM stockés. Retourne null si expiré (>30 jours) ou absent.
 */
export function getStoredUtm(): UtmData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as UtmData;
    if (data.capturedAt) {
      const age = Date.now() - new Date(data.capturedAt).getTime();
      if (age > TTL_MS) {
        localStorage.removeItem(UTM_KEY);
        return null;
      }
    }
    return data;
  } catch {
    return null;
  }
}

export function clearStoredUtm() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(UTM_KEY);
  } catch {}
}
