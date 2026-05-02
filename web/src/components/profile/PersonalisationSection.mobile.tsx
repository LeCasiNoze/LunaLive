// web/src/components/profile/PersonalisationSection.mobile.tsx — Rework v3
// ─────────────────────────────────────────────────────────────────────────────
//  Personnalisation mobile — Purple Velvet polish
//  Tout ce que la version PC propose, repensé pour le tactile :
//   - Header sticky : avatar + preview chat live + actions (upload/save/delete)
//   - Onglets catégories avec compteur "possédés/total" + état actif net
//   - Search + filter chips (Tous / Débloqués / Verrouillés)
//   - Groupement par rareté (sections repliables, teintes de rareté)
//   - Cartes items grosses, lisibles, état "équipé" visible immédiatement
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { useAuth } from "../../auth/AuthProvider";
import { cosmeticsCatalog, equipCosmetic, myCosmetics } from "../../lib/api";
import { ChatMessageBubble } from "../chat/ChatMessageBubble";
import type { ChatCosmetics } from "../../lib/cosmetics";
import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  type StreamerAppearance,
} from "../../lib/appearance";
import { getInitials } from "../../lib/cosmetics";
import { trackFeatureEvent } from "../../lib/feature_events";

type Kind = "username" | "badge" | "title" | "frame" | "hat";

type ApiCatalogItem = {
  kind: Kind; code: string; name: string; rarity: string;
  unlock: string; priceRubis: number | null; pricePrestige?: number | null;
  active: boolean; meta?: any;
};
type UiItem = {
  kind: Kind; code: string | null; name: string; desc?: string; free?: boolean;
  priceRubis?: number | null; pricePrestige?: number | null; rarity?: string; unlock?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

// On expose les mêmes 4 catégories que PC (la 5e "title" est gérée
// séparément par <TitleSelector />, mais on garde l'option ici si besoin).
const CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo",   emoji: "✨" },
  { id: "badge",    label: "Badges",   emoji: "🏷️" },
  { id: "hat",      label: "Chapeaux", emoji: "🧢" },
  { id: "frame",    label: "Cadrans",  emoji: "💬" },
];

const RARITY_ORDER: ReadonlyArray<string> = ["mythic", "legendary", "epic", "rare", "uncommon", "common", ""] as const;
const RARITY_LABEL: Record<string, string> = {
  mythic: "Mythique", legendary: "Légendaire", epic: "Épique",
  rare: "Rare", uncommon: "Peu commun", common: "Commun", "": "Autre",
};
const RARITY_COLOR: Record<string, string> = {
  mythic: "#e879f9", legendary: "#f59e0b", epic: "#a78bfa",
  rare: "#60a5fa", uncommon: "#6ee7b7", common: "rgba(220,220,255,0.55)", "": "rgba(238,238,245,0.45)",
};

// ─── Pure helpers (logique identique au PC) ──────────────────────────────────
function niceUnlock(u?: string) {
  if (!u) return "";
  if (u === "shop") return "Shop";
  if (u === "achievement") return "Succès";
  if (u === "role") return "Rôle";
  if (u === "event") return "Event";
  if (u === "system") return "Système";
  return u;
}
function parseJwt(token: string): any | null {
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { return null; }
}
async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer(); const bytes = new Uint8Array(ab);
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function makeSquareAvatar(file: File, size = 160): Promise<{ mime: string; b64: string; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url;
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("image_load_failed")); });
  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2); const sy = Math.floor((img.height - s) / 2);
  const canvas = document.createElement("canvas"); canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const blob: Blob = await new Promise(r => { canvas.toBlob(b => r(b || new Blob()), "image/webp", 0.82); });
  const finalBlob = blob && blob.size > 0 ? blob : await new Promise<Blob>(r => { canvas.toBlob(b => r(b || new Blob()), "image/jpeg", 0.85); });
  URL.revokeObjectURL(url);
  return { mime: finalBlob.type || "image/webp", b64: await blobToBase64(finalBlob), previewUrl: URL.createObjectURL(finalBlob) };
}
function rarityToTier(rarity: string) {
  const s = String(rarity || "").toLowerCase();
  if (s.includes("bronze")) return "bronze";
  if (s.includes("gold")) return "gold";
  if (s.includes("master") || s.includes("diamond")) return "master";
  return "silver";
}
function badgeTextFromCode(code: string) {
  if (code === "badge_luna") return "LUNA";
  if (code === "badge_777") return "777";
  if (code.startsWith("badge_sub_")) return "SUB";
  return code.replace(/^badge_/, "").toUpperCase();
}
function titleLabelFallback(code: string) {
  const raw = code.replace(/^title_/, "").replace(/_/g, " ").trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : code;
}
function frameIdFromCode(code: string) {
  return code.replace(/^m?frame_/, "").replace(/_(shop|event|master)$/, "");
}
function applyPreview(
  kind: Kind, code: string | null, c: any,
  opts?: { titleNames?: Record<string, string>; badgeNames?: Record<string, string> }
) {
  if (!code) return;
  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;
  if (kind === "badge") {
    const label = (code && opts?.badgeNames?.[code]) || badgeTextFromCode(code);
    c.badges = [{ id: label, code: label, text: label, label }];
    (c as any).badge = label; (c as any).badgeText = label; (c as any).badgeLabel = label;
    return;
  }
  if (kind === "hat") {
    const map: Record<string, string> = {
      hat_luna_cap:"luna_cap", hat_carton_crown:"carton_crown", hat_demon_horn:"demon_horn",
      hat_eclipse_halo:"eclipse_halo", hat_astral_helmet:"astral_helmet", hat_lotus_aureole:"lotus_aureole",
      hat_top_hat:"top_hat", hat_santa:"santa", hat_witch:"witch",
      hat_pirate:"pirate", hat_viking:"viking", hat_propeller:"propeller",
    };
    const hatId = map[code] ?? code; c.avatar.hatId = hatId;
    const EMOJI: Record<string, string> = {
      luna_cap:"🧢", carton_crown:"👑", demon_horn:"😈", eclipse_halo:"⭕", astral_helmet:"🪖", lotus_aureole:"🪷",
      top_hat:"🎩", santa:"🎅", witch:"🧙", pirate:"🏴‍☠️", viking:"⚔️", propeller:"🌀",
    };
    c.avatar.hatEmoji = EMOJI[hatId] ?? "🧢"; return;
  }
  if (kind === "username") {
    const map: Record<string, string> = {
      uanim_chroma_toggle:"chroma", uanim_gold_toggle:"gold",
      uanim_rainbow_scroll:"rainbow_scroll", uanim_neon_underline:"neon_underline",
      uanim_frost:"uanim_frost", uanim_ember:"uanim_ember",
      uanim_pulse_red:"uanim_pulse_red", uanim_pulse_blue:"uanim_pulse_blue",
      uanim_glitch:"uanim_glitch",
      uanim_fire:"uanim_fire", uanim_ice:"uanim_ice",
      uanim_silver_toggle:"uanim_silver_toggle", uanim_purple_toggle:"uanim_purple_toggle",
      uanim_gradient_sunset:"uanim_gradient_sunset", uanim_galaxy:"uanim_galaxy",
    };
    const effect = map[code] ?? code;
    c.username.effect = effect; c.username.animId = effect; c.username.anim = effect; return;
  }
  if (kind === "frame") { c.frame = { frameId: frameIdFromCode(code) }; return; }
  if (kind === "title") {
    const label = opts?.titleNames?.[code] ?? titleLabelFallback(code);
    c.title = { text: label, label }; (c as any).titleText = label; (c as any).titleLabel = label; (c as any).titleCode = code;
    return;
  }
}
function buildCosmeticsPreview(
  equipped: { username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null },
  opts?: { titleNames?: Record<string, string>; badgeNames?: Record<string, string> }
): ChatCosmetics | null {
  const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} };
  applyPreview("username", equipped?.username ?? null, c, opts);
  applyPreview("badge",    equipped?.badge ?? null,    c, opts);
  applyPreview("title",    equipped?.title ?? null,    c, opts);
  applyPreview("frame",    equipped?.frame ?? null,    c, opts);
  applyPreview("hat",      equipped?.hat ?? null,      c, opts);
  return c as ChatCosmetics;
}

// ─── Styles scoped (Purple Velvet polish) ────────────────────────────────────
const CSS = `
.psm {
  --psm-text-1: #eeeef5;
  --psm-text-2: rgba(238,238,245,0.55);
  --psm-text-3: rgba(238,238,245,0.36);
  --psm-border: rgba(124,92,252,0.18);
  --psm-surf:   #14102a;
  --psm-surf-2: #1a1535;
  --psm-acc:    #7c5cfc;
  --psm-acc-2:  #a78bfa;
  --psm-grad:   linear-gradient(135deg, rgba(167,139,250,.20), rgba(91,142,248,.14));
  --psm-ease:   cubic-bezier(.22,1,.36,1);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--psm-text-1);
}

/* ── Top : avatar + preview chat ─────────────────────────────────────── */
.psm-top {
  border-radius: 16px;
  border: 1px solid var(--psm-border);
  background: var(--psm-surf);
  padding: 14px;
  position: relative; overflow: hidden;
  box-shadow: 0 12px 32px rgba(0,0,0,.32);
}
.psm-top::before {
  content:""; position:absolute; top:0; left:8%; right:8%; height:1px;
  background: linear-gradient(90deg,transparent,rgba(167,139,250,.50) 40%,rgba(91,142,248,.32) 60%,transparent);
}

.psm-top-row {
  display: flex; align-items: flex-start; gap: 12px;
}
.psm-ava {
  width: 72px; height: 72px; border-radius: 16px; flex-shrink: 0;
  border: 2px solid rgba(124,92,252,.30); background: rgba(124,92,252,.10);
  overflow: hidden; display: grid; place-items: center;
  box-shadow: 0 6px 18px rgba(124,92,252,.20);
}
.psm-ava img { width: 100%; height: 100%; object-fit: cover; display: block; }
.psm-ava-init { font-weight: 800; font-size: 22px; color: #c4b5fd; }

.psm-ava-actions {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 6px;
}
.psm-ava-title { font-weight: 700; font-size: 13px; }
.psm-ava-sub   { font-size: 11px; color: var(--psm-text-2); }
.psm-ava-row   { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }

.psm-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 12px; border-radius: 10px;
  border: 1px solid var(--psm-border); background: var(--psm-surf-2);
  color: var(--psm-text-1); cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 700;
  -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, border-color 140ms ease, transform 120ms var(--psm-ease);
  min-height: 36px; flex: 1;
}
.psm-btn:active { transform: scale(.97); }
.psm-btn:disabled { opacity: .45; cursor: not-allowed; }
.psm-btn-primary {
  background: var(--psm-grad);
  border-color: rgba(167,139,250,.36);
  box-shadow: 0 4px 14px rgba(124,92,252,.20);
}
.psm-btn-primary:active { background: linear-gradient(135deg,rgba(167,139,250,.28),rgba(91,142,248,.20)); }
.psm-btn-danger {
  background: rgba(239,68,68,.10);
  border-color: rgba(239,68,68,.28);
  color: #fca5a5;
}

.psm-preview-block {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(124,92,252,.12);
  background: #0e0a1c;
}
.psm-preview-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  margin-bottom: 8px;
}
.psm-preview-title {
  font-weight: 700; font-size: 12px; letter-spacing: .04em; text-transform: uppercase;
  color: var(--psm-text-2);
  display: inline-flex; align-items: center; gap: 6px;
}
.psm-preview-status {
  font-size: 11px; color: var(--psm-text-2);
  display: inline-flex; align-items: center; gap: 6px;
}
.psm-pulse {
  width: 6px; height: 6px; border-radius: 999px;
  background: rgba(167,139,250,.85);
  animation: psm-pulse 1s ease-in-out infinite;
}
@keyframes psm-pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

/* ── Erreur ──────────────────────────────────────────────────────────── */
.psm-err {
  margin-top: 10px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.24);
  font-size: 12px; color: #fca5a5;
}

/* ── Catégories (pills horizontaux) ──────────────────────────────────── */
.psm-cats {
  margin-top: 14px;
  display: flex; gap: 6px; overflow-x: auto;
  -webkit-overflow-scrolling: touch; scrollbar-width: none;
  padding-bottom: 4px;
}
.psm-cats::-webkit-scrollbar { display: none; }
.psm-cat {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 9px 14px; border-radius: 12px;
  border: 1px solid var(--psm-border);
  background: var(--psm-surf);
  color: var(--psm-text-2);
  font-family: inherit; font-size: 12px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 120ms var(--psm-ease);
}
.psm-cat:active { transform: scale(.97); }
.psm-cat.active {
  background: var(--psm-grad);
  border-color: rgba(167,139,250,.40);
  color: var(--psm-text-1);
  box-shadow: 0 4px 14px rgba(124,92,252,.20);
}
.psm-cat-emoji { font-size: 14px; }
.psm-cat-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 18px; padding: 0 6px;
  border-radius: 999px;
  background: rgba(0,0,0,.30); color: var(--psm-text-2);
  font-size: 10px; font-weight: 800;
}
.psm-cat.active .psm-cat-count { background: rgba(255,255,255,.10); color: var(--psm-text-1); }

/* ── Toolbar : search + filter chips ─────────────────────────────────── */
.psm-tools {
  margin-top: 10px;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.psm-search {
  flex: 1 1 140px; min-width: 0;
  display: flex; align-items: center; gap: 6px;
  padding: 9px 12px; border-radius: 11px;
  border: 1px solid var(--psm-border); background: var(--psm-surf);
}
.psm-search:focus-within {
  border-color: rgba(167,139,250,.55);
  box-shadow: 0 0 0 3px rgba(124,92,252,.12);
}
.psm-search-icon { font-size: 13px; color: var(--psm-text-2); }
.psm-search-input {
  flex: 1; min-width: 0;
  border: 0; outline: none; background: transparent;
  color: var(--psm-text-1); font: inherit; font-size: 13px;
}
.psm-search-input::placeholder { color: var(--psm-text-3); }
.psm-search-clear {
  background: transparent; border: 0; padding: 0;
  color: var(--psm-text-2); cursor: pointer;
  font-size: 12px; width: 18px; height: 18px;
  display: grid; place-items: center; border-radius: 999px;
}
.psm-chip {
  padding: 7px 11px; border-radius: 999px;
  border: 1px solid var(--psm-border); background: var(--psm-surf);
  color: var(--psm-text-2);
  font-family: inherit; font-size: 11px; font-weight: 700;
  cursor: pointer; -webkit-tap-highlight-color: transparent;
  transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
}
.psm-chip.active {
  background: rgba(124,92,252,.18); border-color: rgba(167,139,250,.40); color: var(--psm-text-1);
}

.psm-counter {
  margin-left: auto;
  font-size: 11px; color: var(--psm-text-2); font-weight: 600;
}

/* ── Sections par rareté ─────────────────────────────────────────────── */
.psm-rarity {
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid var(--psm-border);
  background: rgba(13,11,24,.55);
  overflow: hidden;
}
.psm-rarity-head {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 11px 14px;
  background: transparent; border: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  font-family: inherit;
}
.psm-rarity-dot { width: 8px; height: 8px; border-radius: 999px; flex-shrink: 0; }
.psm-rarity-name {
  font-weight: 800; font-size: 12px; letter-spacing: .06em; text-transform: uppercase;
}
.psm-rarity-count { font-size: 11px; color: var(--psm-text-2); font-weight: 600; }
.psm-rarity-line { flex: 1; height: 1px; background: rgba(255,255,255,.06); }
.psm-rarity-chev {
  font-size: 12px; color: var(--psm-text-2);
  transition: transform 200ms var(--psm-ease);
}
.psm-rarity[open] .psm-rarity-chev { transform: rotate(90deg); }
.psm-rarity-body { padding: 0 10px 10px; display: grid; gap: 8px; }

/* ── Item card ───────────────────────────────────────────────────────── */
.psm-item {
  display: block; width: 100%; text-align: left;
  border-radius: 12px; padding: 12px;
  border: 1px solid var(--psm-border);
  background: var(--psm-surf);
  color: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 130ms var(--psm-ease), border-color 140ms ease, box-shadow 140ms ease;
}
.psm-item:active { transform: scale(.99); }
.psm-item:disabled { cursor: not-allowed; }
.psm-item.is-equipped {
  border-color: rgba(167,139,250,.50);
  background: linear-gradient(135deg, rgba(124,92,252,.18), rgba(91,142,248,.10));
  box-shadow: 0 8px 22px rgba(124,92,252,.20);
}
.psm-item.is-locked {
  background: rgba(13,11,24,.55);
  opacity: .60;
}

.psm-item-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-bottom: 8px;
}
.psm-item-name {
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 700; font-size: 13.5px; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.psm-status {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 999px;
  font-size: 10.5px; font-weight: 700; white-space: nowrap;
  flex-shrink: 0;
}
.psm-status.s-equipped { background: rgba(16,185,129,.14); border: 1px solid rgba(16,185,129,.28); color: #34d399; }
.psm-status.s-free     { background: rgba(124,92,252,.14); border: 1px solid rgba(124,92,252,.28); color: #c4b5fd; }
.psm-status.s-owned    { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.10); color: var(--psm-text-2); }
.psm-status.s-locked   { background: rgba(239,68,68,.10); border: 1px solid rgba(239,68,68,.22); color: #f87171; }

.psm-item-preview {
  margin: 4px 0 6px; pointer-events: none;
}

.psm-item-foot {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  margin-top: 8px;
  font-size: 11px; color: var(--psm-text-2);
}
.psm-item-cta {
  font-weight: 700; font-size: 11.5px;
  color: rgba(196,181,253,.95);
  display: inline-flex; align-items: center; gap: 4px;
}
.psm-item.is-equipped .psm-item-cta { color: #34d399; }

/* ── Empty / loading states ──────────────────────────────────────────── */
.psm-empty {
  margin-top: 12px;
  padding: 26px 14px; text-align: center;
  border-radius: 12px;
  border: 1px dashed var(--psm-border); background: rgba(13,11,24,.40);
  color: var(--psm-text-2); font-size: 13px;
}
.psm-skel {
  height: 96px; border-radius: 12px;
  background: linear-gradient(90deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 100%);
  background-size: 200% 100%; animation: psm-skel 1.6s ease-in-out infinite;
}
@keyframes psm-skel { 0% { background-position: 100% 50%; } 100% { background-position: -100% 50%; } }
`;

let _cssInjected = false;
function useStyles() {
  React.useEffect(() => {
    if (_cssInjected) return;
    const el = document.createElement("style");
    el.id = "psm-css"; el.textContent = CSS;
    document.head.appendChild(el);
    _cssInjected = true;
  }, []);
}

function StatusBadge({ kind }: { kind: "equipped" | "free" | "owned" | "locked" }) {
  if (kind === "equipped") return <span className="psm-status s-equipped">✅ Équipé</span>;
  if (kind === "free")     return <span className="psm-status s-free">🎁 Gratuit</span>;
  if (kind === "owned")    return <span className="psm-status s-owned">🧾 Possédé</span>;
  return <span className="psm-status s-locked">🔒</span>;
}

function renderItemName(it: UiItem) {
  if (it.kind === "badge" && it.code) {
    const tier = rarityToTier(it.rarity || "");
    const label = it.name || badgeTextFromCode(it.code);
    return <span className={`chatBadge badge--${tier}`}>{label}</span>;
  }
  return <span>{it.name}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PersonalisationSectionMobile({
  username,
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  username: string;
  streamerAppearance?: StreamerAppearance;
}) {
  useStyles();
  const { token } = useAuth();
  const me = React.useMemo(() => (token ? parseJwt(token) : null), [token]);
  const myUserId = Number(me?.id || 0);

  // Avatar state
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl]         = React.useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarPayload, setAvatarPayload] = React.useState<{ mime: string; b64: string } | null>(null);
  const [avatarBusy, setAvatarBusy]       = React.useState(false);

  // Tabs / data
  const [tab, setTab]         = React.useState<Kind>("username");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving]   = React.useState(false);
  const [err, setErr]         = React.useState<string | null>(null);
  const [filterMode, setFilterMode] = React.useState<"all" | "owned" | "locked">("all");
  const [searchQ, setSearchQ]       = React.useState("");

  const [catalog, setCatalog] = React.useState<ApiCatalogItem[]>([]);
  const [owned, setOwned]     = React.useState<Record<string, string[]>>({});
  const [free, setFree]       = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{
    username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null;
  }>({ username: null, badge: null, title: null, frame: null, hat: null });

  React.useEffect(() => {
    if (!myUserId) return;
    setAvatarUrl(`${API_BASE}/avatars/u/${myUserId}?v=${Date.now()}`);
  }, [myUserId]);

  async function load() {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const [c, m] = await Promise.all([cosmeticsCatalog(token), myCosmetics(token)]);
      if (!c?.ok) throw new Error("catalog_failed");
      if (!m?.ok) throw new Error((m as any)?.error || "load_failed");
      setCatalog(((c as any).items || []).filter((x: any) => x && x.active));
      setOwned(m.owned || {}); setFree(m.free || {}); setEquipped(m.equipped || {});
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  async function doEquip(kind: Kind, code: string | null) {
    if (!token) return;
    setSaving(true); setErr(null);
    try {
      const cur = (equipped as any)?.[kind] ?? null;
      const next = cur === code ? null : code;
      const j = await equipCosmetic(token, kind, next);
      if (!j?.ok) throw new Error(j?.error || "equip_failed");
      setEquipped(prev => ({ ...(prev || {}), ...(j.equipped || {}) }));
      if (next) void trackFeatureEvent(token, { kind: "profile_style_action", subject: `equip:${kind}` });
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setSaving(false); }
  }

  React.useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const titleNames = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const it of catalog) if (it?.kind === "title" && it.code && it.name) m[it.code] = it.name;
    return m;
  }, [catalog]);
  const badgeNames = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const it of catalog) if (it?.kind === "badge" && it.code && it.name) m[it.code] = it.name;
    return m;
  }, [catalog]);

  // Compteur owned/total par catégorie (affiché dans les pills)
  const catCounts = React.useMemo(() => {
    const out: Record<Kind, { owned: number; total: number }> = {
      username: { owned: 0, total: 0 }, badge: { owned: 0, total: 0 },
      hat: { owned: 0, total: 0 }, frame: { owned: 0, total: 0 }, title: { owned: 0, total: 0 },
    };
    for (const c of CATS) {
      const k = c.id;
      const o = new Set<string>([...(owned?.[k] || []), ...(free?.[k] || [])]);
      const total = catalog.filter(x => x.kind === k).length + 1; // +1 pour "Aucun/Par défaut"
      const ownedCount = catalog.filter(x => x.kind === k && o.has(x.code)).length + 1;
      out[k] = { owned: ownedCount, total };
    }
    return out;
  }, [catalog, owned, free]);

  const ownedSet = React.useMemo(
    () => new Set<string>([...(owned?.[tab] || []), ...(free?.[tab] || [])]),
    [owned, free, tab]
  );

  const allItems: UiItem[] = React.useMemo(() => {
    return [
      {
        kind: tab, code: null,
        name: tab === "username" ? "Par défaut" : "Aucun",
        free: true, desc: "Retirer l'élément actif.", rarity: "common",
      },
      ...catalog.filter(x => x.kind === tab).map(x => {
        const pricePrestige = Number((x as any).pricePrestige ?? 0) || null;
        const desc = x.unlock === "shop"
          ? x.priceRubis ? `${Number(x.priceRubis).toLocaleString("fr-FR")} rubis`
            : pricePrestige ? `${Number(pricePrestige).toLocaleString("fr-FR")} prestige` : "Shop"
          : `${niceUnlock(x.unlock)}${x.rarity ? ` — ${x.rarity}` : ""}`;
        return { kind: x.kind, code: x.code, name: x.name, desc, priceRubis: x.priceRubis, pricePrestige, rarity: x.rarity, unlock: x.unlock };
      }),
    ];
  }, [catalog, tab]);

  const q = searchQ.toLowerCase().trim();
  const filteredItems = React.useMemo(() => allItems.filter(it => {
    if (q && !it.name.toLowerCase().includes(q)) return false;
    const isOwned = !!it.free || (it.code != null && ownedSet.has(it.code));
    if (filterMode === "owned") return isOwned;
    if (filterMode === "locked") return !isOwned && !it.free;
    return true;
  }), [allItems, q, filterMode, ownedSet]);

  // Group by rarity
  const byRarity = React.useMemo(() => {
    const out: Record<string, UiItem[]> = {};
    for (const r of RARITY_ORDER) out[r] = [];
    for (const it of filteredItems) {
      const r = it.rarity ?? "";
      if (out[r] != null) out[r].push(it);
      else out[""].push(it);
    }
    return out;
  }, [filteredItems]);

  const totalOwnedCurrentTab = allItems.filter(it => !!it.free || (it.code != null && ownedSet.has(it.code))).length;

  function withAvatar<C extends ChatCosmetics | null>(c: C): C {
    if (!c) return c;
    return { ...(c as any), avatar: { ...((c as any).avatar || {}), url: avatarUrl || undefined } } as any as C;
  }
  const previewCosmetics = withAvatar(buildCosmeticsPreview(equipped, { titleNames, badgeNames }));
  function previewForItem(it: UiItem): ChatCosmetics | null {
    const simulated = {
      username: tab === "username" ? it.code : equipped.username,
      badge:    tab === "badge"    ? it.code : equipped.badge,
      title:    tab === "title"    ? it.code : equipped.title,
      frame:    tab === "frame"    ? it.code : equipped.frame,
      hat:      tab === "hat"      ? it.code : equipped.hat,
    };
    return withAvatar(buildCosmeticsPreview(simulated, { titleNames, badgeNames }));
  }

  // Avatar handlers
  async function uploadAvatar() {
    if (!token || !avatarPayload) return;
    setAvatarBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/me/avatar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mime: avatarPayload.mime, data: avatarPayload.b64 }),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error || "upload_failed");
      setAvatarUrl(String(j?.avatarUrl || `${API_BASE}/avatars/u/${myUserId}?v=${Date.now()}`));
      void trackFeatureEvent(token, { kind: "profile_style_action", subject: "avatar_upload" });
      setAvatarPayload(null);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarPreview(null);
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setAvatarBusy(false); }
  }
  async function deleteAvatar() {
    if (!token) return;
    setAvatarBusy(true); setErr(null);
    try {
      const r = await fetch(`${API_BASE}/me/avatar`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (j?.ok !== true) throw new Error(j?.error || "delete_failed");
      setAvatarUrl(null);
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setAvatarBusy(false); }
  }
  function cancelAvatarPick() {
    setAvatarPayload(null);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
  }

  return (
    <div className="psm" data-no-swipe="1">
      {/* ═══════════════════════════════════════════════
          HEADER : Avatar + actions + Live preview
      ═══════════════════════════════════════════════ */}
      <div className="psm-top">
        <div className="psm-top-row">
          <div className="psm-ava" aria-hidden>
            {(avatarPreview || avatarUrl) ? (
              <img
                src={avatarPreview || `${avatarUrl}`}
                alt=""
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <span className="psm-ava-init">{getInitials(username)}</span>
            )}
          </div>
          <div className="psm-ava-actions">
            <div className="psm-ava-title">🖼️ Avatar</div>
            <div className="psm-ava-sub">Carré 1:1 — auto-recadrage</div>
            <div className="psm-ava-row">
              <button
                type="button"
                className="psm-btn"
                disabled={!token || avatarBusy}
                onClick={() => fileRef.current?.click()}
              >
                {avatarPayload ? "🪄 Changer" : "⬆️ Uploader"}
              </button>
              {avatarPayload ? (
                <>
                  <button type="button" className="psm-btn psm-btn-primary" disabled={!token || avatarBusy} onClick={uploadAvatar}>
                    {avatarBusy ? "…" : "✅ Valider"}
                  </button>
                  <button type="button" className="psm-btn" disabled={avatarBusy} onClick={cancelAvatarPick} aria-label="Annuler">
                    ✕
                  </button>
                </>
              ) : (
                avatarUrl ? (
                  <button type="button" className="psm-btn psm-btn-danger" disabled={!token || avatarBusy} onClick={deleteAvatar}>
                    🗑️ Supprimer
                  </button>
                ) : null
              )}
            </div>
          </div>
        </div>

        <input
          ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            setErr(null); setAvatarBusy(true);
            try {
              const { mime, b64, previewUrl } = await makeSquareAvatar(f, 160);
              setAvatarPayload({ mime, b64 });
              if (avatarPreview) URL.revokeObjectURL(avatarPreview);
              setAvatarPreview(previewUrl);
            } catch (err: any) { setErr(String(err?.message || "avatar_prepare_failed")); }
            finally { setAvatarBusy(false); }
          }}
        />

        {/* Live preview chat bubble */}
        <div
          className="psm-preview-block"
          style={(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any)}
        >
          <div className="psm-preview-head">
            <span className="psm-preview-title">✨ Aperçu live</span>
            <span className="psm-preview-status">
              {(saving || loading) ? <span className="psm-pulse" aria-hidden /> : null}
              {saving ? "Enregistrement…" : loading ? "Chargement…" : "Rendu en temps réel"}
            </span>
          </div>
          <ChatMessageBubble
            streamerAppearance={streamerAppearance}
            msg={{
              id: "preview", userId: myUserId || 0, username,
              body: "Exemple — comment ça rend ?",
              createdAt: new Date().toISOString(), cosmetics: previewCosmetics,
            }}
          />
        </div>

        {err && <div className="psm-err">⚠️ {err}</div>}
      </div>

      {/* ═══════════════════════════════════════════════
          ONGLETS CATÉGORIES + compteurs
      ═══════════════════════════════════════════════ */}
      <div className="psm-cats" role="tablist" aria-label="Catégorie">
        {CATS.map((c) => {
          const active = tab === c.id;
          const cc = catCounts[c.id];
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`psm-cat${active ? " active" : ""}`}
              onClick={() => { setTab(c.id); setSearchQ(""); setFilterMode("all"); }}
              disabled={loading || saving}
            >
              <span className="psm-cat-emoji" aria-hidden>{c.emoji}</span>
              <span>{c.label}</span>
              <span className="psm-cat-count" aria-hidden>{cc.owned}/{cc.total}</span>
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════
          TOOLBAR : recherche + filtres
      ═══════════════════════════════════════════════ */}
      <div className="psm-tools">
        <div className="psm-search">
          <span className="psm-search-icon" aria-hidden>🔍</span>
          <input
            type="search" inputMode="search" autoComplete="off" spellCheck={false}
            className="psm-search-input"
            placeholder="Rechercher un élément…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            aria-label="Rechercher"
          />
          {searchQ ? (
            <button type="button" className="psm-search-clear" onClick={() => setSearchQ("")} aria-label="Effacer">✕</button>
          ) : null}
        </div>
        {(["all", "owned", "locked"] as const).map(f => (
          <button
            key={f} type="button"
            className={`psm-chip${filterMode === f ? " active" : ""}`}
            onClick={() => setFilterMode(f)}
          >
            {f === "all" ? "Tous" : f === "owned" ? "Débloqués" : "Verrouillés"}
          </button>
        ))}
        <div className="psm-counter" aria-live="polite">
          {totalOwnedCurrentTab}/{allItems.length} débloqués
        </div>
      </div>

      {/* ═══════════════════════════════════════════════
          LISTE GROUPÉE PAR RARETÉ (sections repliables)
      ═══════════════════════════════════════════════ */}
      {loading && allItems.length <= 1 ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {[0,1,2].map(i => <div key={i} className="psm-skel" style={{ animationDelay: `${i * 100}ms` }} />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="psm-empty">
          {searchQ.trim() ? `Aucun résultat pour « ${searchQ} »` : "Aucun élément dans cette vue."}
        </div>
      ) : (
        RARITY_ORDER.map((rarity) => {
          const group = byRarity[rarity];
          if (!group || group.length === 0) return null;
          const ownedInGroup = group.filter(it => !!it.free || (it.code != null && ownedSet.has(it.code))).length;
          const color = RARITY_COLOR[rarity] ?? "rgba(238,238,245,0.45)";

          return (
            <details key={rarity} open className="psm-rarity">
              <summary
                className="psm-rarity-head"
                style={{ color }}
                // <details> uses summary natively; we just style it
              >
                <span className="psm-rarity-dot" style={{ background: color }} aria-hidden />
                <span className="psm-rarity-name">{RARITY_LABEL[rarity] ?? rarity}</span>
                <span className="psm-rarity-count">{ownedInGroup}/{group.length}</span>
                <span className="psm-rarity-line" aria-hidden />
                <span className="psm-rarity-chev" aria-hidden>›</span>
              </summary>
              <div className="psm-rarity-body">
                {group.map(it => {
                  const isEquipped = (equipped as any)?.[tab] === it.code;
                  const isOwned    = !!it.free || (it.code != null && ownedSet.has(it.code));
                  const locked     = !isOwned;
                  const cardPreview = previewForItem(it);
                  const statusKind = isEquipped ? "equipped" : it.free ? "free" : isOwned ? "owned" : "locked";

                  return (
                    <button
                      key={`${it.kind}:${String(it.code)}`}
                      type="button"
                      className={`psm-item${isEquipped ? " is-equipped" : ""}${locked ? " is-locked" : ""}`}
                      onClick={() => isOwned ? doEquip(it.kind, it.code) : undefined}
                      disabled={!token || loading || saving || !isOwned}
                      title={!isOwned ? `Non possédé — source : ${niceUnlock(it.unlock)}` : isEquipped ? "Toucher pour retirer" : "Toucher pour équiper"}
                    >
                      <div className="psm-item-head">
                        <span className="psm-item-name">{renderItemName(it)}</span>
                        <StatusBadge kind={statusKind as any} />
                      </div>

                      <div
                        className="psm-item-preview"
                        style={(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any)}
                      >
                        <ChatMessageBubble
                          streamerAppearance={streamerAppearance}
                          msg={{
                            id: `cp:${it.kind}:${String(it.code)}`,
                            userId: myUserId || 0, username,
                            body: "…", createdAt: new Date().toISOString(),
                            cosmetics: cardPreview,
                          }}
                        />
                      </div>

                      <div className="psm-item-foot">
                        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.unlock === "shop" ? "🛍️ " : ""}{it.desc || ""}
                        </span>
                        {isOwned ? (
                          <span className="psm-item-cta">
                            {isEquipped ? "Retirer" : "Équiper →"}
                          </span>
                        ) : (
                          <span className="psm-item-cta" style={{ color: "rgba(248,113,113,.85)" }}>
                            🔒 {niceUnlock(it.unlock) || "Verrouillé"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })
      )}
    </div>
  );
}

export default PersonalisationSectionMobile;
