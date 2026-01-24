// web/src/components/profile/PersonalisationSection.mobile.tsx
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
  code: string | null; // null = retirer
  name: string;
  desc?: string;
  free?: boolean;
  priceRubis?: number | null;
  pricePrestige?: number | null;
  rarity?: string;
  unlock?: string;
};

const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://lunalive-api.onrender.com").replace(/\/$/, "");

const CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo", emoji: "✨" },
  { id: "badge", label: "Badges", emoji: "🏷️" },
  { id: "hat", label: "Chapeaux", emoji: "🧢" },
  { id: "frame", label: "Cadrans", emoji: "💬" },
  { id: "title", label: "Titres", emoji: "🏆" },
];

function niceUnlock(u?: string) {
  if (!u) return "";
  if (u === "shop") return "Shop";
  if (u === "achievement") return "Succès";
  if (u === "role") return "Rôle";
  if (u === "event") return "Event";
  if (u === "system") return "Système";
  return u;
}

/* ─────────────────────────────────────────────
   Avatar helpers (compact upload)
───────────────────────────────────────────── */
function parseJwt(token: string): any | null {
  try {
    const p = token.split(".")[1];
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(b64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const ab = await blob.arrayBuffer();
  const bytes = new Uint8Array(ab);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function makeSquareAvatar(
  file: File,
  size = 160
): Promise<{ mime: string; b64: string; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image_load_failed"));
  });

  const s = Math.min(img.width, img.height);
  const sx = Math.floor((img.width - s) / 2);
  const sy = Math.floor((img.height - s) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);

  const blob: Blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b || new Blob()), "image/webp", 0.82);
  });

  const finalBlob =
    blob && blob.size > 0
      ? blob
      : await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", 0.85);
        });

  URL.revokeObjectURL(url);

  const mime = finalBlob.type || "image/webp";
  const b64 = await blobToBase64(finalBlob);
  const previewUrl = URL.createObjectURL(finalBlob);

  return { mime, b64, previewUrl };
}

/* ─────────────────────────────────────────────
   Cosmetics mapping (preview)
───────────────────────────────────────────── */
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

function renderItemTitle(it: UiItem) {
  if (it.kind === "badge" && it.code) {
    const tier = rarityToTier(it.rarity || "");
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 1000, opacity: 0.75 }}>Badge</span>
        <span className={`chatBadge badge--${tier}`}>{badgeTextFromCode(it.code)}</span>
      </span>
    );
  }
  return <span style={{ fontWeight: 1100 }}>{it.name}</span>;
}

function kindBorder(kind: Kind) {
  const map: Record<Kind, string> = {
    username: "rgba(255, 213, 74, 0.22)",
    badge: "rgba(190, 240, 255, 0.22)",
    hat: "rgba(126, 76, 179, 0.22)",
    frame: "rgba(63, 86, 203, 0.22)",
    title: "rgba(180, 140, 255, 0.22)",
  };
  return map[kind] || "rgba(255,255,255,0.10)";
}

function titleLabelFallback(code: string) {
  const raw = code.replace(/^title_/, "").replace(/_/g, " ").trim();
  if (!raw) return code;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
    c.badges = [{ id: txt, code: txt, text: txt, label: txt }];
    (c as any).badgeText = txt;
    return;
  }

  if (kind === "hat") {
    const map: Record<string, string> = {
      hat_luna_cap: "luna_cap",
      hat_carton_crown: "carton_crown",
      hat_demon_horn: "demon_horn",
      hat_eclipse_halo: "eclipse_halo",
      hat_astral_helmet: "astral_helmet",
      hat_lotus_aureole: "lotus_aureole",
    };
    const hatId = map[code] ?? code;

    c.avatar.hatId = hatId;

    const EMOJI: Record<string, string> = {
      luna_cap: "🧢",
      carton_crown: "👑",
      demon_horn: "😈",
      eclipse_halo: "⭕",
      astral_helmet: "🪖",
      lotus_aureole: "🪷",
    };
    c.avatar.hatEmoji = EMOJI[hatId] ?? "🧢";
    return;
  }

  if (kind === "username") {
    const map: Record<string, string> = {
      uanim_chroma_toggle: "chroma",
      uanim_gold_toggle: "gold",
      uanim_rainbow_scroll: "rainbow_scroll",
      uanim_neon_underline: "neon_underline",
    };
    const effect = map[code] ?? code;
    c.username.effect = effect;
    c.username.animId = effect;
    c.username.anim = effect;
    return;
  }

  if (kind === "frame") {
    const frameId = frameIdFromCode(code);
    c.frame = { frameId };
    return;
  }

  if (kind === "title") {
    const label = opts?.titleNames?.[code] ?? titleLabelFallback(code);
    c.title = { text: label, label };
    (c as any).titleText = label;
    return;
  }
}

function buildCosmeticsPreview(
  equipped: { username: string | null; badge: string | null; title: string | null; frame: string | null; hat: string | null },
  opts?: { titleNames?: Record<string, string> }
): ChatCosmetics | null {
  const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} };
  applyPreview("username", equipped?.username ?? null, c, opts);
  applyPreview("badge", equipped?.badge ?? null, c, opts);
  applyPreview("title", equipped?.title ?? null, c, opts);
  applyPreview("frame", equipped?.frame ?? null, c, opts);
  applyPreview("hat", equipped?.hat ?? null, c, opts);
  return c as ChatCosmetics;
}

function byOwnedFirst(ownedSet: Set<string>, a: UiItem, b: UiItem) {
  const ao = a.free || (a.code != null && ownedSet.has(a.code));
  const bo = b.free || (b.code != null && ownedSet.has(b.code));
  if (ao !== bo) return ao ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function Chip({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "pink" | "blue" | "green" | "gold";
  title?: string;
}) {
  const tones: Record<string, { bg: string; bd: string }> = {
    neutral: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)" },
    pink: { bg: "rgba(255, 90, 180, 0.14)", bd: "rgba(255, 90, 180, 0.26)" },
    blue: { bg: "rgba(80, 160, 255, 0.14)", bd: "rgba(80, 160, 255, 0.26)" },
    green: { bg: "rgba(80, 240, 170, 0.12)", bd: "rgba(80, 240, 170, 0.22)" },
    gold: { bg: "rgba(255, 210, 110, 0.14)", bd: "rgba(255, 210, 110, 0.26)" },
  };
  const t = tones[tone] ?? tones.neutral;

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        fontSize: 13,
        fontWeight: 1000,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </span>
  );
}

function CatPill({
  active,
  onClick,
  emoji,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  emoji: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 999,
        border: active ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "linear-gradient(90deg, rgba(140,90,255,0.30), rgba(80,160,255,0.22), rgba(255,90,180,0.16))"
          : "rgba(255,255,255,0.05)",
        boxShadow: active ? "0 16px 40px rgba(0,0,0,0.25)" : "none",
        color: "inherit",
        fontWeight: 1100,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        backdropFilter: "blur(10px)",
        flex: "0 0 auto",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: 16 }}>{emoji}</span>
      <span>{label}</span>
    </button>
  );
}

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

  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarPayload, setAvatarPayload] = React.useState<{ mime: string; b64: string } | null>(null);
  const [avatarBusy, setAvatarBusy] = React.useState(false);

  const [tab, setTab] = React.useState<Kind>("username");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const [catalog, setCatalog] = React.useState<ApiCatalogItem[]>([]);
  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [free, setFree] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  }>({ username: null, badge: null, title: null, frame: null, hat: null });

  React.useEffect(() => {
    if (!myUserId) return;
    setAvatarUrl(`${API_BASE}/avatars/u/${myUserId}?v=${Date.now()}`);
  }, [myUserId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const [c, m] = await Promise.all([cosmeticsCatalog(token), myCosmetics(token)]);
      if (!c?.ok) throw new Error("catalog_failed");
      if (!m?.ok) throw new Error((m as any)?.error || "load_failed");
      setCatalog(((c as any).items || []).filter((x: any) => x && x.active));
      setOwned(m.owned || {});
      setFree(m.free || {});
      setEquipped(m.equipped || {});
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  async function doEquip(kind: Kind, code: string | null) {
    if (!token) return;
    setSaving(true);
    setErr(null);
    try {
      const cur = (equipped as any)?.[kind] ?? null;
      const next = cur === code ? null : code;
      const j = await equipCosmetic(token, kind, next);
      if (!j?.ok) throw new Error(j?.error || "equip_failed");
      setEquipped((prev) => ({ ...(prev || {}), ...(j.equipped || {}) }));
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const titleNames = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const it of catalog) {
      if (it?.kind === "title" && it.code && it.name) m[it.code] = it.name;
    }
    return m;
  }, [catalog]);

  const ownedSet = new Set<string>([...(owned?.[tab] || []), ...(free?.[tab] || [])]);

  const items: UiItem[] = [
    { kind: tab, code: null, name: tab === "username" ? "Par défaut" : "Aucun", free: true, desc: "Retirer l’élément équipé." },
    ...catalog
      .filter((x) => x.kind === tab)
      .map((x) => {
        const pricePrestige = Number((x as any).pricePrestige ?? 0) || null;
        const desc =
          x.unlock === "shop"
            ? x.priceRubis
              ? `Shop — ${Number(x.priceRubis).toLocaleString("fr-FR")} rubis`
              : pricePrestige
              ? `Shop — ${Number(pricePrestige).toLocaleString("fr-FR")} prestige`
              : "Shop"
            : `${niceUnlock(x.unlock)}${x.rarity ? ` — ${x.rarity}` : ""}`;

        return { kind: x.kind, code: x.code, name: x.name, desc, priceRubis: x.priceRubis, pricePrestige, rarity: x.rarity, unlock: x.unlock };
      }),
  ].sort((a, b) => byOwnedFirst(ownedSet, a, b));

  const effectiveAvatar = avatarUrl;

  function withAvatar<C extends ChatCosmetics | null>(c: C): C {
    if (!c) return c;
    return ({
      ...(c as any),
      avatar: { ...((c as any).avatar || {}), url: effectiveAvatar || undefined },
    } as any) as C;
  }

  const previewCosmetics = withAvatar(buildCosmeticsPreview(equipped, { titleNames }));

  // ✅ Aperçu PAR ITEM (comme desktop) : on simule l'équipement du code de l'item sur l'onglet courant
  function previewForItem(it: UiItem): ChatCosmetics | null {
    const simulated = {
      username: it.kind === "username" ? it.code : equipped.username,
      badge: it.kind === "badge" ? it.code : equipped.badge,
      title: it.kind === "title" ? it.code : equipped.title,
      frame: it.kind === "frame" ? it.code : equipped.frame,
      hat: it.kind === "hat" ? it.code : equipped.hat,
    };
    return withAvatar(buildCosmeticsPreview(simulated, { titleNames }));
  }

  const curLabel = CATS.find((x) => x.id === tab)?.label ?? tab;
  const curEmoji = CATS.find((x) => x.id === tab)?.emoji ?? "🎨";

  const nameByCode = React.useMemo(() => {
    const m: Record<string, string> = {};
    for (const it of catalog) if (it?.code && it?.name) m[it.code] = it.name;
    return m;
  }, [catalog]);

  function equippedLabel(kind: Kind, code: string | null) {
    if (!code) return "—";
    if (kind === "badge") return `Badge ${badgeTextFromCode(code)}`;
    if (kind === "title") return nameByCode[code] || titleNames[code] || titleLabelFallback(code);
    return nameByCode[code] || code;
  }

  // ✅ Swipe interne (uniquement pour changer Pseudo/Badge/Hat/Frame/Title)
  // -> Pointer Events + capture pour BLOQUER le swipe du menu parent
  const catsOrder = React.useMemo(() => CATS.map((c) => c.id), []);
  const swipeRef = React.useRef({
    active: false,
    decided: false,
    horizontal: false,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    pointerId: -1,
  });

  function catIndex(id: Kind) {
    const i = catsOrder.indexOf(id);
    return i >= 0 ? i : 0;
  }
  function setCatByIndex(i: number) {
    const n = catsOrder.length;
    const clamped = Math.max(0, Math.min(n - 1, i));
    setTab(catsOrder[clamped] as Kind);
  }

  function swipeStart(x: number, y: number, pointerId: number) {
    swipeRef.current.active = true;
    swipeRef.current.decided = false;
    swipeRef.current.horizontal = false;
    swipeRef.current.x0 = x;
    swipeRef.current.y0 = y;
    swipeRef.current.dx = 0;
    swipeRef.current.dy = 0;
    swipeRef.current.pointerId = pointerId;
  }

  function swipeMove(e: React.PointerEvent, x: number, y: number) {
    if (!swipeRef.current.active) return;

    const dx = x - swipeRef.current.x0;
    const dy = y - swipeRef.current.y0;
    swipeRef.current.dx = dx;
    swipeRef.current.dy = dy;

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!swipeRef.current.decided) {
      if (adx > 8 || ady > 8) {
        swipeRef.current.decided = true;
        swipeRef.current.horizontal = adx > ady * 1.1;
      }
    }

    // si horizontal => on bloque le parent (menu)
    if (swipeRef.current.decided && swipeRef.current.horizontal) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }
  }

  function swipeEnd(e: React.PointerEvent) {
    if (!swipeRef.current.active) return;

    const { decided, horizontal, dx, dy } = swipeRef.current;
    swipeRef.current.active = false;

    if (!(decided && horizontal)) return;

    e.stopPropagation();

    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < 45 || adx < ady * 1.2) return;

    const idx = catIndex(tab);
    if (dx < 0) setCatByIndex(idx + 1); // swipe gauche => next
    else setCatByIndex(idx - 1); // swipe droite => prev
  }

  function onPointerDownCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeStart(e.clientX, e.clientY, e.pointerId);

    // lock sur le composant => le parent ne récupère plus le gesture
    try {
      (e.currentTarget as any).setPointerCapture?.(e.pointerId);
    } catch {}
  }
  function onPointerMoveCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeMove(e, e.clientX, e.clientY);
  }
  function onPointerUpCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeEnd(e);
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {}
  }
  function onPointerCancelCapture(e: React.PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    swipeRef.current.active = false;
    try {
      (e.currentTarget as any).releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  return (
    <div
      data-noswipe-profiletabs="1"
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onPointerUpCapture}
      onPointerCancelCapture={onPointerCancelCapture}
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background:
          "radial-gradient(900px 300px at 20% 0%, rgba(255,90,180,0.16), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10))",
        padding: 12,
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
        backdropFilter: "blur(10px)",
        touchAction: "pan-y",           // ✅ scroll vertical ok
        overscrollBehaviorX: "contain", // ✅ évite swipe parent/back
      }}
    >

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
        <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <div style={{ fontWeight: 1200, letterSpacing: -0.2 }}>🎨 Personnalisation</div>
          <div className="muted" style={{ lineHeight: 1.3 }}>
            Mobile: tu swipes dans la liste pour changer de catégorie (Pseudo/Badges/Chapeaux/Cadrans/Titres).
          </div>
        </div>

        <button className="btnGhost" onClick={load} disabled={!token || loading || saving} style={{ flex: "0 0 auto" }}>
          {loading ? "…" : "🔄"}
        </button>
      </div>

      {!token ? <div className="muted" style={{ marginTop: 10 }}>Connecte-toi pour gérer tes skins.</div> : null}

      {err ? (
        <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* ✅ IMPORTANT: wrapper vertical => Avatar puis Aperçu, jamais côte-à-côte */}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12, minWidth: 0 }}>
        {/* ✅ Avatar EN PREMIER */}
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background:
              "radial-gradient(600px 240px at 20% 0%, rgba(80,160,255,0.18), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10))",
            padding: 12,
            boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
            backdropFilter: "blur(10px)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", minWidth: 0 }}>
            <div style={{ fontWeight: 1100 }}>🖼️ Avatar</div>
            <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>carré • auto-crop</div>
          </div>

          {/* grid interne => pas de débordement horizontal */}
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "72px 1fr", gap: 12, alignItems: "center", minWidth: 0 }}>
            <div
              style={{
                width: 66,
                height: 66,
                borderRadius: 22,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "linear-gradient(135deg, rgba(140,90,255,0.25), rgba(80,160,255,0.14), rgba(255,90,180,0.10))",
                overflow: "hidden",
                display: "grid",
                placeItems: "center",
                boxShadow: "0 18px 50px rgba(0,0,0,0.25)",
              }}
            >
              {(avatarPreview || avatarUrl) ? (
                <img
                  src={avatarPreview || `${avatarUrl}`}
                  alt=""
                  onError={(e) => (((e.currentTarget as HTMLImageElement).style.display = "none"))}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ fontWeight: 1200, letterSpacing: 1 }}>{getInitials(username)}</div>
              )}
            </div>

            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              <button
                className="btnGhost"
                disabled={!token || avatarBusy}
                onClick={() => fileRef.current?.click()}
                style={{ justifyContent: "center", minWidth: 0, whiteSpace: "normal", lineHeight: 1.2 }}
              >
                {avatarPayload ? "🪄 Changer l’image" : "⬆️ Uploader une image"}
              </button>

              {avatarPayload ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button
                    className="btnPrimary"
                    disabled={!token || avatarBusy}
                    onClick={async () => {
                      if (!token || !avatarPayload) return;
                      setAvatarBusy(true);
                      setErr(null);
                      try {
                        const r = await fetch(`${API_BASE}/me/avatar`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ mime: avatarPayload.mime, data: avatarPayload.b64 }),
                        });
                        const j = await r.json();
                        if (!j?.ok) throw new Error(j?.error || "upload_failed");

                        const bust = Date.now();
                        setAvatarUrl(String(j?.avatarUrl || `${API_BASE}/avatars/u/${myUserId}?v=${bust}`));

                        setAvatarPayload(null);
                        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                        setAvatarPreview(null);
                      } catch (e: any) {
                        setErr(String(e?.message || "Erreur"));
                      } finally {
                        setAvatarBusy(false);
                      }
                    }}
                    style={{ minWidth: 0 }}
                  >
                    {avatarBusy ? "Upload…" : "✅ Valider"}
                  </button>

                  <button
                    className="btnGhost"
                    disabled={avatarBusy}
                    onClick={() => {
                      setAvatarPayload(null);
                      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                      setAvatarPreview(null);
                    }}
                    style={{ minWidth: 0 }}
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  className="btnGhost"
                  disabled={!token || avatarBusy}
                  onClick={async () => {
                    if (!token) return;
                    setAvatarBusy(true);
                    setErr(null);
                    try {
                      const r = await fetch(`${API_BASE}/me/avatar`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const j = await r.json().catch(() => ({}));
                      if (j?.ok !== true) throw new Error(j?.error || "delete_failed");
                      setAvatarUrl(null);
                    } catch (e: any) {
                      setErr(String(e?.message || "Erreur"));
                    } finally {
                      setAvatarBusy(false);
                    }
                  }}
                  style={{ minWidth: 0 }}
                >
                  🗑️ Supprimer
                </button>
              )}
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setErr(null);
              setAvatarBusy(true);
              try {
                const { mime, b64, previewUrl } = await makeSquareAvatar(f, 160);
                setAvatarPayload({ mime, b64 });
                if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                setAvatarPreview(previewUrl);
              } catch (err: any) {
                setErr(String(err?.message || "avatar_prepare_failed"));
              } finally {
                setAvatarBusy(false);
              }
            }}
          />
        </div>

        {/* ✅ Aperçu JUSTE EN DESSOUS */}
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10))",
            padding: 12,
            boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
            backdropFilter: "blur(10px)",
            boxSizing: "border-box",
            ...({
              ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
              ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
            } as any),
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", minWidth: 0 }}>
            <div style={{ fontWeight: 1100 }}>✨ Aperçu</div>
            <div className="muted" style={{ fontSize: 12 }}>{saving ? "Enregistrement…" : ""}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <Chip tone="gold" title="Catégorie active">
              {curEmoji} <b>{curLabel}</b>
            </Chip>
            <Chip tone="neutral" title="Pseudo">
              ✨ <span style={{ opacity: 0.85 }}>Pseudo:</span> <b>{equippedLabel("username", equipped.username)}</b>
            </Chip>
            <Chip tone="blue" title="Badge">
              🏷️ <span style={{ opacity: 0.85 }}>Badge:</span> <b>{equippedLabel("badge", equipped.badge)}</b>
            </Chip>
            <Chip tone="pink" title="Titre">
              🏆 <span style={{ opacity: 0.85 }}>Titre:</span> <b>{equippedLabel("title", equipped.title)}</b>
            </Chip>
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <ChatMessageBubble
              streamerAppearance={streamerAppearance}
              msg={{
                id: "preview-1",
                userId: myUserId || 0,
                username,
                body: "Exemple — “ça rend comment ?”",
                createdAt: new Date().toISOString(),
                cosmetics: previewCosmetics,
              }}
            />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          overflowX: "auto",
          paddingBottom: 6,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {CATS.map((c) => (
          <CatPill
            key={c.id}
            active={tab === c.id}
            emoji={c.emoji}
            label={c.label}
            onClick={() => setTab(c.id)}
            disabled={loading || saving}
          />
        ))}
      </div>

      {/* Items list + ✅ zone SWIPE (bloque le swipe des tabs globales) */}
      <div
        style={{
          marginTop: 12,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10))",
          padding: 12,
          boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
          backdropFilter: "blur(10px)",
          // 👇 crucial: laisse le scroll vertical, mais empêche le pan horizontal par défaut => on gère le swipe nous-mêmes
          touchAction: "pan-y",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 1100 }}>
            {curEmoji} {curLabel}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {saving ? "Enregistrement…" : loading ? "Chargement…" : `${items.length} items`}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {items.map((it) => {
            const isEquipped = (equipped as any)?.[tab] === it.code;
            const isOwned = !!it.free || (it.code != null && ownedSet.has(it.code));
            const locked = !isOwned;

            const baseBorder = kindBorder(it.kind);
            const border = isEquipped ? `1px solid rgba(255,255,255,0.22)` : `1px solid ${baseBorder}`;

            const bg = locked
              ? "rgba(0,0,0,0.42)"
              : "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.10))";

            const cardPreviewCosmetics = previewForItem(it);

            return (
              <button
                key={`${it.kind}:${String(it.code)}`}
                onClick={() => (isOwned ? doEquip(it.kind, it.code) : null)}
                disabled={!token || loading || saving || !isOwned}
                title={!isOwned ? "Non possédé" : isEquipped ? "Cliquer pour retirer" : "Cliquer pour équiper"}
                style={{
                  textAlign: "left",
                  borderRadius: 16,
                  border,
                  background: bg,
                  color: "white",
                  padding: 12,
                  cursor: !isOwned ? "not-allowed" : "pointer",
                  opacity: locked ? 0.55 : 1,
                  boxShadow: isEquipped ? "0 18px 50px rgba(0,0,0,0.22)" : "none",
                  transform: isEquipped ? "translateY(-1px)" : "translateY(0px)",
                  transition: "transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 1100, lineHeight: 1.2 }}>
                      {renderItemTitle(it)}
                    </div>

                    <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 1100,
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: isEquipped ? "rgba(124,77,255,0.18)" : "rgba(255,255,255,0.06)",
                        }}
                      >
                        {isEquipped ? "✅ Équipé" : it.free ? "🎁 Gratuit" : isOwned ? "🧾 Possédé" : "🔒 Verrouillé"}
                      </span>

                      {!it.free ? (
                        <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.88 }}>
                          {niceUnlock(it.unlock)}
                          {it.unlock === "shop"
                            ? it.priceRubis != null
                              ? ` — ${Number(it.priceRubis).toLocaleString("fr-FR")} rubis`
                              : it.pricePrestige != null
                              ? ` — ${Number(it.pricePrestige).toLocaleString("fr-FR")} prestige`
                              : ""
                            : it.rarity
                            ? ` — ${it.rarity}`
                            : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.78 }}>Retirer l’élément</span>
                      )}
                    </div>

                    {it.desc ? (
                      <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                        {it.desc}
                      </div>
                    ) : null}
                  </div>

                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <span style={{ opacity: 0.70, fontSize: 16 }}>
                      {it.kind === "badge" ? "🏷️" : it.kind === "hat" ? "🧢" : it.kind === "frame" ? "💬" : it.kind === "title" ? "🏆" : "✨"}
                    </span>
                    {isOwned ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 1100,
                          padding: "4px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: isEquipped ? "rgba(124,77,255,0.18)" : "rgba(255,255,255,0.06)",
                        }}
                      >
                        {isEquipped ? "Retirer" : "Équiper"}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* ✅ APERÇU de l'item (comme desktop) */}
                <div
                  style={{
                    marginTop: 10,
                    pointerEvents: "none",
                    opacity: locked ? 0.75 : 0.95,
                    ...({
                      ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
                      ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
                    } as any),
                  }}
                >
                  <ChatMessageBubble
                    streamerAppearance={streamerAppearance}
                    msg={{
                      id: `cardpreview:${it.kind}:${String(it.code)}`,
                      userId: myUserId || 0,
                      username,
                      body: "…",
                      createdAt: new Date().toISOString(),
                      cosmetics: cardPreviewCosmetics,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PersonalisationSectionMobile;
