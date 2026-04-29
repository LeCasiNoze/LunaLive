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

function isExternalReferrer(ref: string): boolean {
  if (!ref) return false;
  try {
    const u = new URL(ref);
    const host = u.hostname.toLowerCase();
    const myHost = window.location.hostname.toLowerCase();
    if (host === myHost) return false;
    // Skip Render preview domain too (internal)
    if (host.endsWith(".onrender.com") && myHost.endsWith(".onrender.com")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture l'origine de la visite si:
 *  - L'URL contient des utm_* (ad taguée)
 *  - OU le document.referrer pointe sur un domaine externe (TikTok, Insta, Discord, Google, etc.)
 *
 * Last-touch attribution: chaque nouvelle origine externe écrase la précédente.
 * Les navigations internes (pas de referrer ou referrer = lunalive.win) sont ignorées.
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
    const referrer = document.referrer || "";
    const externalRef = isExternalReferrer(referrer);

    // Skip si pas d'UTM ni de referrer externe (= nav interne)
    if (!hasUtm && !externalRef) return null;

    data.landingPath = url.pathname.slice(0, 500);
    data.referrer = referrer.slice(0, 500);
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
