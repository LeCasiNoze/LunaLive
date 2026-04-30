// web/src/components/profile/PersonalisationSection.mobile.tsx — Rework v2
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
  unlock: string; priceRubis: number | null; pricePrestige?: number | null; active: boolean; meta?: any;
};

type UiItem = {
  kind: Kind; code: string | null; name: string; desc?: string; free?: boolean;
  priceRubis?: number | null; pricePrestige?: number | null; rarity?: string; unlock?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

const CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo",   emoji: "✨" },
  { id: "badge",    label: "Badges",   emoji: "🏷️" },
  { id: "hat",      label: "Chapeaux", emoji: "🧢" },
  { id: "frame",    label: "Cadrans",  emoji: "💬" },
  { id: "title",    label: "Titres",   emoji: "🏆" },
];

// ─── Design tokens ────────────────────────────────────────────────────────────

const SURF  = "#0d1018";
const SURF2 = "#111624";
const BOR   = "rgba(255,255,255,0.06)";
const ACC   = "#7c5cfc";
const ACC_D = "rgba(124,92,252,0.12)";
const TXT   = "#eeeef5";
const TXT2  = "rgba(238,238,245,0.45)";
const FONT  = "'Inter', system-ui, -apple-system, sans-serif";

// ─── Pure logic helpers ───────────────────────────────────────────────────────

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
  try {
    const p = token.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  } catch { return null; }
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

function applyPreview(kind: Kind, code: string | null, c: any, opts?: { titleNames?: Record<string, string> }) {
  if (!code) return;
  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;
  if (kind === "badge") {
    const txt = badgeTextFromCode(code);
    c.badges = [{ id: txt, code: txt, text: txt, label: txt }]; (c as any).badgeText = txt; return;
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
      uanim_typewriter:"uanim_typewriter", uanim_shadow:"uanim_shadow",
      uanim_outline:"uanim_outline", uanim_glitch:"uanim_glitch",
      uanim_fire:"uanim_fire", uanim_ice:"uanim_ice",
      uanim_silver_toggle:"uanim_silver_toggle", uanim_purple_toggle:"uanim_purple_toggle",
      uanim_gradient_sunset:"uanim_gradient_sunset", uanim_galaxy:"uanim_galaxy",
    };
    const effect = map[code] ?? code; c.username.effect = effect; c.username.animId = effect; c.username.anim = effect; return;
  }
  if (kind === "frame") { c.frame = { frameId: frameIdFromCode(code) }; return; }
  if (kind === "title") {
    const label = opts?.titleNames?.[code] ?? titleLabelFallback(code);
    c.title = { text: label, label }; (c as any).titleText = label; return;
  }
}

function buildCosmeticsPreview(
  equipped: { username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null },
  opts?: { titleNames?: Record<string, string> }
): ChatCosmetics | null {
  const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} };
  applyPreview("username", equipped?.username ?? null, c, opts);
  applyPreview("badge",    equipped?.badge ?? null,    c, opts);
  applyPreview("title",    equipped?.title ?? null,    c, opts);
  applyPreview("frame",    equipped?.frame ?? null,    c, opts);
  applyPreview("hat",      equipped?.hat ?? null,      c, opts);
  return c as ChatCosmetics;
}

function byOwnedFirst(ownedSet: Set<string>, a: UiItem, b: UiItem) {
  const ao = a.free || (a.code != null && ownedSet.has(a.code));
  const bo = b.free || (b.code != null && ownedSet.has(b.code));
  if (ao !== bo) return ao ? -1 : 1;
  return a.name.localeCompare(b.name);
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function StatusBadge({ children, color }: { children: React.ReactNode; color: "green" | "purple" | "gray" | "red" }) {
  const map = {
    green:  { bg: "rgba(16,185,129,0.12)",  bd: "rgba(16,185,129,0.22)",  c: "#34d399" },
    purple: { bg: "rgba(124,92,252,0.14)",  bd: "rgba(124,92,252,0.24)",  c: "#c4b5fd" },
    gray:   { bg: "rgba(255,255,255,0.05)", bd: "rgba(255,255,255,0.10)", c: TXT2 },
    red:    { bg: "rgba(239,68,68,0.10)",   bd: "rgba(239,68,68,0.20)",   c: "#f87171" },
  };
  const s = map[color];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px",
      borderRadius: 99, background: s.bg, border: `1px solid ${s.bd}`, color: s.c,
      fontFamily: FONT, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function renderItemName(it: UiItem) {
  if (it.kind === "badge" && it.code) {
    const tier = rarityToTier(it.rarity || "");
    return <span className={`chatBadge badge--${tier}`}>{badgeTextFromCode(it.code)}</span>;
  }
  return <span style={{ fontFamily: FONT, fontWeight: 600, color: TXT }}>{it.name}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PersonalisationSectionMobile({
  username,
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  username: string;
  streamerAppearance?: StreamerAppearance;
}) {
  const { token } = useAuth();

  const me = React.useMemo(() => (token ? parseJwt(token) : null), [token]);
  const myUserId = Number(me?.id || 0);

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl]         = React.useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarPayload, setAvatarPayload] = React.useState<{ mime: string; b64: string } | null>(null);
  const [avatarBusy, setAvatarBusy]       = React.useState(false);

  const [tab, setTab]         = React.useState<Kind>("username");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving]   = React.useState(false);
  const [err, setErr]         = React.useState<string | null>(null);

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

  const ownedSet = new Set<string>([...(owned?.[tab] || []), ...(free?.[tab] || [])]);

  const items: UiItem[] = [
    { kind: tab, code: null, name: tab === "username" ? "Par défaut" : "Aucun", free: true, desc: "Retirer l'élément actif." },
    ...catalog.filter(x => x.kind === tab).map(x => {
      const pricePrestige = Number((x as any).pricePrestige ?? 0) || null;
      const desc = x.unlock === "shop"
        ? x.priceRubis ? `${Number(x.priceRubis).toLocaleString("fr-FR")} rubis`
          : pricePrestige ? `${Number(pricePrestige).toLocaleString("fr-FR")} prestige` : "Shop"
        : `${niceUnlock(x.unlock)}${x.rarity ? ` — ${x.rarity}` : ""}`;
      return { kind: x.kind, code: x.code, name: x.name, desc, priceRubis: x.priceRubis, pricePrestige, rarity: x.rarity, unlock: x.unlock };
    }),
  ].sort((a, b) => byOwnedFirst(ownedSet, a, b));

  const effectiveAvatar = avatarUrl;
  function withAvatar<C extends ChatCosmetics | null>(c: C): C {
    if (!c) return c;
    return { ...(c as any), avatar: { ...((c as any).avatar || {}), url: effectiveAvatar || undefined } } as any as C;
  }

  const previewCosmetics = withAvatar(buildCosmeticsPreview(equipped, { titleNames }));
  function previewForItem(it: UiItem): ChatCosmetics | null {
    const simulated = {
      username: it.kind === "username" ? it.code : equipped.username,
      badge:    it.kind === "badge"    ? it.code : equipped.badge,
      title:    it.kind === "title"    ? it.code : equipped.title,
      frame:    it.kind === "frame"    ? it.code : equipped.frame,
      hat:      it.kind === "hat"      ? it.code : equipped.hat,
    };
    return withAvatar(buildCosmeticsPreview(simulated, { titleNames }));
  }

  const curLabel = CATS.find(x => x.id === tab)?.label ?? tab;
  const curEmoji = CATS.find(x => x.id === tab)?.emoji ?? "🎨";

  // ─── Swipe to change category (blocks parent swipe) ──────────────────────
  const catsOrder = React.useMemo(() => CATS.map(c => c.id), []);
  const swipeRef = React.useRef({ active: false, decided: false, horizontal: false, x0: 0, y0: 0, dx: 0, dy: 0, pointerId: -1 });

  function catIndex(id: Kind) { const i = catsOrder.indexOf(id); return i >= 0 ? i : 0; }
  function setCatByIndex(i: number) { const n = catsOrder.length; setTab(catsOrder[Math.max(0, Math.min(n - 1, i))] as Kind); }

  function onPointerDownCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeRef.current = { active: true, decided: false, horizontal: false, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, pointerId: e.pointerId };
    try { (e.currentTarget as any).setPointerCapture?.(e.pointerId); } catch {}
  }
  function onPointerMoveCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (!swipeRef.current.active) return;
    const dx = e.clientX - swipeRef.current.x0; const dy = e.clientY - swipeRef.current.y0;
    swipeRef.current.dx = dx; swipeRef.current.dy = dy;
    if (!swipeRef.current.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      swipeRef.current.decided = true;
      swipeRef.current.horizontal = Math.abs(dx) > Math.abs(dy) * 1.1;
    }
    if (swipeRef.current.decided && swipeRef.current.horizontal) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }
  function onPointerUpCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    const { decided, horizontal, dx, dy } = swipeRef.current;
    swipeRef.current.active = false;
    if (!(decided && horizontal)) { try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {} return; }
    e.stopPropagation();
    if (Math.abs(dx) >= 45 && Math.abs(dx) >= Math.abs(dy) * 1.2) {
      if (dx < 0) setCatByIndex(catIndex(tab) + 1); else setCatByIndex(catIndex(tab) - 1);
    }
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  }
  function onPointerCancelCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeRef.current.active = false;
    try { (e.currentTarget as any).releasePointerCapture?.(e.pointerId); } catch {}
  }

  return (
    <div
      data-noswipe-profiletabs="1"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerCancelCapture}
      style={{ fontFamily: FONT, touchAction: "pan-y", overscrollBehaviorX: "contain" }}
    >

      {/* Error */}
      {err && (
        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)",
          fontFamily: FONT, fontSize: 12, color: "#f87171" }}>
          ⚠️ {err}
        </div>
      )}

      {/* Avatar + Preview row */}
      <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>

        {/* Avatar */}
        <div style={{ borderRadius: 10, border: `1px solid ${BOR}`, background: SURF, padding: 12 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT, marginBottom: 10 }}>
            🖼️ Avatar
            <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: TXT2 }}>carré — auto-crop</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 12, alignItems: "center" }}>
            <div style={{ width: 58, height: 58, borderRadius: 10, border: `1px solid rgba(124,92,252,0.25)`,
              background: ACC_D, overflow: "hidden", display: "grid", placeItems: "center" }}>
              {(avatarPreview || avatarUrl) ? (
                <img src={avatarPreview || `${avatarUrl}`} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : (
                <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 16, color: "#c4b5fd" }}>{getInitials(username)}</span>
              )}
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <button className="btnGhostSmall" disabled={!token || avatarBusy} onClick={() => fileRef.current?.click()} style={{ fontSize: 12 }}>
                {avatarPayload ? "🪄 Changer" : "⬆️ Uploader"}
              </button>
              {avatarPayload ? (
                <div style={{ display: "flex", gap: 7 }}>
                  <button className="btnPrimarySmall" disabled={!token || avatarBusy} style={{ flex: 1, fontSize: 12 }}
                    onClick={async () => {
                      if (!token || !avatarPayload) return;
                      setAvatarBusy(true); setErr(null);
                      try {
                        const r = await fetch(`${API_BASE}/me/avatar`, { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ mime: avatarPayload.mime, data: avatarPayload.b64 }) });
                        const j = await r.json();
                        if (!j?.ok) throw new Error(j?.error || "upload_failed");
                        setAvatarUrl(String(j?.avatarUrl || `${API_BASE}/avatars/u/${myUserId}?v=${Date.now()}`));
                        void trackFeatureEvent(token, { kind: "profile_style_action", subject: "avatar_upload" });
                        setAvatarPayload(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null);
                      } catch (e: any) { setErr(String(e?.message || "Erreur")); }
                      finally { setAvatarBusy(false); }
                    }}>
                    {avatarBusy ? "…" : "✅"}
                  </button>
                  <button className="btnGhostSmall" disabled={avatarBusy} style={{ fontSize: 12 }}
                    onClick={() => { setAvatarPayload(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button className="btnGhostSmall" disabled={!token || avatarBusy} style={{ fontSize: 12 }}
                  onClick={async () => {
                    if (!token) return; setAvatarBusy(true); setErr(null);
                    try {
                      const r = await fetch(`${API_BASE}/me/avatar`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                      const j = await r.json().catch(() => ({}));
                      if (j?.ok !== true) throw new Error(j?.error || "delete_failed");
                      setAvatarUrl(null);
                    } catch (e: any) { setErr(String(e?.message || "Erreur")); }
                    finally { setAvatarBusy(false); }
                  }}>
                  🗑️ Supprimer
                </button>
              )}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              setErr(null); setAvatarBusy(true);
              try {
                const { mime, b64, previewUrl } = await makeSquareAvatar(f, 160);
                setAvatarPayload({ mime, b64 }); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(previewUrl);
              } catch (err: any) { setErr(String(err?.message || "avatar_prepare_failed")); }
              finally { setAvatarBusy(false); }
            }} />
        </div>

        {/* Live preview */}
        <div style={{ borderRadius: 10, border: `1px solid ${BOR}`, background: SURF, padding: 12,
          ...(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT }}>✨ Aperçu</span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: TXT2 }}>
              {saving ? "Enregistrement…" : loading ? "Chargement…" : "Rendu en temps réel"}
            </span>
          </div>
          <ChatMessageBubble
            streamerAppearance={streamerAppearance}
            msg={{ id: "preview", userId: myUserId || 0, username, body: "Exemple — comment ça rend ?", createdAt: new Date().toISOString(), cosmetics: previewCosmetics }}
          />
        </div>
      </div>

      {/* Category tabs (swipeable) */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 12, WebkitOverflowScrolling: "touch" }}>
        {CATS.map(c => (
          <button key={c.id} onClick={() => setTab(c.id)} disabled={loading || saving} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
            borderRadius: 8, border: `1px solid ${tab === c.id ? "rgba(124,92,252,0.30)" : BOR}`,
            background: tab === c.id ? ACC_D : "transparent",
            color: tab === c.id ? "#c4b5fd" : TXT2,
            fontFamily: FONT, fontWeight: 600, fontSize: 12,
            whiteSpace: "nowrap", flexShrink: 0,
            borderLeft: `3px solid ${tab === c.id ? ACC : "transparent"}`,
            cursor: loading || saving ? "not-allowed" : "pointer",
            opacity: loading || saving ? 0.5 : 1,
          }}>
            <span style={{ fontSize: 13 }}>{c.emoji}</span>
            <span>{c.label}</span>
          </button>
        ))}
        <div style={{ marginLeft: "auto", flexShrink: 0 }}>
          <button className="btnGhostSmall" onClick={load} disabled={!token || loading || saving} style={{ fontSize: 11 }}>
            {loading ? "…" : "🔄"}
          </button>
        </div>
      </div>

      {/* Items list */}
      <div style={{ borderRadius: 10, border: `1px solid ${BOR}`, background: SURF, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT }}>{curEmoji} {curLabel}</span>
          <span style={{ fontFamily: FONT, fontSize: 11, color: TXT2 }}>
            {saving ? "Enregistrement…" : loading ? "Chargement…" : `${items.length} items`}
          </span>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {items.map(it => {
            const isEquipped = (equipped as any)?.[tab] === it.code;
            const isOwned    = !!it.free || (it.code != null && ownedSet.has(it.code));
            const locked     = !isOwned;
            const cardPreview = previewForItem(it);

            return (
              <button
                key={`${it.kind}:${String(it.code)}`}
                onClick={() => isOwned ? doEquip(it.kind, it.code) : undefined}
                disabled={!token || loading || saving || !isOwned}
                title={!isOwned ? "Non possédé" : isEquipped ? "Retirer" : "Équiper"}
                style={{
                  textAlign: "left", borderRadius: 10, padding: 11, cursor: !isOwned ? "not-allowed" : "pointer",
                  border: `1px solid ${isEquipped ? "rgba(124,92,252,0.35)" : BOR}`,
                  background: isEquipped ? ACC_D : (locked ? "rgba(255,255,255,0.02)" : SURF2),
                  opacity: locked ? 0.48 : 1,
                  transform: isEquipped ? "translateY(-1px)" : "none",
                  boxShadow: isEquipped ? "0 4px 16px rgba(124,92,252,0.12)" : "none",
                  transition: "transform 120ms, box-shadow 120ms",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>{renderItemName(it)}</div>
                  <div style={{ flexShrink: 0 }}>
                    {isEquipped ? (
                      <StatusBadge color="green">✅ Équipé</StatusBadge>
                    ) : it.free ? (
                      <StatusBadge color="purple">🎁 Gratuit</StatusBadge>
                    ) : isOwned ? (
                      <StatusBadge color="gray">🧾 Possédé</StatusBadge>
                    ) : (
                      <StatusBadge color="red">🔒 Verrouillé</StatusBadge>
                    )}
                  </div>
                </div>

                {/* Preview */}
                <div style={{ pointerEvents: "none", opacity: locked ? 0.60 : 1,
                  ...(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any) }}>
                  <ChatMessageBubble
                    streamerAppearance={streamerAppearance}
                    msg={{ id: `cp:${it.kind}:${String(it.code)}`, userId: myUserId || 0, username, body: "…", createdAt: new Date().toISOString(), cosmetics: cardPreview }}
                  />
                </div>

                {/* Footer */}
                {it.desc && (
                  <div style={{ marginTop: 7, fontFamily: FONT, fontSize: 11, color: TXT2 }}>
                    {it.unlock === "shop" ? "Shop — " : ""}{it.desc}
                  </div>
                )}
                {isOwned && (
                  <div style={{ marginTop: 5, fontFamily: FONT, fontSize: 11,
                    color: isEquipped ? "#c4b5fd" : TXT2, fontWeight: 600 }}>
                    {isEquipped ? "Toucher pour retirer" : "Toucher pour équiper →"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PersonalisationSectionMobile;
