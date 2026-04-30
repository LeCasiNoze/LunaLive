// web/src/components/profile/PersonalisationSection.tsx — Rework v2
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
import { useIsMobile } from "../../hooks/useIsMobile";
import { trackFeatureEvent } from "../../lib/feature_events";
import PersonalisationSectionMobile from "./PersonalisationSection.mobile";

type Kind = "username" | "badge" | "title" | "frame" | "hat";

type ApiCatalogItem = {
  kind: Kind;
  code: string;
  name: string;
  rarity: string;
  unlock: string;
  priceRubis: number | null;
  pricePrestige?: number | null;
  active: boolean;
  meta?: any;
};

type UiItem = {
  kind: Kind;
  code: string | null;
  name: string;
  desc?: string;
  free?: boolean;
  priceRubis?: number | null;
  pricePrestige?: number | null;
  rarity?: string;
  unlock?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

// Note: la catégorie "title" est désormais gérée séparément par
// <TitleSelector /> (Sprint 3.5b — système multi-slots succès+niveau).
// On garde la logique title dans ce composant pour rétrocompat (équipement
// legacy via patch /me/cosmetics/equip { kind: 'title' }) mais l'onglet
// n'est plus exposé dans la barre de catégories.
const CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo",    emoji: "✨" },
  { id: "badge",    label: "Badges",    emoji: "🏷️" },
  { id: "hat",      label: "Chapeaux",  emoji: "🧢" },
  { id: "frame",    label: "Cadrans",   emoji: "💬" },
];

// ─── Design tokens (matching ProfilePage) ────────────────────────────────────

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
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64));
  } catch { return null; }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function makeSquareAvatar(file: File, size = 160): Promise<{ mime: string; b64: string; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("image_load_failed")); });
  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2); const sy = Math.floor((img.height - s) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const blob: Blob = await new Promise(resolve => { canvas.toBlob(b => resolve(b || new Blob()), "image/webp", 0.82); });
  const finalBlob = blob && blob.size > 0 ? blob : await new Promise<Blob>(resolve => { canvas.toBlob(b => resolve(b || new Blob()), "image/jpeg", 0.85); });
  URL.revokeObjectURL(url);
  const mime = finalBlob.type || "image/webp";
  const b64 = await blobToBase64(finalBlob);
  return { mime, b64, previewUrl: URL.createObjectURL(finalBlob) };
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
  kind: Kind,
  code: string | null,
  c: any,
  opts?: { titleNames?: Record<string, string>; badgeNames?: Record<string, string> }
) {
  if (!code) return;
  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;

  if (kind === "badge") {
    const label = (code && opts?.badgeNames?.[code]) || (code ? badgeTextFromCode(code) : "");
    c.badges = [{ id: label, code: label, text: label, label }];
    (c as any).badge = label; (c as any).badgeText = label; (c as any).badgeLabel = label;
    return;
  }
  if (kind === "hat") {
    const map: Record<string, string> = {
      hat_luna_cap: "luna_cap", hat_carton_crown: "carton_crown", hat_demon_horn: "demon_horn",
      hat_eclipse_halo: "eclipse_halo", hat_astral_helmet: "astral_helmet", hat_lotus_aureole: "lotus_aureole",
      hat_top_hat: "top_hat", hat_santa: "santa", hat_witch: "witch",
      hat_pirate: "pirate", hat_viking: "viking", hat_propeller: "propeller",
    };
    const hatId = map[code] ?? code;
    c.avatar.hatId = hatId;
    const EMOJI: Record<string, string> = {
      luna_cap:"🧢", carton_crown:"👑", demon_horn:"😈", eclipse_halo:"⭕", astral_helmet:"🪖", lotus_aureole:"🪷",
      top_hat:"🎩", santa:"🎅", witch:"🧙", pirate:"🏴‍☠️", viking:"⚔️", propeller:"🌀",
    };
    c.avatar.hatEmoji = EMOJI[hatId] ?? "🧢";
    return;
  }
  if (kind === "username") {
    const map: Record<string, string> = {
      uanim_chroma_toggle: "chroma", uanim_gold_toggle: "gold",
      uanim_rainbow_scroll: "rainbow_scroll", uanim_neon_underline: "neon_underline",
      uanim_frost: "uanim_frost", uanim_ember: "uanim_ember",
      uanim_pulse_red: "uanim_pulse_red", uanim_pulse_blue: "uanim_pulse_blue",
      uanim_glitch: "uanim_glitch",
      uanim_fire: "uanim_fire", uanim_ice: "uanim_ice",
      uanim_silver_toggle: "uanim_silver_toggle", uanim_purple_toggle: "uanim_purple_toggle",
      uanim_gradient_sunset: "uanim_gradient_sunset", uanim_galaxy: "uanim_galaxy",
    };
    const effect = map[code] ?? code;
    c.username.effect = effect; c.username.animId = effect; c.username.anim = effect;
    return;
  }
  if (kind === "frame") {
    c.frame = { frameId: frameIdFromCode(code) };
    return;
  }
  if (kind === "title") {
    const label = opts?.titleNames?.[code] ?? titleLabelFallback(code);
    c.title = { text: label, label };
    (c as any).titleText = label; (c as any).titleLabel = label; (c as any).titleCode = code;
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

function CatTab({ active, onClick, emoji, label, disabled }: {
  active: boolean; onClick: () => void; emoji: string; label: string; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px",
      borderRadius: 8, border: `1px solid ${active ? "rgba(124,92,252,0.30)" : BOR}`,
      background: active ? ACC_D : "transparent",
      color: active ? "#c4b5fd" : TXT2,
      fontFamily: FONT, fontWeight: 600, fontSize: 13,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.5 : 1,
      whiteSpace: "nowrap",
      borderLeft: active ? `3px solid ${ACC}` : `3px solid transparent`,
      transition: "background 120ms, color 120ms, border-color 120ms",
    }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

function renderItemName(it: UiItem) {
  if (it.kind === "badge" && it.code) {
    const tier = rarityToTier(it.rarity || "");
    const label = it.name || badgeTextFromCode(it.code);
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span className={`chatBadge badge--${tier}`}>{label}</span>
      </span>
    );
  }
  return <span>{it.name}</span>;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PersonalisationSection({
  username,
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  username: string;
  streamerAppearance?: StreamerAppearance;
}) {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  if (isMobile) {
    return <PersonalisationSectionMobile username={username} streamerAppearance={streamerAppearance} />;
  }

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

  const ownedSet = new Set<string>([...(owned?.[tab] || []), ...(free?.[tab] || [])]);

  const RARITY_ORDER_PS = ["mythic", "legendary", "epic", "rare", "uncommon", "common", ""] as const;
  const RARITY_LABEL_PS: Record<string, string> = {
    mythic: "Mythique", legendary: "Légendaire", epic: "Épique",
    rare: "Rare", uncommon: "Peu commun", common: "Commun", "": "Autre",
  };
  const RARITY_COLOR_PS: Record<string, string> = {
    mythic: "#e879f9", legendary: "#f59e0b", epic: "#a78bfa",
    rare: "#60a5fa", uncommon: "#6ee7b7", common: "rgba(220,220,255,0.55)", "": TXT2,
  };

  const allItems: UiItem[] = [
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

  const q = searchQ.toLowerCase().trim();
  const filteredItems = allItems.filter(it => {
    if (q && !it.name.toLowerCase().includes(q)) return false;
    const isOwned = !!it.free || (it.code != null && ownedSet.has(it.code));
    if (filterMode === "owned") return isOwned;
    if (filterMode === "locked") return !isOwned && !it.free;
    return true;
  });

  // group by rarity
  const byRarityPS: Record<string, UiItem[]> = {};
  for (const r of RARITY_ORDER_PS) byRarityPS[r] = [];
  for (const it of filteredItems) {
    const r = it.rarity ?? "";
    if (byRarityPS[r] != null) byRarityPS[r].push(it);
    else byRarityPS[""].push(it);
  }

  const totalOwned = allItems.filter(it => !!it.free || (it.code != null && ownedSet.has(it.code))).length;

  const effectiveAvatar = avatarUrl;
  function withAvatar<C extends ChatCosmetics | null>(c: C): C {
    if (!c) return c;
    return { ...(c as any), avatar: { ...((c as any).avatar || {}), url: effectiveAvatar || undefined } } as any as C;
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

  return (
    <div style={{ fontFamily: FONT }}>
      {/* TOP: Avatar + Live preview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>

        {/* Avatar */}
        <div style={{ borderRadius: 12, border: `1px solid ${BOR}`, background: SURF, padding: 16 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT, marginBottom: 12 }}>
            🖼️ Avatar
            <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: TXT2 }}>carré — auto-crop</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 12, flexShrink: 0,
              border: `1px solid rgba(124,92,252,0.25)`, background: ACC_D,
              overflow: "hidden", display: "grid", placeItems: "center" }}>
              {(avatarPreview || avatarUrl) ? (
                <img src={avatarPreview || `${avatarUrl}`} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, color: "#c4b5fd" }}>{getInitials(username)}</span>
              )}
            </div>
            <div style={{ display: "grid", gap: 7, flex: 1, minWidth: 0 }}>
              <button className="btnGhost" disabled={!token || avatarBusy} onClick={() => fileRef.current?.click()} style={{ fontSize: 13 }}>
                {avatarPayload ? "🪄 Changer" : "⬆️ Uploader"}
              </button>
              {avatarPayload ? (
                <div style={{ display: "flex", gap: 7 }}>
                  <button className="btnPrimary" disabled={!token || avatarBusy} style={{ fontSize: 13, flex: 1 }}
                    onClick={async () => {
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
                    }}>
                    {avatarBusy ? "…" : "✅ Valider"}
                  </button>
                  <button className="btnGhost" disabled={avatarBusy} style={{ fontSize: 13 }}
                    onClick={() => { setAvatarPayload(null); if (avatarPreview) URL.revokeObjectURL(avatarPreview); setAvatarPreview(null); }}>
                    ✕
                  </button>
                </div>
              ) : (
                <button className="btnGhost" disabled={!token || avatarBusy} style={{ fontSize: 13 }}
                  onClick={async () => {
                    if (!token) return;
                    setAvatarBusy(true); setErr(null);
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
                setAvatarPayload({ mime, b64 });
                if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                setAvatarPreview(previewUrl);
              } catch (err: any) { setErr(String(err?.message || "avatar_prepare_failed")); }
              finally { setAvatarBusy(false); }
            }} />
        </div>

        {/* Live preview */}
        <div style={{ borderRadius: 12, border: `1px solid ${BOR}`, background: SURF, padding: 16,
          ...(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 13, color: TXT }}>✨ Aperçu live</span>
            <span style={{ fontFamily: FONT, fontSize: 12, color: TXT2 }}>
              {saving ? "Enregistrement…" : loading ? "Chargement…" : "Rendu en temps réel"}
            </span>
          </div>
          <ChatMessageBubble
            streamerAppearance={streamerAppearance}
            msg={{ id: "preview", userId: myUserId || 0, username, body: "Exemple — comment ça rend ?", createdAt: new Date().toISOString(), cosmetics: previewCosmetics }}
          />
        </div>
      </div>

      {err && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)",
          fontFamily: FONT, fontSize: 13, color: "#f87171" }}>
          ⚠️ {err}
        </div>
      )}

      {/* Category tabs + reload */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {CATS.map(c => (
          <CatTab key={c.id} active={tab === c.id} emoji={c.emoji} label={c.label}
            onClick={() => { setTab(c.id); setSearchQ(""); setFilterMode("all"); }} disabled={loading || saving} />
        ))}
        <div style={{ marginLeft: "auto" }}>
          <button className="btnGhost" onClick={load} disabled={!token || loading || saving} style={{ fontSize: 13 }}>
            {loading ? "…" : "🔄 Recharger"}
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Rechercher…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          style={{
            flex: "1 1 120px", maxWidth: 200, padding: "5px 10px", borderRadius: 8,
            border: `1px solid rgba(124,92,252,0.22)`, background: "rgba(255,255,255,0.04)",
            color: "#dde8ff", font: "inherit", fontSize: 12, outline: "none",
          }}
        />
        {(["all", "owned", "locked"] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilterMode(f)}
            style={{
              padding: "4px 10px", borderRadius: 7,
              border: `1px solid ${filterMode === f ? "rgba(124,92,252,0.45)" : "rgba(124,92,252,0.22)"}`,
              background: filterMode === f ? "rgba(124,92,252,0.14)" : "rgba(255,255,255,0.04)",
              color: filterMode === f ? "#c4b5fd" : "rgba(220,220,255,0.65)",
              fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            {f === "all" ? "Tous" : f === "owned" ? "Débloqués" : "Verrouillés"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontFamily: FONT, fontSize: 11, color: TXT2 }}>
          {totalOwned}/{allItems.length} débloqués
        </span>
      </div>

      {/* Items grouped by rarity */}
      {filteredItems.length === 0 ? (
        <div style={{ fontFamily: FONT, fontSize: 13, color: TXT2, textAlign: "center", padding: "20px 0" }}>
          Aucun élément.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {RARITY_ORDER_PS.map(rarity => {
            const groupItems = byRarityPS[rarity];
            if (!groupItems?.length) return null;
            const ownedInGroup = groupItems.filter(it => !!it.free || (it.code != null && ownedSet.has(it.code))).length;
            return (
              <details key={rarity} open style={{ borderRadius: 10, border: `1px solid rgba(124,92,252,0.10)`, background: "rgba(255,255,255,0.015)", padding: "8px 12px" }}>
                <summary style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: "pointer", listStyle: "none",
                  fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: RARITY_COLOR_PS[rarity] ?? TXT2,
                  userSelect: "none", marginBottom: 2,
                }}>
                  <span style={{ fontSize: 10, color: "rgba(220,220,255,0.55)", fontWeight: 600, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
                    {RARITY_LABEL_PS[rarity] ?? rarity} ({ownedInGroup}/{groupItems.length})
                  </span>
                  <div style={{ flex: 1, height: 1, background: "currentColor", opacity: 0.15 }} />
                </summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 8 }}>
                  {groupItems.map(it => {
                    const isEquipped = (equipped as any)?.[tab] === it.code;
                    const isOwned    = !!it.free || (it.code != null && ownedSet.has(it.code));
                    const locked     = !isOwned;
                    const cardPreview = previewForItem(it);

                    return (
                      <button
                        key={`${it.kind}:${String(it.code)}`}
                        onClick={() => isOwned ? doEquip(it.kind, it.code) : undefined}
                        disabled={!token || loading || saving || !isOwned}
                        title={!isOwned ? `Non possédé — source : ${niceUnlock(it.unlock)}` : isEquipped ? "Cliquer pour retirer" : "Cliquer pour équiper"}
                        style={{
                          textAlign: "left", borderRadius: 11, padding: 14, cursor: !isOwned ? "not-allowed" : "pointer",
                          border: `1px solid ${isEquipped ? "rgba(124,92,252,0.35)" : BOR}`,
                          background: isEquipped ? ACC_D : (locked ? "rgba(255,255,255,0.02)" : SURF2),
                          opacity: locked ? 0.48 : 1,
                          transform: isEquipped ? "translateY(-1px)" : "none",
                          boxShadow: isEquipped ? "0 4px 20px rgba(124,92,252,0.15)" : "none",
                          transition: "transform 130ms, box-shadow 130ms, border-color 130ms",
                        }}
                      >
                        {/* Header row */}
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 14, color: TXT, minWidth: 0 }}>
                            {renderItemName(it)}
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {isEquipped ? (
                              <StatusBadge color="green">✅ Équipé</StatusBadge>
                            ) : it.free ? (
                              <StatusBadge color="purple">🎁 Gratuit</StatusBadge>
                            ) : isOwned ? (
                              <StatusBadge color="gray">🧾 Possédé</StatusBadge>
                            ) : (
                              <StatusBadge color="red">🔒</StatusBadge>
                            )}
                          </div>
                        </div>

                        {/* Lock hint */}
                        {locked && it.unlock && (
                          <div style={{ fontFamily: FONT, fontSize: 10, color: TXT2, fontStyle: "italic", marginBottom: 6 }}>
                            🔒 Source : {niceUnlock(it.unlock)}
                          </div>
                        )}

                        {/* Preview bubble */}
                        <div style={{ pointerEvents: "none", opacity: locked ? 0.65 : 1, marginBottom: 8,
                          ...(({ ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor, ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor }) as any) }}>
                          <ChatMessageBubble
                            streamerAppearance={streamerAppearance}
                            msg={{ id: `cp:${it.kind}:${String(it.code)}`, userId: myUserId || 0, username, body: "…", createdAt: new Date().toISOString(), cosmetics: cardPreview }}
                          />
                        </div>

                        {/* Footer: description */}
                        {it.desc && (
                          <div style={{ fontFamily: FONT, fontSize: 11, color: TXT2 }}>
                            {it.unlock === "shop" ? "Shop — " : ""}{it.desc}
                          </div>
                        )}

                        {/* Equip CTA hint */}
                        {isOwned && (
                          <div style={{ marginTop: 8, fontFamily: FONT, fontSize: 11, color: isEquipped ? "#c4b5fd" : TXT2, fontWeight: 600 }}>
                            {isEquipped ? "Cliquer pour retirer" : "Cliquer pour équiper →"}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
