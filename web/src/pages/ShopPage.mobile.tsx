// web/src/pages/ShopPage.mobile.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET MOBILE-FIRST — ShopPage
//  UX : snap scroll, cards XL, preview lisible, sheet draggable
// ══════════════════════════════════════════════════════════════
import * as React from "react";
import { useAuth } from "../auth/AuthProvider";
import { ChatMessageBubble } from "../components/chat/ChatMessageBubble";
import type { ChatCosmetics } from "../lib/cosmetics";
import {
  DEFAULT_APPEARANCE as DEFAULT_STREAMER_APPEARANCE,
  type StreamerAppearance,
} from "../lib/appearance";
import { buyShopCosmetic, shopCosmetics, type ShopCosmeticItem } from "../lib/api";
import { shopTalents, buyTalent, type ApiTalentItem } from "../lib/api";
import { billingCheckout, billingPortal } from "../lib/api_billing";

type Kind = "username" | "badge" | "title" | "frame" | "hat";
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

/* ── Helpers (identiques) ── */
function withAvatar<C extends ChatCosmetics | null>(c: C, userId: number | null | undefined): C {
  if (!c) return c;
  const uid = Number(userId || 0); if (!uid) return c;
  const url = `${API_BASE}/avatars/u/${uid}?v=${Date.now()}`;
  return ({ ...(c as any), avatar: { ...((c as any).avatar || {}), url } } as any) as C;
}
const TOP_TABS = [
  { id: "skins", label: "Skins", icon: "✨" },
  { id: "upgrades", label: "Talents", icon: "⚡" },
  { id: "subs", label: "Abos", icon: "⭐" },
  { id: "rubis", label: "Rubis", icon: "💎" },
] as const;
const SKIN_CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo", emoji: "✨" },
  { id: "badge", label: "Badges", emoji: "🏷️" },
  { id: "hat", label: "Chapeaux", emoji: "🧢" },
  { id: "frame", label: "Cadrans", emoji: "💬" },
  { id: "title", label: "Titres", emoji: "🏆" },
];
const TITLE_LABELS: Record<string, string> = { title_ratus: "Ratus", title_ca_tourne: "Ça tourne !", title_vrai_viewer: "Vrai Viewer", title_no_life: "No Life", title_batman: "Batman", title_bigmoula: "BigMoula", title_lunaking: "LunaKing", title_allin_man: "All-in Man" };
function titleLabelFromCode(code: string) { if (TITLE_LABELS[code]) return TITLE_LABELS[code]; if (code.startsWith("title_")) return code.replace(/^title_/, "").replace(/_/g, " "); return code; }
function frameIdFromCode(code: string) { return String(code || "").replace(/^m?frame_/, "").replace(/_(shop|event|master)$/, ""); }
function applyPreview(kind: Kind, code: string | null, c: any) {
  if (!code) return; if (!c.avatar) c.avatar = {}; if (!c.username) c.username = {}; if (!Array.isArray(c.badges)) c.badges = []; if (c.title === undefined) c.title = null;
  if (kind === "badge") { const txt = code === "badge_luna" ? "LUNA" : code === "badge_777" ? "777" : code; c.badges = [{ id: txt, code: txt, text: txt, label: txt }]; (c as any).badge = txt; (c as any).badgeText = txt; (c as any).badgeLabel = txt; return; }
  if (kind === "hat") { const map: Record<string, string> = { hat_luna_cap: "luna_cap", hat_carton_crown: "carton_crown", hat_demon_horn: "demon_horn", hat_eclipse_halo: "eclipse_halo", hat_astral_helmet: "astral_helmet", hat_lotus_aureole: "lotus_aureole" }; const hatId = map[code] ?? code; c.avatar.hatId = hatId; const EMOJI: Record<string, string> = { luna_cap: "🧢", carton_crown: "👑", demon_horn: "😈", eclipse_halo: "⭕", astral_helmet: "🪖", lotus_aureole: "🪷" }; c.avatar.hatEmoji = EMOJI[hatId] ?? "🧢"; return; }
  if (kind === "username") { const map: Record<string, string> = { uanim_chroma_toggle: "chroma", uanim_gold_toggle: "gold", uanim_rainbow_scroll: "rainbow_scroll", uanim_neon_underline: "neon_underline" }; const effect = map[code] ?? code; c.username.effect = effect; c.username.animId = effect; c.username.anim = effect; return; }
  if (kind === "frame") { c.frame = { frameId: frameIdFromCode(code) }; return; }
  if (kind === "title") { const label = titleLabelFromCode(code); c.title = { text: label, label }; (c as any).titleText = label; return; }
}
function rarityToTier(rarity: string) { const s = String(rarity || "").toLowerCase(); if (s.includes("bronze")) return "bronze"; if (s.includes("gold")) return "gold"; if (s.includes("master") || s.includes("diamond")) return "master"; return "silver"; }
function badgeTextFromCode(code: string) { if (code === "badge_luna") return "LUNA"; if (code === "badge_777") return "777"; if (code.startsWith("badge_")) return code.replace(/^badge_/, "").toUpperCase(); return code.toUpperCase(); }
function kindEmoji(kind: Kind) { if (kind === "username") return "✨"; if (kind === "badge") return "🏷️"; if (kind === "hat") return "🧢"; if (kind === "frame") return "💬"; if (kind === "title") return "🏆"; return "🎁"; }
function buildCosmeticsPreview(equipped: { username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null }): ChatCosmetics | null { const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} }; applyPreview("username", equipped?.username ?? null, c); applyPreview("badge", equipped?.badge ?? null, c); applyPreview("title", equipped?.title ?? null, c); applyPreview("frame", equipped?.frame ?? null, c); applyPreview("hat", equipped?.hat ?? null, c); return c as ChatCosmetics; }
function sortByPriceAsc(a: ShopCosmeticItem, b: ShopCosmeticItem) { const ar = a.priceRubis == null ? Number.POSITIVE_INFINITY : Number(a.priceRubis); const br = b.priceRubis == null ? Number.POSITIVE_INFINITY : Number(b.priceRubis); const ap = (a as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((a as any).pricePrestige); const bp = (b as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((b as any).pricePrestige); const aGroup = ar !== Number.POSITIVE_INFINITY ? 0 : ap !== Number.POSITIVE_INFINITY ? 1 : 2; const bGroup = br !== Number.POSITIVE_INFINITY ? 0 : bp !== Number.POSITIVE_INFINITY ? 1 : 2; if (aGroup !== bGroup) return aGroup - bGroup; const aPrice = aGroup === 0 ? ar : aGroup === 1 ? ap : Number.POSITIVE_INFINITY; const bPrice = bGroup === 0 ? br : bGroup === 1 ? bp : Number.POSITIVE_INFINITY; if (aPrice !== bPrice) return aPrice - bPrice; return a.name.localeCompare(b.name); }
function normalizeOwnedRecord(x: any): Record<string, string[]> { if (!x) return {}; if (typeof x === "object" && !Array.isArray(x)) return x as Record<string, string[]>; return {}; }
function isStreamerRole(role?: string) { const r = String(role || "").toLowerCase(); return r === "streamer" || r === "admin_streamer" || r.includes("streamer"); }

/* ── CSS ── */
const SHOP_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');

.shop-root {
  position:relative; min-height:100svh; padding:0 0 80px; overflow-x:hidden;
  font-family:'Manrope',sans-serif;
}
.shop-root::before {
  content:""; position:absolute; inset:0; pointer-events:none; z-index:0;
  background:
    radial-gradient(900px 420px at 12% 0%, rgba(124,92,252,.18), transparent 62%),
    radial-gradient(900px 420px at 88% 10%, rgba(91,142,248,.16), transparent 62%);
}

/* Header sticky */
.shop-header {
  position:sticky; top:0; z-index:20; padding:16px 16px 12px;
  background:linear-gradient(180deg, rgba(11,9,22,.98), rgba(11,9,22,.94));
  backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
  border-bottom:1px solid rgba(124,92,252,.10);
}
.shop-title {
  font-weight:800; font-size:26px; letter-spacing:-.8px; line-height:1.1;
  background:linear-gradient(105deg,#c4b5fd,#7c5cfc,#5b8ef8);
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.shop-balance {
  margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;
}
.shop-chip {
  padding:8px 12px; border-radius:999px; font-size:12px; font-weight:800;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.08);
  color:rgba(196,181,253,.85); white-space:nowrap;
}
.shop-refresh {
  width:40px; height:40px; border-radius:12px; display:grid; place-items:center;
  border:1px solid rgba(124,92,252,.22); background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85); cursor:pointer; transition:all 130ms ease;
}
.shop-refresh:hover { background:rgba(124,92,252,.18); }
.shop-refresh:disabled { opacity:.40; cursor:not-allowed; }

/* Tabs snap scroll */
.shop-tabs {
  position:sticky; top:72px; z-index:19; display:flex; gap:8px; padding:12px 16px;
  overflow-x:auto; overflow-y:hidden; scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch; scrollbar-width:none;
  background:linear-gradient(180deg, rgba(11,9,22,.96), rgba(11,9,22,.92));
  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(124,92,252,.08);
}
.shop-tabs::-webkit-scrollbar { display:none; }
.shop-tab {
  flex:0 0 auto; scroll-snap-align:start; padding:10px 18px; border-radius:999px;
  font-weight:800; font-size:13px; white-space:nowrap; cursor:pointer;
  border:1px solid rgba(124,92,252,.18); background:rgba(124,92,252,.06);
  color:rgba(196,181,253,.80); transition:all 140ms ease; min-width:100px;
  display:flex; align-items:center; justify-content:center; gap:8px;
}
.shop-tab:active { transform:scale(.96); }
.shop-tab.active {
  border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.18);
  color:rgba(235,232,255,.95); box-shadow:0 0 16px rgba(124,92,252,.20);
}

/* Content */
.shop-content { padding:16px; position:relative; z-index:1; }
.shop-section-title {
  font-weight:800; font-size:16px; color:rgba(235,232,255,.92);
  margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;
}
.shop-hint {
  padding:12px 14px; border-radius:14px; font-size:12px; font-weight:700;
  border:1px solid rgba(239,68,68,.26); background:rgba(239,68,68,.10);
  color:rgba(252,165,165,.90); margin-bottom:12px;
}

/* Categories snap scroll */
.shop-cats {
  display:flex; gap:8px; margin-bottom:16px; overflow-x:auto; overflow-y:hidden;
  scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; scrollbar-width:none;
  padding-bottom:4px;
}
.shop-cats::-webkit-scrollbar { display:none; }
.shop-cat {
  flex:0 0 auto; scroll-snap-align:start; padding:12px 16px; border-radius:999px;
  font-weight:800; font-size:13px; white-space:nowrap; cursor:pointer;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.05);
  color:rgba(196,181,253,.75); transition:all 140ms ease;
  display:flex; align-items:center; gap:10px; min-width:120px;
}
.shop-cat:active { transform:scale(.96); }
.shop-cat.active {
  border-color:rgba(124,92,252,.36); background:rgba(124,92,252,.16);
  color:rgba(235,232,255,.92);
}

/* Cards XL tactiles */
.shop-grid { display:flex; flex-direction:column; gap:14px; }
.shop-mobile-empty{min-height:230px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;border:1px dashed rgba(196,181,253,.16);border-radius:16px;background:radial-gradient(220px 140px at 50% 42%,rgba(124,92,252,.1),transparent 72%)}
.shop-mobile-empty strong{color:#eee8f6;font-size:14px}.shop-mobile-empty span{max-width:300px;margin-top:7px;color:#8b8097;font-size:11px;line-height:1.5}
.shop-card {
  padding:16px; border-radius:18px; border:1px solid rgba(124,92,252,.14);
  background:rgba(11,9,22,.88); backdrop-filter:blur(12px);
  box-shadow:0 16px 48px rgba(0,0,0,.30); position:relative; overflow:hidden;
  transition:all 140ms ease;
}
.shop-card::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.24) 40%,rgba(91,142,248,.16) 60%,transparent);
  pointer-events:none;
}
.shop-card:active { transform:scale(.98); }
.shop-card.locked { opacity:.60; }

.shop-card-header {
  display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
  margin-bottom:14px;
}
.shop-card-title {
  display:flex; align-items:center; gap:10px; min-width:0;
}
.shop-card-icon {
  width:36px; height:36px; border-radius:12px; display:grid; place-items:center;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.10);
  font-size:18px; flex-shrink:0;
}
.shop-card-name {
  font-weight:800; font-size:15px; color:rgba(235,232,255,.92);
  line-height:1.25; min-width:0; overflow:hidden; text-overflow:ellipsis;
}

.shop-badge {
  padding:6px 11px; border-radius:999px; font-size:11px; font-weight:800;
  border:1px solid rgba(124,92,252,.16); background:rgba(124,92,252,.06);
  color:rgba(196,181,253,.75); white-space:nowrap; flex-shrink:0;
}
.shop-badge.owned {
  border-color:rgba(124,92,252,.24); background:rgba(124,92,252,.12);
  color:rgba(196,181,253,.85);
}
.shop-badge.equipped {
  border-color:rgba(52,211,153,.28); background:rgba(52,211,153,.12);
  color:rgba(110,231,183,.90);
}
.shop-badge.price {
  border-color:rgba(251,191,36,.26); background:rgba(251,191,36,.10);
  color:rgba(253,230,138,.90);
}

/* Preview XL lisible */
.shop-preview {
  padding:14px; border-radius:14px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.04); margin-bottom:14px; min-height:80px;
}

/* Actions touch 48px+ */
.shop-actions { display:flex; gap:10px; justify-content:flex-end; }
.shop-btn {
  min-height:44px; padding:0 18px; border-radius:12px; font-weight:800; font-size:13px;
  border:1px solid rgba(124,92,252,.22); background:rgba(124,92,252,.10);
  color:rgba(196,181,253,.85); cursor:pointer; transition:all 140ms ease;
}
.shop-btn:active { transform:scale(.96); }
.shop-btn:disabled { opacity:.40; cursor:not-allowed; }
.shop-btn.primary {
  border-color:rgba(124,92,252,.40); background:rgba(124,92,252,.20);
  color:rgba(235,232,255,.95);
}

/* Talents */
.talent-card {
  padding:14px; border-radius:14px; border:1px solid rgba(124,92,252,.12);
  background:rgba(124,92,252,.05); display:flex; align-items:center;
  justify-content:space-between; gap:12px; margin-bottom:10px;
}
.talent-info { display:flex; gap:12px; align-items:center; min-width:0; }
.talent-icon { font-size:24px; flex-shrink:0; }
.talent-name { font-weight:800; font-size:14px; color:rgba(235,232,255,.92); }
.talent-desc { font-size:12px; color:rgba(167,139,250,.70); line-height:1.3; margin-top:4px; }
.talent-right { display:flex; flex-direction:column; align-items:flex-end; gap:8px; }
.talent-level { font-size:11px; font-weight:800; color:rgba(196,181,253,.75); }

/* Subs */
.sub-card {
  padding:16px; border-radius:16px; border:1px solid rgba(124,92,252,.14);
  background:rgba(124,92,252,.06); margin-bottom:12px;
}
.sub-header {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  margin-bottom:12px;
}
.sub-info { display:flex; align-items:center; gap:12px; min-width:0; }
.sub-icon { font-size:26px; }
.sub-title { font-weight:800; font-size:15px; color:rgba(235,232,255,.92); }
.sub-price { font-size:11px; color:rgba(167,139,250,.70); margin-top:4px; }
.sub-details {
  border-radius:12px; border:1px solid rgba(124,92,252,.10);
  background:rgba(124,92,252,.04); padding:12px; margin-bottom:8px;
}
.sub-details summary {
  font-weight:800; font-size:13px; color:rgba(235,232,255,.85);
  cursor:pointer; list-style:none; display:flex; justify-content:space-between;
}
.sub-details summary::after { content:"▼"; font-size:11px; opacity:.6; }
.sub-details[open] summary::after { content:"▲"; }
.sub-points {
  margin:10px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:8px;
}
.sub-points li { font-size:12px; color:rgba(235,232,255,.80); line-height:1.4; }

/* Bottom sheet draggable */
.sheet-overlay {
  position:fixed; inset:0; z-index:999; background:rgba(0,0,0,.70);
  backdrop-filter:blur(16px); display:flex; align-items:flex-end;
  animation:sheetFadeIn 200ms ease;
}
@keyframes sheetFadeIn { from { opacity:0; } to { opacity:1; } }
.sheet {
  width:100%; max-height:90svh; border-radius:24px 24px 0 0;
  border:1px solid rgba(124,92,252,.22); background:rgba(11,9,22,.98);
  backdrop-filter:blur(20px); box-shadow:0 -24px 90px rgba(0,0,0,.70);
  display:flex; flex-direction:column; position:relative;
  animation:sheetSlideUp 250ms cubic-bezier(.22,1,.36,1);
}
@keyframes sheetSlideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
.sheet::before {
  content:""; position:absolute; top:0; left:6%; right:6%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.36) 40%,rgba(91,142,248,.26) 60%,transparent);
  pointer-events:none;
}
.sheet-handle {
  width:48px; height:5px; border-radius:999px; background:rgba(124,92,252,.32);
  margin:12px auto 0; cursor:grab; flex-shrink:0;
}
.sheet-handle:active { cursor:grabbing; }
.sheet-header {
  padding:12px 16px; border-bottom:1px solid rgba(124,92,252,.10);
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  flex-shrink:0;
}
.sheet-title {
  font-weight:800; font-size:16px; color:rgba(235,232,255,.92);
  min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.sheet-close {
  width:36px; height:36px; border-radius:11px; display:grid; place-items:center;
  border:1px solid rgba(124,92,252,.20); background:rgba(124,92,252,.08);
  color:rgba(235,232,255,.75); cursor:pointer; transition:all 130ms ease;
  flex-shrink:0;
}
.sheet-close:hover { background:rgba(124,92,252,.16); }
.sheet-body { padding:16px; overflow-y:auto; flex:1; }
`;

/* ── Components ── */
function Badge({ type, children }: { type: "default" | "owned" | "equipped" | "price"; children: React.ReactNode }) {
  return <span className={`shop-badge ${type !== "default" ? type : ""}`}>{children}</span>;
}

function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const [startY, setStartY] = React.useState(0);
  const [deltaY, setDeltaY] = React.useState(0);
  const sheetRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    setStartY(t.clientY);
    setDeltaY(0);
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - startY;
    if (dy > 0) setDeltaY(dy);
  }
  function onTouchEnd() {
    if (deltaY > 120) onClose();
    setDeltaY(0);
  }

  if (!open) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        onClick={e => e.stopPropagation()}
        style={{ transform: deltaY > 0 ? `translateY(${deltaY}px)` : undefined }}
      >
        <div
          className="sheet-handle"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
        <div className="sheet-header">
          <div className="sheet-title">{title}</div>
          <button className="sheet-close" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function ShopPageMobile({ streamerAppearance = DEFAULT_STREAMER_APPEARANCE }: { streamerAppearance?: StreamerAppearance }) {
  const authAny = useAuth() as any;
  const token: string | null = authAny.token ?? null;
  const user = authAny.user as { id: number; username: string; rubis: number; role?: string } | null;
  const patchUser = authAny.patchUser as ((p: any) => void) | undefined;

  const [topTab, setTopTab] = React.useState<(typeof TOP_TABS)[number]["id"]>("skins");
  const [cat, setCat] = React.useState<Kind>("username");
  const [loading, setLoading] = React.useState(false);
  const [buying, setBuying] = React.useState(false);
  const [subsBusy, setSubsBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [availableRubis, setAvailableRubis] = React.useState<number>(user?.rubis ?? 0);
  const [availablePrestige, setAvailablePrestige] = React.useState<number>(0);
  const [talents, setTalents] = React.useState<ApiTalentItem[]>([]);
  const [items, setItems] = React.useState<ShopCosmeticItem[]>([]);
  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{ username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null }>({ username: null, badge: null, title: null, frame: null, hat: null });
  const [selected, setSelected] = React.useState<{ kind: Kind; code: string } | null>(null);

  function syncRubis(v: number, source: string) { const n = Number(v); if (!Number.isFinite(n)) return; setAvailableRubis(n); patchUser?.({ rubis: n }); window.dispatchEvent(new CustomEvent("rubis:update", { detail: { rubis: n, source } })); }
  async function loadTalents() { if (!token) return; try { const j: any = await shopTalents(token); if (j?.ok) { setTalents(j.talents || []); if (Number.isFinite(Number(j.availableRubis))) syncRubis(Number(j.availableRubis), "shop:talents"); } } catch { } }
  async function load() {
    if (!token) return; setLoading(true); setErr(null);
    try {
      const j: any = await shopCosmetics(token);
      if (!j?.ok) throw new Error(j?.error || "load_failed");
      const rub = Number(j.availableRubis) || Number(j.user?.rubis) || Number(user?.rubis ?? 0);
      syncRubis(Number.isFinite(rub) ? rub : 0, "shop:load");
      const pre = Number(j.availablePrestige) || 0;
      setAvailablePrestige(Number.isFinite(pre) ? pre : 0);
      setOwned(normalizeOwnedRecord(j.owned));
      setEquipped(j.equipped || { username: null, badge: null, title: null, frame: null, hat: null });
      const arr = Array.isArray(j.items) ? j.items : [];
      setItems(arr.filter((x: any) => x && x.active));
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { if (user?.rubis != null) syncRubis(Number(user.rubis), "auth:user"); /* eslint-disable-next-line */ }, [user?.rubis]);
  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [token]);
  React.useEffect(() => { if (topTab === "upgrades") loadTalents(); /* eslint-disable-next-line */ }, [topTab]);

  const effectiveRubis = Number.isFinite(availableRubis) ? availableRubis : user?.rubis ?? 0;
  const effectivePrestige = Number.isFinite(availablePrestige) ? availablePrestige : 0;
  const visible = React.useMemo(() => items.filter(x => x.kind === cat).slice().sort(sortByPriceAsc), [items, cat]);
  function isOwnedItem(it: ShopCosmeticItem) { return (it as any).owned === true || (owned?.[it.kind] || []).includes(it.code); }
  function addOwnedLocal(kind: string, code: string) { setOwned(prev => { const next = { ...(prev || {}) }; const arr = Array.isArray(next[kind]) ? next[kind].slice() : []; if (!arr.includes(code)) arr.push(code); next[kind] = arr; return next; }); setItems(prev => prev.map(x => x.kind === kind && x.code === code ? ({ ...(x as any), owned: true } as any) : x)); }
  async function buy(it: ShopCosmeticItem) {
    if (!token || it.unlock !== "shop") return;
    const pr = Number(it.priceRubis ?? 0); const pp = Number((it as any).pricePrestige ?? 0);
    const isRubis = Number.isFinite(pr) && pr > 0; const isPrestige = Number.isFinite(pp) && pp > 0;
    if (!isRubis && !isPrestige) return;
    setBuying(true); setErr(null);
    try {
      const j: any = await buyShopCosmetic(token, it.kind, it.code);
      if (!j?.ok) throw new Error(j?.error || "buy_failed");
      const newRubis = Number(j.availableRubis) || Number(j.user?.rubis);
      if (Number.isFinite(newRubis)) syncRubis(newRubis, "shop:buy");
      const pre = Number(j.availablePrestige);
      if (Number.isFinite(pre)) setAvailablePrestige(pre);
      if (j.owned) setOwned(normalizeOwnedRecord(j.owned));
      else addOwnedLocal(it.kind, it.code);
      if (typeof authAny.refreshMe === "function") authAny.refreshMe();
    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
    finally { setBuying(false); }
  }

  const selectedPreviewCosmetics = React.useMemo(() => { const base = { ...equipped }; if (selected) (base as any)[selected.kind] = selected.code; return buildCosmeticsPreview(base); }, [equipped, selected]);
  function previewForItem(it: ShopCosmeticItem): ChatCosmetics | null { const base = { ...equipped }; (base as any)[it.kind] = it.code; return withAvatar(buildCosmeticsPreview(base), user?.id); }
  const username = user?.username ?? "Invité";
  const previewUserId = user?.id ?? 999999;
  async function onSubscribe(plan: "viewer" | "streamer") { if (!token) return; setSubsBusy(true); setErr(null); try { const j: any = await billingCheckout(token, plan); if (!j?.ok || !j?.url) throw new Error(j?.error || "checkout_failed"); window.location.href = String(j.url); } catch (e: any) { setErr(String(e?.message || "Erreur paiement")); setSubsBusy(false); } }
  async function onManage() { if (!token) return; setSubsBusy(true); setErr(null); try { const j: any = await billingPortal(token); if (!j?.ok || !j?.url) throw new Error(j?.error || "portal_failed"); window.location.href = String(j.url); } catch (e: any) { setErr(String(e?.message || "Erreur portail")); setSubsBusy(false); } }

  type SubSlide = { title: string; points: string[] };
  type SubPlan = { id: "viewer" | "streamer"; label: string; badge: string; icon: string; priceText: string; visibleIf: (u: { role?: string } | null) => boolean; slides: SubSlide[]; ctaLabel: string };
  const SUB_PLANS: SubPlan[] = [
    { id: "viewer", label: "Abonnement Viewer", badge: "30 jours", icon: "⭐", priceText: "19,99 € / 30 jours", visibleIf: () => true, ctaLabel: "S'abonner", slides: [{ title: "Inclus à chaque cycle", points: ["🎁 1 ticket 'sub offert'", "💎 +500 rubis offerts", "✨ Cosmétique exclusif"] }, { title: "Boost coffres & gains", points: ["🧰 + génération passive coffres", "💰 Bonus récupération rubis", "🌧️ Boost sur les rain"] }, { title: "Bonus quotidiens & accès", points: ["📅 Bonus quotidien supplémentaire", "🎡 Tickets de roue", "📣 Accès PCall et RandomCall"] }] },
    { id: "streamer", label: "Abonnement Streamer", badge: "30 jours", icon: "🎥", priceText: "49,99 € / 30 jours", visibleIf: u => isStreamerRole(u?.role), ctaLabel: "S'abonner", slides: [{ title: "Inclus à chaque cycle", points: ["🎁 10 tickets 'sub offert'", "📌 Statut prioritaire", "🚀 Priorité retraits"] }, { title: "Boost stream & features", points: ["🧰 +50% génération passive coffre", "🎯 + prédictions par jour", "🌧️ +1 palier rain"] }] },
  ];
  const visiblePlans = SUB_PLANS.filter(p => p.visibleIf(user));
  const selectedItem = React.useMemo(() => selected ? items.find(x => x.kind === selected.kind && x.code === selected.code) ?? null : null, [selected, items]);
  const sheetOpen = !!selected && !!selectedItem;

  function renderItemTitle(it: ShopCosmeticItem) {
    if (it.kind === "badge") {
      const tier = rarityToTier((it as any).rarity);
      return (
        <div className="shop-card-title">
          <div className="shop-card-icon">🏷️</div>
          <div className={`chatBadge badge--${tier}`} style={{ fontSize: 13 }}>{badgeTextFromCode(it.code)}</div>
        </div>
      );
    }
    return (
      <div className="shop-card-title">
        <div className="shop-card-icon">{kindEmoji(it.kind as Kind)}</div>
        <div className="shop-card-name">{it.name}</div>
      </div>
    );
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SHOP_CSS }} />
      <div className="shop-root">
        {/* Header sticky */}
        <div className="shop-header">
          <div className="shop-title">Shop</div>
          <div className="shop-balance">
            <span className="shop-chip">💎 {Number(effectiveRubis).toLocaleString("fr-FR")}</span>
            <span className="shop-chip">🏆 {Number(effectivePrestige).toLocaleString("fr-FR")}</span>
            <button className="shop-refresh" onClick={load} disabled={!token || loading || buying || subsBusy} aria-label="Recharger">
              ↻
            </button>
          </div>
        </div>

        {/* Tabs sticky snap scroll */}
        <div className="shop-tabs">
          {TOP_TABS.map(t => (
            <button key={t.id} className={`shop-tab${topTab === t.id ? " active" : ""}`} onClick={() => setTopTab(t.id)} disabled={loading || buying || subsBusy}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="shop-content">
          {!token ? <div style={{ fontSize: 13, color: "rgba(167,139,250,.70)" }}>Connecte-toi pour accéder au shop.</div> : null}
          {err ? <div className="shop-hint">⚠️ {err}</div> : null}

          {/* UPGRADES */}
          {topTab === "upgrades" ? (
            <>
              <div className="shop-section-title">
                <span>Talents</span>
                <span style={{ fontSize: 12, color: "rgba(167,139,250,.65)" }}>Améliorations</span>
              </div>
              {[
                { code: "talent_calls_limit", name: "Calls & PCall", desc: "Augmente les calls disponibles.", icon: "📣" },
                { code: "talent_xp_boost", name: "Boost XP", desc: "Augmente l'XP gagnée.", icon: "⚡" },
                { code: "talent_rain_boost", name: "Boost Rain", desc: "Augmente les gains rain.", icon: "🌧️" },
                { code: "talent_prediction_bet_cap", name: "Mise prédiction max", desc: "Augmente la mise max.", icon: "🎯" },
                { code: "talent_prediction_shield", name: "Shield prédiction", desc: "Protège les prédictions.", icon: "🛡️" },
              ].map(t => {
                const talent = talents.find(x => x.code === t.code);
                const level = talent?.level ?? 0; const maxLevel = talent?.maxLevel ?? 3; const nextPrice = talent?.nextPrice ?? 500;
                const isMax = level >= maxLevel; const canAfford = effectiveRubis >= nextPrice;
                return (
                  <div key={t.code} className="talent-card">
                    <div className="talent-info">
                      <div className="talent-icon">{t.icon}</div>
                      <div>
                        <div className="talent-name">{t.name}</div>
                        <div className="talent-desc">{t.desc}</div>
                      </div>
                    </div>
                    <div className="talent-right">
                      <div className="talent-level">{isMax ? "MAX" : `Niv. ${level + 1}`}</div>
                      {isMax ? (
                        <button className="shop-btn" disabled>MAX</button>
                      ) : (
                        <button
                          className={`shop-btn${canAfford ? " primary" : ""}`}
                          disabled={!canAfford || buying || loading || subsBusy}
                          onClick={async () => {
                            if (!token) return;
                            const r: any = await buyTalent(token, t.code);
                            if (r?.ok && Number.isFinite(Number(r.availableRubis))) syncRubis(Number(r.availableRubis), "shop:buyTalent");
                            await loadTalents();
                          }}
                        >
                          {nextPrice.toLocaleString("fr-FR")} 💎
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          ) : null}

          {/* SUBS */}
          {topTab === "subs" ? (
            <>
              <div className="shop-section-title">
                <span>Abonnements</span>
                <span style={{ fontSize: 12, color: "rgba(167,139,250,.65)" }}>Mensuels</span>
              </div>
              {visiblePlans.map(p => (
                <div key={p.id} className="sub-card">
                  <div className="sub-header">
                    <div className="sub-info">
                      <div className="sub-icon">{p.icon}</div>
                      <div>
                        <div className="sub-title">{p.label}</div>
                        <div className="sub-price">{p.priceText}</div>
                      </div>
                    </div>
                    <Badge type="default">{p.badge}</Badge>
                  </div>
                  {p.slides.map((s, idx) => (
                    <details key={idx} className="sub-details">
                      <summary>{s.title}</summary>
                      <ul className="sub-points">
                        {s.points.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    </details>
                  ))}
                  <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button className="shop-btn primary" disabled={!token || subsBusy} onClick={() => onSubscribe(p.id)}>
                      {p.ctaLabel}
                    </button>
                    <button className="shop-btn" disabled={!token || subsBusy} onClick={onManage}>
                      Gérer
                    </button>
                  </div>
                </div>
              ))}
            </>
          ) : null}

          {/* RUBIS */}
          {topTab === "rubis" ? (
            <div style={{ fontSize: 13, color: "rgba(167,139,250,.70)" }}>Bientôt : achat de rubis (packs / top-up).</div>
          ) : null}

          {/* SKINS */}
          {topTab === "skins" ? (
            <>
              <div className="shop-section-title">
                <span>Catégories</span>
                <span style={{ fontSize: 12, color: "rgba(167,139,250,.65)" }}>{visible.length} items</span>
              </div>
              <div className="shop-cats">
                {SKIN_CATS.map(c => {
                  const count = items.filter(x => x.kind === c.id).length;
                  return (
                    <button key={c.id} className={`shop-cat${cat === c.id ? " active" : ""}`} onClick={() => setCat(c.id)} disabled={loading || buying || subsBusy}>
                      <span>{c.emoji}</span>
                      <span>{c.label}</span>
                      <span style={{ opacity: .6, fontSize: 11 }}>({count})</span>
                    </button>
                  );
                })}
              </div>

              <div className="shop-grid">
                {visible.length === 0 ? <div className="shop-mobile-empty"><strong>{token ? "Aucun article disponible" : "Ta collection t’attend"}</strong><span>{token ? "Cette catégorie sera enrichie prochainement." : "Connecte-toi pour charger le catalogue et essayer chaque élément sur ton profil."}</span></div> : null}
                {visible.map(it => {
                  const ownedNow = isOwnedItem(it); const isEquipped = (equipped as any)?.[it.kind] === it.code;
                  const pr = Number(it.priceRubis ?? 0); const pp = Number((it as any).pricePrestige ?? 0);
                  const isRubis = Number.isFinite(pr) && pr > 0; const isPrestige = Number.isFinite(pp) && pp > 0;
                  const buyable = it.unlock === "shop" && (isRubis || isPrestige);
                  const canAfford = isPrestige ? pp <= effectivePrestige : pr <= effectiveRubis;
                  const lock = !ownedNow && it.unlock !== "shop";
                  const disabledBuy = !token || buying || loading || subsBusy || ownedNow || !canAfford;
                  return (
                    <div
                      key={`${it.kind}:${it.code}`}
                      className={`shop-card${lock ? " locked" : ""}`}
                      onClick={() => !lock && setSelected({ kind: it.kind as Kind, code: it.code })}
                    >
                      <div className="shop-card-header">
                        {renderItemTitle(it)}
                        <div>
                          {isEquipped ? (
                            <Badge type="equipped">✓ Équipé</Badge>
                          ) : ownedNow ? (
                            <Badge type="owned">Possédé</Badge>
                          ) : isRubis ? (
                            <Badge type="price">💎 {pr.toLocaleString("fr-FR")}</Badge>
                          ) : isPrestige ? (
                            <Badge type="price">🏆 {pp.toLocaleString("fr-FR")}</Badge>
                          ) : (
                            <Badge type="default">—</Badge>
                          )}
                        </div>
                      </div>

                      <div className="shop-preview" style={{ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor } as any}>
                        <ChatMessageBubble
                          streamerAppearance={streamerAppearance}
                          msg={{
                            id: `shop:${it.kind}:${it.code}`,
                            userId: previewUserId,
                            username,
                            body: "Preview",
                            createdAt: new Date().toISOString(),
                            cosmetics: previewForItem(it),
                          }}
                        />
                      </div>

                      <div className="shop-actions">
                        {buyable ? (
                          <button
                            className={`shop-btn${!disabledBuy ? " primary" : ""}`}
                            disabled={disabledBuy}
                            onClick={e => { e.stopPropagation(); buy(it); }}
                          >
                            {ownedNow ? "Possédé" : !canAfford ? "Pas assez" : "Acheter"}
                          </button>
                        ) : (
                          <button className="shop-btn" disabled>Indisponible</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Sheet draggable */}
        <Sheet open={sheetOpen} title={selectedItem ? selectedItem.name : "Aperçu"} onClose={() => setSelected(null)}>
          <div className="shop-preview" style={{ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor } as any}>
            <ChatMessageBubble
              streamerAppearance={streamerAppearance}
              msg={{
                id: "shop:preview",
                userId: previewUserId,
                username: user?.username ?? "Invité",
                body: "Exemple de message — ça rend comment ?",
                createdAt: new Date().toISOString(),
                cosmetics: withAvatar(selectedPreviewCosmetics, user?.id),
              }}
            />
          </div>
          {selectedItem ? (
            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "rgba(167,139,250,.65)" }}>
                {selectedItem.unlock !== "shop" ? `🔒 ${selectedItem.unlock}` : "Shop"}
                {(selectedItem as any).rarity ? ` • ${(selectedItem as any).rarity}` : ""}
              </div>
              <button
                className="shop-btn primary"
                disabled={
                  !token ||
                  buying ||
                  loading ||
                  subsBusy ||
                  isOwnedItem(selectedItem) ||
                  (() => {
                    const pr = Number(selectedItem.priceRubis ?? 0);
                    const pp = Number((selectedItem as any).pricePrestige ?? 0);
                    const isPrestige = Number.isFinite(pp) && pp > 0;
                    const isRubis = Number.isFinite(pr) && pr > 0;
                    if (!isRubis && !isPrestige) return true;
                    return isPrestige ? pp > effectivePrestige : pr > effectiveRubis;
                  })()
                }
                onClick={() => buy(selectedItem)}
              >
                {isOwnedItem(selectedItem) ? "Possédé" : "Acheter"}
              </button>
            </div>
          ) : null}
        </Sheet>
      </div>
    </>
  );
}
