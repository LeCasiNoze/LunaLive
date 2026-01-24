// web/src/components/chatpanel/chatpanel.helpers.ts
import type { ChatCosmetics } from "../../lib/cosmetics";
import type { StreamerAppearance } from "../../lib/appearance";

/* =========================================================
   Types (extraits du gros fichier)
   ========================================================= */
export type ChatMsg = {
  id: number;
  userId: number;
  username: string;
  body: string;
  deleted?: boolean;
  createdAt: string;
  cosmetics?: ChatCosmetics | null;
};

export type JoinAck = {
  ok: boolean;
  error?: string;
  role?: "guest" | "viewer" | "mod" | "streamer" | "admin";
  perms?: {
    canSend: boolean;
    canDelete: boolean;
    canTimeout: boolean;
    canBan: boolean;
    canClear: boolean;
    canMod: boolean;
    canManageMods: boolean;
  };
  state?: {
    banned: boolean;
    timeoutUntil?: string | null;
  };
  me?: { id: number; username: string; role: string } | null;
  appearance?: StreamerAppearance;
};

export type ChatSettings = {
  allowLinks: boolean;
  followOnly: boolean;
  subOnly: boolean;
  dliveSyncPublic: boolean;
  dliveSyncPopup: boolean;
};

export type ViewerRow = { userId: number; username: string };

export type MentionState = null | { start: number; end: number; q: string; active: number };

/* =========================================================
   Base helpers
   ========================================================= */
export function apiBase() {
  return (import.meta as any).env?.VITE_API_BASE || "https://lunalive-api.onrender.com";
}

export function fmtRemaining(untilIso?: string | null) {
  if (!untilIso) return "";
  const t = new Date(untilIso).getTime() - Date.now();
  if (t <= 0) return "0s";
  const s = Math.ceil(t / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.ceil(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.ceil(h / 24);
  return `${d}j`;
}

export function errMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as any).message;
    if (typeof m === "string") return m;
  }
  return String(e || "error");
}

export function normKey(s: any) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function computeMentionCtx(value: string, caret: number) {
  const left = value.slice(0, caret);
  const at = left.lastIndexOf("@");
  if (at < 0) return null;

  const prev = at === 0 ? " " : left[at - 1];
  if (prev && !/\s/.test(prev)) return null;

  const q = left.slice(at + 1);
  if (/\s/.test(q)) return null;

  return { start: at, end: caret, q };
}

/* =========================================================
   Limite de lignes (ta demande)
   ========================================================= */
export function countLines(text: string) {
  // au moins 1 ligne même vide
  const parts = String(text ?? "").replace(/\r/g, "").split("\n");
  return Math.max(1, parts.length);
}

export function clampLines(text: string, maxLines: number) {
  const parts = String(text ?? "").replace(/\r/g, "").split("\n");
  if (parts.length <= maxLines) return String(text ?? "");
  return parts.slice(0, maxLines).join("\n");
}

export function maxLinesForRole(role?: JoinAck["role"]) {
  if (role === "mod" || role === "streamer" || role === "admin") return 100;
  return 10; // viewer + le reste
}

/* =========================================================
   Viewer cosmetics policy (inchangé, déplacé)
   ========================================================= */
export function cloneCosmetics<T>(x: T): T {
  try {
    // @ts-ignore
    if (typeof structuredClone === "function") return structuredClone(x);
  } catch {}
  return JSON.parse(JSON.stringify(x));
}

export function applyViewerPolicy(cos: any, level: 1 | 2 | 3) {
  if (!cos) return null;
  const c = cloneCosmetics(cos);

  const hasUsernameSkinLocal = (x: any) => {
    const u = x?.username ?? x?.user ?? x?.name ?? x?.pseudo ?? null;
    const color =
      u?.color ??
      u?.hex ??
      u?.colorId ??
      x?.usernameColorId ??
      x?.nameColorId ??
      x?.pseudoColorId ??
      null;
    const effect =
      u?.effect ??
      u?.animId ??
      u?.animationId ??
      x?.usernameAnimId ??
      x?.nameAnimId ??
      x?.pseudoAnimId ??
      null;
    return color != null || (effect != null && effect !== "none");
  };

  const stripUsernameLocal = (x: any) => {
    if (!x) return null;
    const out: any = { ...x };

    delete out.usernameColorId;
    delete out.nameColorId;
    delete out.pseudoColorId;
    delete out.usernameAnimId;
    delete out.nameAnimId;
    delete out.pseudoAnimId;

    if (out.username && typeof out.username === "object") {
      out.username = { ...out.username };
      delete out.username.color;
      delete out.username.hex;
      delete out.username.colorId;
      delete out.username.effect;
      delete out.username.animId;
      delete out.username.animationId;
    }
    if (out.name && typeof out.name === "object") {
      out.name = { ...out.name };
      delete out.name.color;
      delete out.name.hex;
      delete out.name.colorId;
      delete out.name.effect;
      delete out.name.animId;
      delete out.name.animationId;
    }
    if (out.pseudo && typeof out.pseudo === "object") {
      out.pseudo = { ...out.pseudo };
      delete out.pseudo.color;
      delete out.pseudo.hex;
      delete out.pseudo.colorId;
      delete out.pseudo.effect;
      delete out.pseudo.animId;
      delete out.pseudo.animationId;
    }

    return out;
  };

  if (level === 1) {
    return hasUsernameSkinLocal(c) ? c : stripUsernameLocal(c);
  }

  const noUsername = stripUsernameLocal(c);

  if (level >= 3 && noUsername) {
    (noUsername as any).frame = null;
    (noUsername as any).frameId = null;

    if ((noUsername as any).avatar && typeof (noUsername as any).avatar === "object") {
      (noUsername as any).avatar = { ...(noUsername as any).avatar, frame: null, frameId: null };
    }
  }

  return noUsername;
}

/* =========================================================
   System messages Rain
   ========================================================= */
export function isRainOpenMessage(msg: ChatMsg) {
  return typeof msg.body === "string" && msg.body.includes("[RAIN_OPEN]");
}

export function stripRainToken(text: string) {
  return text.replace("[RAIN_OPEN]", "").trim();
}
