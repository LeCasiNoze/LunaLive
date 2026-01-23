// web/src/pages/ShopPage.mobile.tsx
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

function withAvatar<C extends ChatCosmetics | null>(c: C, userId: number | null | undefined): C {
  if (!c) return c;
  const uid = Number(userId || 0);
  if (!uid) return c;

  const url = `${API_BASE}/avatars/u/${uid}?v=${Date.now()}`;
  return ({
    ...(c as any),
    avatar: { ...((c as any).avatar || {}), url },
  } as any) as C;
}

const TOP_TABS = [
  { id: "skins", label: "Skins" },
  { id: "upgrades", label: "Améliorations" },
  { id: "subs", label: "Abonnements" },
  { id: "rubis", label: "Rubis" },
] as const;

const SKIN_CATS: Array<{ id: Kind; label: string; emoji: string }> = [
  { id: "username", label: "Pseudo", emoji: "✨" },
  { id: "badge", label: "Badges", emoji: "🏷️" },
  { id: "hat", label: "Chapeaux", emoji: "🧢" },
  { id: "frame", label: "Cadrans", emoji: "💬" },
  { id: "title", label: "Titres", emoji: "🏆" },
];

const TITLE_LABELS: Record<string, string> = {
  title_ratus: "Ratus",
  title_ca_tourne: "Ça tourne !",
  title_vrai_viewer: "Vrai Viewer",
  title_no_life: "No Life",
  title_batman: "Batman",
  title_bigmoula: "BigMoula",
  title_lunaking: "LunaKing",
  title_allin_man: "All-in Man",
};

function titleLabelFromCode(code: string) {
  if (TITLE_LABELS[code]) return TITLE_LABELS[code];
  if (code.startsWith("title_")) return code.replace(/^title_/, "").replace(/_/g, " ");
  return code;
}

/** IMPORTANT: même parsing que PersonalisationSection (sinon cadrans noirs) */
function frameIdFromCode(code: string) {
  return String(code || "")
    .replace(/^m?frame_/, "")
    .replace(/_(shop|event|master)$/, "");
}

/** mêmes mappings que PersonalisationSection (v1) */
function applyPreview(kind: Kind, code: string | null, c: any) {
  if (!code) return;

  if (!c.avatar) c.avatar = {};
  if (!c.username) c.username = {};
  if (!Array.isArray(c.badges)) c.badges = [];
  if (c.title === undefined) c.title = null;

  if (kind === "badge") {
    const txt = code === "badge_luna" ? "LUNA" : code === "badge_777" ? "777" : code;
    c.badges = [{ id: txt, code: txt, text: txt, label: txt }];
    (c as any).badge = txt;
    (c as any).badgeText = txt;
    (c as any).badgeLabel = txt;
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
    const label = titleLabelFromCode(code);
    c.title = { text: label, label };
    (c as any).titleText = label;
    return;
  }
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
  if (code.startsWith("badge_")) return code.replace(/^badge_/, "").toUpperCase();
  return code.toUpperCase();
}

function kindEmoji(kind: Kind) {
  if (kind === "username") return "✨";
  if (kind === "badge") return "🏷️";
  if (kind === "hat") return "🧢";
  if (kind === "frame") return "💬";
  if (kind === "title") return "🏆";
  return "🎁";
}

function renderItemTitle(it: ShopCosmeticItem) {
  if (it.kind === "badge") {
    const tier = rarityToTier((it as any).rarity);
    return (
      <span className="mShopTitleRow">
        <span className="mShopTitleKind">Badge</span>
        <span className={`chatBadge badge--${tier}`}>{badgeTextFromCode(it.code)}</span>
      </span>
    );
  }

  return (
    <span className="mShopTitleRow">
      <span className="mShopTitleIcon" aria-hidden>
        {kindEmoji(it.kind as Kind)}
      </span>
      <span className="mShopTitleText">{it.name}</span>
    </span>
  );
}

function buildCosmeticsPreview(equipped: {
  username: string | null;
  badge: string | null;
  title: string | null;
  frame: string | null;
  hat: string | null;
}): ChatCosmetics | null {
  const c: any = { badges: [], title: null, frame: null, avatar: { hatId: null }, username: {} };
  applyPreview("username", equipped?.username ?? null, c);
  applyPreview("badge", equipped?.badge ?? null, c);
  applyPreview("title", equipped?.title ?? null, c);
  applyPreview("frame", equipped?.frame ?? null, c);
  applyPreview("hat", equipped?.hat ?? null, c);
  return c as ChatCosmetics;
}

function sortByPriceAsc(a: ShopCosmeticItem, b: ShopCosmeticItem) {
  const ar = a.priceRubis == null ? Number.POSITIVE_INFINITY : Number(a.priceRubis);
  const br = b.priceRubis == null ? Number.POSITIVE_INFINITY : Number(b.priceRubis);

  const ap =
    (a as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((a as any).pricePrestige);
  const bp =
    (b as any).pricePrestige == null ? Number.POSITIVE_INFINITY : Number((b as any).pricePrestige);

  const aGroup = ar !== Number.POSITIVE_INFINITY ? 0 : ap !== Number.POSITIVE_INFINITY ? 1 : 2;
  const bGroup = br !== Number.POSITIVE_INFINITY ? 0 : bp !== Number.POSITIVE_INFINITY ? 1 : 2;

  if (aGroup !== bGroup) return aGroup - bGroup;

  const aPrice = aGroup === 0 ? ar : aGroup === 1 ? ap : Number.POSITIVE_INFINITY;
  const bPrice = bGroup === 0 ? br : bGroup === 1 ? bp : Number.POSITIVE_INFINITY;

  if (aPrice !== bPrice) return aPrice - bPrice;
  return a.name.localeCompare(b.name);
}

function normalizeOwnedRecord(x: any): Record<string, string[]> {
  if (!x) return {};
  if (typeof x === "object" && !Array.isArray(x)) return x as Record<string, string[]>;
  return {};
}

type SubSlide = { title: string; points: string[] };
type SubPlan = {
  id: "viewer" | "streamer";
  label: string;
  badge: string;
  icon: string;
  priceText: string;
  visibleIf: (u: { role?: string } | null) => boolean;
  slides: SubSlide[];
  ctaLabel: string;
};

function isStreamerRole(role?: string) {
  const r = String(role || "").toLowerCase();
  return r === "streamer" || r === "admin_streamer" || r.includes("streamer");
}

function PricePill({
  rubis,
  prestige,
  owned,
  equipped,
}: {
  rubis: number | null;
  prestige: number | null;
  owned: boolean;
  equipped: boolean;
}) {
  if (equipped) return <span className="mPill mPill--eq">✅ Équipé</span>;
  if (owned) return <span className="mPill mPill--owned">🧾 Possédé</span>;

  if (prestige != null && Number.isFinite(prestige) && prestige > 0) {
    return <span className="mPill mPill--price">🏆 {Number(prestige).toLocaleString("fr-FR")}</span>;
  }
  if (rubis != null && Number.isFinite(rubis) && rubis > 0) {
    return <span className="mPill mPill--price">💎 {Number(rubis).toLocaleString("fr-FR")}</span>;
  }
  return <span className="mPill mPill--muted">—</span>;
}

/* ------------------------------ Bottom sheet ------------------------------ */

function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mSheetOverlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="mSheet" onClick={(e) => e.stopPropagation()}>
        <div className="mSheetGrab" />
        <div className="mSheetHead">
          <div className="mSheetTitle">{title}</div>
          <button className="btnGhostSmall" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>
        <div className="mSheetBody">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------ PAGE ------------------------------ */

export default function ShopPageMobile({
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  streamerAppearance?: StreamerAppearance;
}) {
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
  const [, setLoadingTalents] = React.useState(false);

  const [items, setItems] = React.useState<ShopCosmeticItem[]>([]);
  const [owned, setOwned] = React.useState<Record<string, string[]>>({});
  const [equipped, setEquipped] = React.useState<{
    username: string | null;
    badge: string | null;
    title: string | null;
    frame: string | null;
    hat: string | null;
  }>({ username: null, badge: null, title: null, frame: null, hat: null });

  const [selected, setSelected] = React.useState<{ kind: Kind; code: string } | null>(null);

  function syncRubis(v: number, source: string) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setAvailableRubis(n);
    patchUser?.({ rubis: n });
    window.dispatchEvent(new CustomEvent("rubis:update", { detail: { rubis: n, source } }));
  }

  async function loadTalents() {
    if (!token) return;
    setLoadingTalents(true);
    try {
      const j: any = await shopTalents(token);
      if (j?.ok) {
        setTalents(j.talents || []);
        if (Number.isFinite(Number(j.availableRubis))) syncRubis(Number(j.availableRubis), "shop:talents");
      }
    } finally {
      setLoadingTalents(false);
    }
  }

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
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
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    try {
      const want = String(localStorage.getItem("shop:openTab") || "");
      if (want && ["skins", "upgrades", "subs", "rubis"].includes(want)) setTopTab(want as any);
      localStorage.removeItem("shop:openTab");
    } catch {}
  }, []);

  React.useEffect(() => {
    if (user?.rubis != null) syncRubis(Number(user.rubis), "auth:user");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rubis]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  React.useEffect(() => {
    if (topTab === "upgrades") loadTalents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab]);

  const effectiveRubis = Number.isFinite(availableRubis) ? availableRubis : user?.rubis ?? 0;
  const effectivePrestige = Number.isFinite(availablePrestige) ? availablePrestige : 0;

  const visible = React.useMemo(() => {
    return items.filter((x) => x.kind === cat).slice().sort(sortByPriceAsc);
  }, [items, cat]);

  function isOwnedItem(it: ShopCosmeticItem) {
    const ownedByBool = (it as any).owned === true;
    const ownedByMap = (owned?.[it.kind] || []).includes(it.code);
    return ownedByBool || ownedByMap;
  }

  function addOwnedLocal(kind: string, code: string) {
    setOwned((prev) => {
      const next = { ...(prev || {}) };
      const arr = Array.isArray(next[kind]) ? next[kind].slice() : [];
      if (!arr.includes(code)) arr.push(code);
      next[kind] = arr;
      return next;
    });

    setItems((prev) =>
      prev.map((x) => (x.kind === kind && x.code === code ? ({ ...(x as any), owned: true } as any) : x))
    );
  }

  async function buy(it: ShopCosmeticItem) {
    if (!token) return;
    if (it.unlock !== "shop") return;

    const pr = Number(it.priceRubis ?? 0);
    const pp = Number((it as any).pricePrestige ?? 0);
    const isRubis = Number.isFinite(pr) && pr > 0;
    const isPrestige = Number.isFinite(pp) && pp > 0;
    if (!isRubis && !isPrestige) return;

    setBuying(true);
    setErr(null);
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
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBuying(false);
    }
  }

  const selectedPreviewCosmetics = React.useMemo(() => {
    const base = { ...equipped };
    if (selected) (base as any)[selected.kind] = selected.code;
    return buildCosmeticsPreview(base);
  }, [equipped, selected]);

  function previewForItem(it: ShopCosmeticItem): ChatCosmetics | null {
    const base = { ...equipped };
    (base as any)[it.kind] = it.code;
    return withAvatar(buildCosmeticsPreview(base), user?.id);
  }

  const username = user?.username ?? "Invité";
  const previewUserId = user?.id ?? 999999;

  const disabledSubsReason = "Les abonnements sont annulables à tout moment.";

  async function onSubscribe(plan: "viewer" | "streamer") {
    if (!token) return;
    setSubsBusy(true);
    setErr(null);
    try {
      const j: any = await billingCheckout(token, plan);
      if (!j?.ok || !j?.url) throw new Error(j?.error || "checkout_failed");
      window.location.href = String(j.url);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur paiement"));
      setSubsBusy(false);
    }
  }

  async function onManage() {
    if (!token) return;
    setSubsBusy(true);
    setErr(null);
    try {
      const j: any = await billingPortal(token);
      if (!j?.ok || !j?.url) throw new Error(j?.error || "portal_failed");
      window.location.href = String(j.url);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur portail"));
      setSubsBusy(false);
    }
  }

  const SUB_PLANS: SubPlan[] = [
    {
      id: "viewer",
      label: "Abonnement Viewer",
      badge: "30 jours",
      icon: "⭐",
      priceText: "19,99 € / 30 jours — renouvellement automatique",
      visibleIf: () => true,
      ctaLabel: "S’abonner",
      slides: [
        {
          title: "Inclus à chaque cycle",
          points: ["🎁 1 ticket “sub offert”", "💎 +500 rubis offerts (à chaque renouvellement)", "✨ Cosmétique exclusif"],
        },
        {
          title: "Boost coffres & gains",
          points: ["🧰 + génération passive dans les coffres de stream", "💰 Bonus sur la récupération des rubis des coffres", "🌧️ Boost sur les rain"],
        },
        {
          title: "Bonus quotidiens & accès",
          points: ["📅 Bonus quotidien supplémentaire", "🎡 Tickets de roue supplémentaires", "📣 Accès à PCall et RandomCall", "⚡ Boost XP (à venir)"],
        },
      ],
    },
    {
      id: "streamer",
      label: "Abonnement Streamer",
      badge: "30 jours",
      icon: "🎥",
      priceText: "49,99 € / 30 jours — renouvellement automatique",
      visibleIf: (u) => isStreamerRole(u?.role),
      ctaLabel: "S’abonner",
      slides: [
        {
          title: "Inclus à chaque cycle",
          points: ["🎁 10 tickets “sub offert” pour ta communauté", "📌 Statut prioritaire (TrustPilot / mise en avant)", "🚀 Priorité retraits (via statut prio côté admin)"],
        },
        {
          title: "Boost stream & features",
          points: ["🧰 +50% génération passive dans ton coffre de stream (proposition)", "🎯 + de prédictions par jour", "🌧️ +1 palier de rain", "🎬 Cap de clips augmenté (à définir)"],
        },
        { title: "Évolutif", points: ["⭐ Le statut prio sert de “flag” pour ajouter des perks futures"] },
      ],
    },
  ];

  const visiblePlans = SUB_PLANS.filter((p) => p.visibleIf(user));

  const selectedItem = React.useMemo(() => {
    if (!selected) return null;
    return items.find((x) => x.kind === selected.kind && x.code === selected.code) ?? null;
  }, [selected, items]);

  const sheetOpen = !!selected && !!selectedItem;

  /* ──────────────────────────────────────────
     SWIPE RULES (ce que tu veux)
     - Swipe sur la BARRE TOP_TABS => change TOP_TABS
     - Swipe dans la zone "skins" (liste) => change SKIN_CATS
     - AUCUN swipe global sur toute la page
  ─────────────────────────────────────────── */

  const TAB_IDS = React.useMemo(() => TOP_TABS.map((t) => t.id), []);
  const CAT_IDS = React.useMemo(() => SKIN_CATS.map((c) => c.id), []);

  function moveTopTab(delta: number) {
    const i = TAB_IDS.indexOf(topTab);
    const next = Math.max(0, Math.min(TAB_IDS.length - 1, i + delta));
    if (next !== i) setTopTab(TAB_IDS[next] as any);
  }
  function moveSkinCat(delta: number) {
    const i = CAT_IDS.indexOf(cat);
    const next = Math.max(0, Math.min(CAT_IDS.length - 1, i + delta));
    if (next !== i) setCat(CAT_IDS[next] as any);
  }

  const swipeRef = React.useRef({
    x0: 0,
    y0: 0,
    t0: 0,
    active: false,
    tracking: false,
    locked: false as false | "x" | "y",
    mode: "none" as "none" | "topTabs" | "skinCats",
  });

  const SWIPE_MIN_X = 60;
  const SWIPE_MAX_Y = 70;
  const SWIPE_MAX_MS = 650;
  const EDGE_GUARD = 8;

  function isInteractiveTarget(target: any) {
    const tag = String(target?.tagName || "").toLowerCase();
    if (!tag) return false;

    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (tag === "button" || tag === "a") return true;

    // opt-out manuel
    if (target?.closest?.("[data-no-swipe='1']")) return true;

    // on bloque si on est dans le bottom sheet
    if (target?.closest?.(".mSheet")) return true;

    return false;
  }

  function detectSwipeMode(target: any): "none" | "topTabs" | "skinCats" {
    // 1) Si on touche la barre des TOP_TABS => swipe TOP_TABS
    if (target?.closest?.(".mTabRow")) return "topTabs";

    // 2) Si on est dans l'onglet skins + on touche dans la zone basse => swipe catégories de skins
    //    On marque explicitement le conteneur "bas" skins avec data-swipe="skinCats"
    if (topTab === "skins" && target?.closest?.("[data-swipe='skinCats']")) return "skinCats";

    return "none";
  }

  function onSwipeStart(e: React.TouchEvent) {
    if (sheetOpen) return;
    const t = e.touches?.[0];
    if (!t) return;

    if (isInteractiveTarget(e.target)) return;
    if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;

    const mode = detectSwipeMode(e.target);
    if (mode === "none") return;

    swipeRef.current = {
      x0: t.clientX,
      y0: t.clientY,
      t0: Date.now(),
      active: true,
      tracking: true,
      locked: false,
      mode,
    };
  }

  function onSwipeMove(e: React.TouchEvent) {
    if (!swipeRef.current.active) return;

    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;

    if (!swipeRef.current.locked) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        swipeRef.current.locked = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (swipeRef.current.locked === "y") {
      swipeRef.current.active = false;
      swipeRef.current.tracking = false;
      return;
    }
  }

  function onSwipeEnd(e: React.TouchEvent) {
    if (!swipeRef.current.tracking) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - swipeRef.current.x0;
    const dy = t.clientY - swipeRef.current.y0;
    const dt = Date.now() - swipeRef.current.t0;
    const mode = swipeRef.current.mode;

    swipeRef.current.active = false;
    swipeRef.current.tracking = false;
    swipeRef.current.mode = "none";

    if (dt > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_X) return;
    if (Math.abs(dy) > SWIPE_MAX_Y) return;
    if (Math.abs(dx) < Math.abs(dy)) return;

    // dx<0 = swipe vers gauche => next
    if (mode === "topTabs") {
      if (dx < 0) moveTopTab(+1);
      else moveTopTab(-1);
    } else if (mode === "skinCats") {
      if (dx < 0) moveSkinCat(+1);
      else moveSkinCat(-1);
    }
  }

  return (
    <div className="panel mShopPage" style={{ marginTop: 10 }}>
      <style>{`
        .mShopPage{ position:relative; overflow:hidden; }
        .mShopPage:before{
          content:""; position:absolute; inset:-2px; pointer-events:none; z-index:0;
          background:
            radial-gradient(900px 420px at 12% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(900px 420px at 88% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1000px 520px at 50% 100%, rgba(140,90,255,0.22), rgba(0,0,0,0) 66%);
        }
        .mShopPage > *{ position:relative; z-index:1; }

        .mHead{ display:flex; flex-direction:column; gap:10px; }
        .mTitle{
          margin:0; font-weight:1500; letter-spacing:-0.9px; font-size:28px; line-height:1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text; background-clip:text; color:transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .mChips{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .mChip{
          display:inline-flex; gap:8px; align-items:center;
          padding:8px 10px; border-radius:999px;
          border:1px solid rgba(255,255,255,0.12);
          background:rgba(0,0,0,0.18);
          backdrop-filter: blur(10px);
          font-weight:1100; font-size:12px; white-space:nowrap;
        }

        .mTabRow{
          margin-top:10px;
          display:flex; gap:8px; overflow:auto; padding-bottom:4px;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y; /* permet le scroll vertical, swipe géré par JS */
        }
        .mTabRow::-webkit-scrollbar{ display:none; }
        .mTabBtn{ flex:0 0 auto; }

        /* Texte tabs en blanc */
        .mShopPage .mTabRow .btnGhost,
        .mShopPage .mTabRow .btnPrimary{
          color: rgba(255,255,255,0.95) !important;
        }
        .mShopPage .mTabRow .btnGhost{
          border-color: rgba(255,255,255,0.14) !important;
          background: rgba(0,0,0,0.14) !important;
        }

        .mSection{
          margin-top:12px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.08);
          background:rgba(0,0,0,0.16);
          padding:12px;
        }

        .mCatRow{
          display:flex; gap:8px; overflow:auto; padding-bottom:4px;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
        }
        .mCatRow::-webkit-scrollbar{ display:none; }

        /* ✅ FIX NOIR => BLANC : force le texte des chips catégories en blanc */
        .mCatChip{
          flex:0 0 auto;
          display:inline-flex; align-items:center; gap:8px;
          padding:10px 12px; border-radius:999px;
          border:1px solid rgba(255,255,255,0.10);
          background:rgba(0,0,0,0.16);
          font-weight:1100; font-size:13px;
          color: rgba(255,255,255,0.92) !important;
        }
        .mCatChip *{ color: rgba(255,255,255,0.92) !important; }
        .mCatChip.isActive{
          border-color: rgba(255,255,255,0.22);
          background: linear-gradient(90deg, rgba(140,90,255,0.22), rgba(80,160,255,0.18), rgba(255,90,180,0.14));
          color: rgba(255,255,255,0.98) !important;
        }

        .mList{ margin-top:12px; display:grid; gap:10px; }
        .mCard{
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.14));
          box-shadow: 0 14px 40px rgba(0,0,0,0.22);
          padding:12px;
        }
        .mCard.locked{ opacity:0.62; }
        .mCardHead{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }

        .mShopTitleRow{ display:inline-flex; align-items:center; gap:10px; min-width:0; }
        .mShopTitleIcon{
          width:28px; height:28px; border-radius:12px; display:grid; place-items:center;
          border:1px solid rgba(255,255,255,0.12); background:rgba(0,0,0,0.18);
          box-shadow:0 10px 26px rgba(0,0,0,0.22);
          flex:0 0 auto;
        }
        .mShopTitleText{
          font-weight:1350; letter-spacing:-0.35px; font-size:15px;
          min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .mShopTitleKind{ font-weight:1000; opacity:0.72; }

        .mPill{
          display:inline-flex; align-items:center; gap:8px;
          padding:7px 10px; border-radius:999px;
          border:1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
          font-size:12px; font-weight:1200; white-space:nowrap;
          backdrop-filter: blur(10px);
        }
        .mPill--price{
          border-color: rgba(255,255,255,0.14);
          background: linear-gradient(90deg, rgba(140,90,255,0.22), rgba(80,160,255,0.18), rgba(255,90,180,0.14));
        }
        .mPill--owned{ background: rgba(255,255,255,0.06); }
        .mPill--eq{ border-color: rgba(124,77,255,0.28); background: rgba(124,77,255,0.16); }
        .mPill--muted{ opacity:0.65; }

        .mPreviewBox{
          margin-top:10px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.20);
          padding:10px;
        }
        .mActions{ margin-top:10px; display:flex; justify-content:flex-end; gap:8px; }

        /* Sheet */
        .mSheetOverlay{
          position:fixed; inset:0; z-index:9999;
          background: rgba(0,0,0,0.55);
          display:flex; align-items:flex-end; justify-content:center;
          padding: 14px;
        }
        .mSheet{
          width:100%;
          max-width: 520px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(10,10,14,0.92);
          backdrop-filter: blur(14px);
          box-shadow: 0 26px 90px rgba(0,0,0,0.55);
          overflow:hidden;
        }
        .mSheetGrab{
          width: 58px; height: 5px; border-radius: 999px;
          background: rgba(255,255,255,0.22);
          margin: 10px auto 0;
        }
        .mSheetHead{
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          padding: 10px 12px 8px;
        }
        .mSheetTitle{
          font-weight: 1200;
          min-width: 0;
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .mSheetBody{ padding: 10px 12px 14px; }

        .mSubCard{
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          padding: 12px;
        }
        details.mDetails{ border-radius: 14px; border:1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.14); padding: 10px; }
        details.mDetails summary{ cursor:pointer; font-weight: 1000; }
      `}</style>

      <div className="mHead">
        <div>
          <div className="mTitle">Shop</div>
          <div className="muted" style={{ marginTop: 4 }}>
            Skins de chat, talents, abonnements — preview en direct.
          </div>
        </div>

        <div className="mChips">
          <span className="mChip" title="Rubis disponibles">
            💎 <b>{Number(effectiveRubis).toLocaleString("fr-FR")}</b> rubis
          </span>
          <span className="mChip" title="Prestige disponible">
            🏆 <b>{Number(effectivePrestige).toLocaleString("fr-FR")}</b> prestige
          </span>
          <button className="btnGhostSmall" onClick={load} disabled={!token || loading || buying || subsBusy} title="Recharger">
            ↻
          </button>
        </div>
      </div>

      {!token ? <div className="muted" style={{ marginTop: 10 }}>Connecte-toi pour accéder au shop.</div> : null}
      {err ? (
        <div className="hint" style={{ opacity: 0.95, marginTop: 10 }}>
          ⚠️ {err}
        </div>
      ) : null}

      {/* ✅ SWIPE TOP_TABS uniquement sur la barre */}
      <div className="mTabRow" onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd}>
        {TOP_TABS.map((t) => {
          const active = topTab === t.id;
          return (
            <button
              key={t.id}
              className={`mTabBtn ${active ? "btnPrimary" : "btnGhost"}`}
              onClick={() => setTopTab(t.id)}
              disabled={loading || buying || subsBusy}
              style={{ color: "rgba(255,255,255,0.95)" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* UPGRADES */}
      {topTab === "upgrades" ? (
        <div className="mSection" style={{ touchAction: "pan-y" }}>
          <div style={{ fontWeight: 1200, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Améliorations</span>
            <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              (Talents)
            </span>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {[
              { code: "talent_calls_limit", name: "Calls & PCall", desc: "Augmente les calls disponibles et débloque le pay call.", icon: "📣" },
              { code: "talent_xp_boost", name: "Boost XP", desc: "Augmente l’XP gagnée sur la plateforme.", icon: "⚡" },
              { code: "talent_rain_boost", name: "Boost Rain", desc: "Augmente les gains issus des rain.", icon: "🌧️" },
              { code: "talent_prediction_bet_cap", name: "Mise prédiction max", desc: "Augmente la mise maximale possible sur les prédictions.", icon: "🎯" },
              { code: "talent_prediction_shield", name: "Shield prédiction", desc: "Protège certaines prédictions perdues.", icon: "🛡️" },
            ].map((t) => {
              const talent = talents.find((x) => x.code === t.code);

              const level = talent?.level ?? 0;
              const maxLevel = talent?.maxLevel ?? 3;
              const nextPrice = talent?.nextPrice ?? 500;

              const isMax = level >= maxLevel;
              const canAfford = effectiveRubis >= nextPrice;

              return (
                <div
                  key={t.code}
                  className="mSubCard"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <div style={{ fontSize: 20 }}>{t.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, fontSize: 14 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.2 }}>
                        {t.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                    <span style={{ fontSize: 12, opacity: 0.85 }}>{isMax ? "MAX" : `Niv. ${level + 1}`}</span>

                    {isMax ? (
                      <button className="btnGhostSmall" disabled>
                        MAX
                      </button>
                    ) : (
                      <button
                        className={canAfford ? "btnPrimarySmall" : "btnGhostSmall"}
                        disabled={!canAfford || buying || loading || subsBusy}
                        onClick={async () => {
                          if (!token) return;
                          const r: any = await buyTalent(token, t.code);
                          if (r?.ok && Number.isFinite(Number(r.availableRubis))) {
                            syncRubis(Number(r.availableRubis), "shop:buyTalent");
                          }
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
          </div>
        </div>
      ) : null}

      {/* SUBS */}
      {topTab === "subs" ? (
        <div className="mSection" style={{ touchAction: "pan-y" }}>
          <div style={{ fontWeight: 1200 }}>
            Abonnements <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>(mensuels)</span>
          </div>
          <div className="muted" style={{ marginTop: 6, lineHeight: 1.25 }}>
            Tu peux choisir un abonnement Viewer. L’abonnement Streamer n’apparaît que pour les comptes streamer.
            Les avantages seront branchés seulement après validation du paiement + activation.
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {visiblePlans.map((p) => (
              <div key={p.id} className="mSubCard">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <div style={{ fontSize: 22 }}>{p.icon}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1200, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.label}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{p.priceText}</div>
                    </div>
                  </div>

                  <span className="mPill" style={{ opacity: 0.9 }}>
                    {p.badge}
                  </span>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {p.slides.map((s, idx) => (
                    <details className="mDetails" key={idx}>
                      <summary>{s.title}</summary>
                      <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
                        {s.points.map((pt, i) => (
                          <li key={i} style={{ opacity: 0.95, lineHeight: 1.25 }}>
                            {pt}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>

                <div className="muted" style={{ fontSize: 12, marginTop: 10, opacity: 0.85 }}>
                  {disabledSubsReason}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btnPrimarySmall" disabled={!token || subsBusy} onClick={() => onSubscribe(p.id)}>
                    {p.ctaLabel}
                  </button>
                  <button className="btnGhostSmall" disabled={!token || subsBusy} onClick={onManage}>
                    Gérer
                  </button>
                </div>
              </div>
            ))}
          </div>

          {!visiblePlans.find((p) => p.id === "streamer") ? (
            <div className="muted" style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
              ℹ️ L’offre Streamer est cachée car ton compte n’a pas le rôle streamer.
            </div>
          ) : null}
        </div>
      ) : null}

      {/* RUBIS */}
      {topTab === "rubis" ? (
        <div className="mSection" style={{ touchAction: "pan-y" }}>
          <div className="muted">Bientôt : achat de rubis (packs / top-up).</div>
        </div>
      ) : null}

      {/* SKINS */}
      {topTab === "skins" ? (
        // ✅ data-swipe="skinCats" : swipe horizontal dans la zone basse = change catégorie de skin
        <div data-swipe="skinCats" onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} style={{ touchAction: "pan-y" }}>
          <div className="mSection">
            <div style={{ fontWeight: 1200, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>Catégories</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {loading ? "Chargement…" : `${visible.length} items`}
              </span>
            </div>

            <div className="mCatRow" style={{ marginTop: 10 }}>
              {SKIN_CATS.map((c) => {
                const count = items.filter((x) => x.kind === c.id).length;
                const active = cat === c.id;
                return (
                  <button
                    key={c.id}
                    className={`mCatChip ${active ? "isActive" : ""}`}
                    onClick={() => setCat(c.id)}
                    disabled={loading || buying || subsBusy}
                  >
                    <span aria-hidden style={{ opacity: 0.95 }}>{c.emoji}</span>
                    <span>{c.label}</span>
                    <span style={{ opacity: 0.7, fontWeight: 900, fontSize: 12 }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mList">
            {visible.map((it) => {
              const ownedNow = isOwnedItem(it);
              const isEquipped = (equipped as any)?.[it.kind] === it.code;

              const pr = Number(it.priceRubis ?? 0);
              const pp = Number((it as any).pricePrestige ?? 0);

              const isRubis = Number.isFinite(pr) && pr > 0;
              const isPrestige = Number.isFinite(pp) && pp > 0;

              const buyable = it.unlock === "shop" && (isRubis || isPrestige);
              const canAfford = isPrestige ? pp <= effectivePrestige : pr <= effectiveRubis;

              const lock = !ownedNow && it.unlock !== "shop";
              const disabledBuy = !token || buying || loading || subsBusy || ownedNow || !canAfford;

              return (
                <div
                  key={`${it.kind}:${it.code}`}
                  className={`mCard ${lock ? "locked" : ""}`}
                  onClick={() => !lock && setSelected({ kind: it.kind as Kind, code: it.code })}
                  style={{ cursor: lock ? "not-allowed" : "pointer" }}
                >
                  <div className="mCardHead">
                    <div style={{ minWidth: 0 }}>
                      {renderItemTitle(it)}
                      {it.unlock && it.unlock !== "shop" ? (
                        <div style={{ marginTop: 8 }}>
                          <span className="mPill" style={{ opacity: 0.85 }}>
                            {String(it.unlock)}
                            {(it as any).rarity ? ` • ${(it as any).rarity}` : ""}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                      <PricePill
                        rubis={isRubis ? pr : null}
                        prestige={isPrestige ? pp : null}
                        owned={ownedNow}
                        equipped={isEquipped}
                      />
                    </div>
                  </div>

                  <div
                    className="mPreviewBox"
                    style={{
                      pointerEvents: "none",
                      ...({
                        ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
                        ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
                      } as any),
                    }}
                  >
                    <ChatMessageBubble
                      streamerAppearance={streamerAppearance}
                      msg={{
                        id: `shop-mobile-card:${it.kind}:${it.code}`,
                        userId: previewUserId,
                        username,
                        body: "…",
                        createdAt: new Date().toISOString(),
                        cosmetics: previewForItem(it),
                      }}
                    />
                  </div>

                  <div className="mActions">
                    {buyable ? (
                      <button
                        className={disabledBuy ? "btnGhostSmall" : "btnPrimarySmall"}
                        disabled={disabledBuy}
                        onClick={(e) => {
                          e.stopPropagation();
                          buy(it);
                        }}
                        title={ownedNow ? "Déjà possédé" : !canAfford ? "Pas assez" : "Acheter"}
                      >
                        {ownedNow ? "Possédé" : !canAfford ? "Pas assez" : "Acheter"}
                      </button>
                    ) : (
                      <button className="btnGhostSmall" disabled title="Indisponible">
                        Indisponible
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Sheet open={sheetOpen} title={selectedItem ? renderItemTitle(selectedItem) : "Aperçu"} onClose={() => setSelected(null)}>
            <div
              className="mPreviewBox"
              style={{
                ...({
                  ["--chat-name-color" as any]: streamerAppearance.chat.usernameColor,
                  ["--chat-msg-color" as any]: streamerAppearance.chat.messageColor,
                } as any),
              }}
            >
              <ChatMessageBubble
                streamerAppearance={streamerAppearance}
                msg={{
                  id: "shop-mobile-preview",
                  userId: previewUserId,
                  username: user?.username ?? "Invité",
                  body: "Exemple de message — “ça rend comment ?”",
                  createdAt: new Date().toISOString(),
                  cosmetics: withAvatar(selectedPreviewCosmetics, user?.id),
                }}
              />
            </div>

            {selectedItem ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  {selectedItem.unlock !== "shop" ? `🔒 ${selectedItem.unlock}` : "Shop"}
                  {(selectedItem as any).rarity ? ` • ${(selectedItem as any).rarity}` : ""}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btnPrimarySmall"
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
              </div>
            ) : null}
          </Sheet>
        </div>
      ) : null}
    </div>
  );
}
