// web/src/pages/ShopPage.tsx
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
import { useIsMobile } from "../hooks/useIsMobile";
import ShopPageMobile from "./ShopPage.mobile";

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
  { id: "frame", label: "Cadrans message", emoji: "💬" },
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
    .replace(/^m?frame_/, "") // ✅ supporte frame_ et mframe_
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
    const frameId = frameIdFromCode(code); // ✅ FIX
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
      <span className="shopTitleRow">
        <span className="shopTitleKind">Badge</span>
        <span className={`chatBadge badge--${tier}`}>{badgeTextFromCode(it.code)}</span>
      </span>
    );
  }

  return (
    <span className="shopTitleRow">
      <span className="shopTitleIcon" aria-hidden>
        {kindEmoji(it.kind as Kind)}
      </span>
      <span className="shopTitleText">{it.name}</span>
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

/* ------------------------------ SUBS UI ------------------------------ */

type SubSlide = { title: string; points: string[] };
type SubPlan = {
  id: "viewer" | "streamer";
  label: string;
  badge: string; // petit pill
  icon: string;
  priceText: string; // affichage libre tant que pas décidé
  visibleIf: (u: { role?: string } | null) => boolean;
  slides: SubSlide[];
  ctaLabel: string;
};

function isStreamerRole(role?: string) {
  const r = String(role || "").toLowerCase();
  return r === "streamer" || r === "admin_streamer" || r.includes("streamer");
}

function Dots({
  count,
  active,
  onPick,
}: {
  count: number;
  active: number;
  onPick: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onPick(i)}
          className="btnGhostSmall"
          style={{
            width: 10,
            height: 10,
            padding: 0,
            borderRadius: 999,
            opacity: i === active ? 1 : 0.55,
            border:
              i === active
                ? "1px solid rgba(255,255,255,0.30)"
                : "1px solid rgba(255,255,255,0.10)",
            background: i === active ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)",
          }}
          aria-label={`Page ${i + 1}`}
          title={`Page ${i + 1}`}
        />
      ))}
    </div>
  );
}

function SubPlanCard({
  plan,
  disabledReason,
  onSubscribe,
  onManage,
  disabledSubscribe,
  disabledManage,
}: {
  plan: SubPlan;
  disabledReason: string;
  onSubscribe: (planId: "viewer" | "streamer") => void;
  onManage: () => void;
  disabledSubscribe?: boolean;
  disabledManage?: boolean;
}) {
  const [page, setPage] = React.useState(0);
  const slide = plan.slides[Math.max(0, Math.min(page, plan.slides.length - 1))];

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(0,0,0,0.20)",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        minHeight: 260,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 22 }}>{plan.icon}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 950, fontSize: 15 }}>{plan.label}</div>
            <span
              className="cosPill"
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              {plan.badge}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {plan.priceText}
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="btnGhostSmall"
            disabled={plan.slides.length <= 1}
            onClick={() => setPage((p) => (p - 1 + plan.slides.length) % plan.slides.length)}
            title="Précédent"
          >
            ◀
          </button>
          <button
            className="btnGhostSmall"
            disabled={plan.slides.length <= 1}
            onClick={() => setPage((p) => (p + 1) % plan.slides.length)}
            title="Suivant"
          >
            ▶
          </button>
        </div>
      </div>

      <div
        style={{
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.16)",
          padding: 12,
          flex: 1,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 8 }}>{slide.title}</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          {slide.points.map((p, idx) => (
            <li key={idx} style={{ opacity: 0.95, lineHeight: 1.25 }}>
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Dots count={plan.slides.length} active={page} onPick={setPage} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btnPrimarySmall" disabled={disabledSubscribe} onClick={() => onSubscribe(plan.id)}>
            {plan.ctaLabel}
          </button>

          <button className="btnGhostSmall" disabled={disabledManage} onClick={onManage}>
            Gérer
          </button>
        </div>
      </div>

      <div className="muted" style={{ fontSize: 12, opacity: 0.85 }}>
        {disabledReason}
      </div>
    </div>
  );
}

/* ------------------------------ PAGE ------------------------------ */

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
  if (equipped) {
    return (
      <span className="spPill spPill--eq" title="Équipé">
        ✅ Équipé
      </span>
    );
  }
  if (owned) {
    return (
      <span className="spPill spPill--owned" title="Possédé">
        🧾 Possédé
      </span>
    );
  }
  if (prestige != null && Number.isFinite(prestige) && prestige > 0) {
    return (
      <span className="spPill spPill--price" title="Prix prestige">
        🏆 {Number(prestige).toLocaleString("fr-FR")}
      </span>
    );
  }
  if (rubis != null && Number.isFinite(rubis) && rubis > 0) {
    return (
      <span className="spPill spPill--price" title="Prix rubis">
        💎 {Number(rubis).toLocaleString("fr-FR")}
      </span>
    );
  }
  return (
    <span className="spPill spPill--muted" title="Non achetable">
      —
    </span>
  );
}

export function ShopPage({
  streamerAppearance = DEFAULT_STREAMER_APPEARANCE,
}: {
  streamerAppearance?: StreamerAppearance;
}) {
  const authAny = useAuth() as any;
  const token: string | null = authAny.token ?? null;

  const user = authAny.user as { id: number; username: string; rubis: number; role?: string } | null;
  const isMobile = useIsMobile();
  if (isMobile) {
    return <ShopPageMobile streamerAppearance={streamerAppearance} />;
  }

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

  const patchUser = authAny.patchUser as ((p: any) => void) | undefined;

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
        if (Number.isFinite(Number(j.availableRubis))) {
          syncRubis(Number(j.availableRubis), "shop:talents");
        }
      }
    } finally {
      setLoadingTalents(false);
    }
  }

  React.useEffect(() => {
    try {
      const want = String(localStorage.getItem("shop:openTab") || "");
      if (want && ["skins", "upgrades", "subs", "rubis"].includes(want)) {
        setTopTab(want as any);
      }
      localStorage.removeItem("shop:openTab");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (topTab === "upgrades") {
      loadTalents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab]);

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
    if (user?.rubis != null) syncRubis(Number(user.rubis), "auth:user");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rubis]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const effectiveRubis = Number.isFinite(availableRubis) ? availableRubis : user?.rubis ?? 0;
  const effectivePrestige = Number.isFinite(availablePrestige) ? availablePrestige : 0;

  const visible = React.useMemo(() => {
    return items.filter((x) => x.kind === cat).slice().sort(sortByPriceAsc);
  }, [items, cat]);

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

      if (j.owned) {
        setOwned(normalizeOwnedRecord(j.owned));
      } else {
        addOwnedLocal(it.kind, it.code);
      }

      if (typeof authAny.refreshMe === "function") authAny.refreshMe();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setBuying(false);
    }
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
        {
          title: "Évolutif",
          points: ["⭐ Le statut prio sert de “flag” pour ajouter des perks futures"],
        },
      ],
    },
  ];

  const visiblePlans = SUB_PLANS.filter((p) => p.visibleIf(user));

  return (
    <div className="panel shopPage" style={{ marginTop: 14 }}>
      <style>{`
        .shopPage{
          position: relative;
          overflow: hidden;
        }
        .shopPage:before{
          content:"";
          position:absolute;
          inset:-2px;
          pointer-events:none;
          background:
            radial-gradient(1100px 520px at 12% 0%, rgba(255,90,180,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1100px 520px at 88% 10%, rgba(80,160,255,0.22), rgba(0,0,0,0) 62%),
            radial-gradient(1200px 620px at 50% 100%, rgba(140,90,255,0.22), rgba(0,0,0,0) 66%);
          z-index:0;
        }
        .shopPage > * { position: relative; z-index: 1; }

        .shopHeaderRow{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .shopTitle{
          margin:0;
          font-weight: 1500;
          letter-spacing: -0.9px;
          font-size: 34px;
          line-height: 1.05;
          background: linear-gradient(90deg, rgba(255,90,180,1), rgba(180,140,255,1), rgba(80,160,255,1));
          -webkit-background-clip:text;
          background-clip:text;
          color: transparent;
          filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35));
        }
        .shopChips{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
          justify-content:flex-end;
        }
        .shopChip{
          display:inline-flex;
          gap:8px;
          align-items:center;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
          backdrop-filter: blur(10px);
          font-weight: 1100;
          font-size: 13px;
          white-space: nowrap;
        }
        .shopTabs{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
          margin-top: 10px;
        }
        .shopLayout{
          margin-top: 14px;
          display:grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
          align-items:start;
        }
        @media (max-width: 980px){
          .shopLayout{ grid-template-columns: 1fr; }
        }

        .shopSideCard{
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 16px 44px rgba(0,0,0,0.24);
          backdrop-filter: blur(10px);
          padding: 12px;
        }

        .shopCatBtn{
          width: 100%;
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.16);
          color: white;
          cursor:pointer;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .shopCatBtn:hover{
          transform: translateY(-1px);
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 18px 44px rgba(0,0,0,0.22);
        }
        .shopCatBtn.isActive{
          border-color: rgba(255,255,255,0.24);
          background: linear-gradient(90deg, rgba(140,90,255,0.22), rgba(80,160,255,0.18), rgba(255,90,180,0.14));
        }
        .shopCatLeft{
          display:flex;
          align-items:center;
          gap: 10px;
          min-width:0;
        }
        .shopCatLabel{
          font-weight: 1100;
          white-space: nowrap;
          overflow:hidden;
          text-overflow: ellipsis;
        }
        .shopCatCount{
          opacity: 0.7;
          font-weight: 1000;
          font-size: 12px;
        }

        .shopGrid2{
          margin-top: 12px;
          display:grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr)); /* ✅ 2 par ligne */
          align-items:start;
        }
        @media (max-width: 980px){
          .shopGrid2{ grid-template-columns: 1fr; }
        }

        .shopItemCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12));
          box-shadow: 0 16px 44px rgba(0,0,0,0.22);
          backdrop-filter: blur(10px);
          padding: 12px;
          cursor: pointer;
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .shopItemCard:hover{
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.18);
          box-shadow: 0 24px 70px rgba(0,0,0,0.30);
        }
        .shopItemCard.isSelected{
          border-color: rgba(255,255,255,0.26);
          box-shadow: 0 26px 80px rgba(0,0,0,0.34);
        }

        .shopItemHead{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .shopTitleRow{
          display:inline-flex;
          align-items:center;
          gap: 10px;
          min-width:0;
        }
        .shopTitleIcon{
          width: 28px;
          height: 28px;
          border-radius: 12px;
          display:grid;
          place-items:center;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
          box-shadow: 0 10px 26px rgba(0,0,0,0.22);
          flex: 0 0 auto;
        }
        .shopTitleText{
          font-weight: 1350;
          letter-spacing: -0.35px;
          font-size: 15px;
          min-width:0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .shopTitleKind{
          font-weight: 1000;
          opacity: 0.72;
        }

        .spPill{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.18);
          font-size: 12px;
          font-weight: 1200;
          white-space: nowrap;
          backdrop-filter: blur(10px);
        }
        .spPill--price{
          border-color: rgba(255,255,255,0.14);
          background: linear-gradient(90deg, rgba(140,90,255,0.22), rgba(80,160,255,0.18), rgba(255,90,180,0.14));
        }
        .spPill--owned{
          background: rgba(255,255,255,0.06);
        }
        .spPill--eq{
          border-color: rgba(124,77,255,0.28);
          background: rgba(124,77,255,0.16);
        }
        .spPill--muted{
          opacity: 0.65;
        }

        .shopMetaRow{
          margin-top: 8px;
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items:center;
        }
        .shopMiniPill{
          font-size: 11px;
          font-weight: 1100;
          padding: "4px 8px";
        }

        .shopTryHint{
          font-size: 11px;
          opacity: 0.75;
          font-weight: 900;
        }

        .shopPreviewBox{
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.20);
          padding: 10px;
        }

        .shopActionsRow{
          margin-top: 10px;
          display:flex;
          gap: 8px;
          justify-content: flex-end;
          align-items:center;
        }
      `}</style>

      <div className="shopHeaderRow">
        <div style={{ display: "grid", gap: 6, minWidth: 280 }}>
          <div className="shopTitle">Shop</div>
          <div className="muted">
            Skins de chat, talents, abonnements — preview en direct.
          </div>
        </div>

        <div className="shopChips">
          <span className="shopChip" title="Rubis disponibles">
            💎 <b>{Number(effectiveRubis).toLocaleString("fr-FR")}</b> rubis
          </span>
          <span className="shopChip" title="Prestige disponible">
            🏆 <b>{Number(effectivePrestige).toLocaleString("fr-FR")}</b> prestige
          </span>
        </div>
      </div>

      {!token ? <div className="muted">Connecte-toi pour accéder au shop.</div> : null}

      {err ? (
        <div className="hint" style={{ opacity: 0.95 }}>
          ⚠️ {err}
        </div>
      ) : null}

      <div className="shopTabs">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            className={topTab === t.id ? "btnPrimary" : "btnGhost"}
            onClick={() => setTopTab(t.id)}
            disabled={loading || buying || subsBusy}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* UPGRADES */}
      {topTab === "upgrades" ? (
        <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 8 }}>
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
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(0,0,0,0.22)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                    <div style={{ fontSize: 20 }}>{t.icon}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>{t.name}</div>
                      <div className="muted" style={{ fontSize: 12, lineHeight: 1.2 }}>
                        {t.desc}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
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
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 900 }}>
            <div
              style={{
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(0,0,0,0.18)",
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 950, display: "flex", alignItems: "center", gap: 10 }}>
                <span>Abonnements</span>
                <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                  (mensuels)
                </span>
              </div>
              <div className="muted" style={{ marginTop: 6, lineHeight: 1.25 }}>
                Tu peux choisir un abonnement Viewer. L’abonnement Streamer n’apparaît que pour les comptes streamer.
                Les avantages seront branchés seulement après validation du paiement + activation.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 12,
              }}
            >
              {visiblePlans.map((p) => (
                <SubPlanCard
                  key={p.id}
                  plan={p}
                  disabledReason={disabledSubsReason}
                  onSubscribe={onSubscribe}
                  onManage={onManage}
                  disabledSubscribe={!token || subsBusy}
                  disabledManage={!token || subsBusy}
                />
              ))}
            </div>

            {!visiblePlans.find((p) => p.id === "streamer") ? (
              <div className="muted" style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
                ℹ️ L’offre Streamer est cachée car ton compte n’a pas le rôle streamer.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* RUBIS */}
      {topTab === "rubis" ? (
        <div style={{ marginTop: 14 }}>
          <div className="muted">Bientôt : achat de rubis (packs / top-up).</div>
        </div>
      ) : null}

      {/* SKINS */}
      {topTab === "skins" ? (
        <div className="shopLayout">
          {/* LEFT */}
          <div style={{ display: "grid", gap: 12 }}>
            <div className="shopSideCard">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 1200 }}>Catégories</div>
                <button className="btnGhostSmall" onClick={load} disabled={!token || loading || buying || subsBusy} title="Recharger">
                  ↻
                </button>
              </div>

              <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.85 }}>
                Choisis une catégorie, clique un item pour prévisualiser.
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {SKIN_CATS.map((c) => {
                  const count = items.filter((x) => x.kind === c.id).length;
                  return (
                    <button
                      key={c.id}
                      className={`shopCatBtn ${cat === c.id ? "isActive" : ""}`}
                      onClick={() => setCat(c.id)}
                      disabled={loading || buying || subsBusy}
                    >
                      <span className="shopCatLeft">
                        <span aria-hidden style={{ opacity: 0.9 }}>{c.emoji}</span>
                        <span className="shopCatLabel">{c.label}</span>
                      </span>
                      <span className="shopCatCount">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="shopSideCard">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 1200 }}>Aperçu</div>
                <div className="mutedSmall" style={{ opacity: 0.75 }}>
                  {selected ? "sélectionné" : ""}
                </div>
              </div>

              <div className="mutedSmall" style={{ marginTop: 8, opacity: 0.8 }}>
                {SKIN_CATS.find((x) => x.id === cat)?.emoji} {SKIN_CATS.find((x) => x.id === cat)?.label} — rendu sur un message.
              </div>

              <div
                className="shopPreviewBox"
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
                    id: "shop-preview",
                    userId: previewUserId,
                    username: user?.username ?? "Invité",
                    body: "Exemple de message — “ça rend comment ?”",
                    createdAt: new Date().toISOString(),
                    cosmetics: withAvatar(selectedPreviewCosmetics, user?.id),
                  }}
                />
              </div>

              <div className="mutedSmall" style={{ marginTop: 10, opacity: 0.75 }}>
                Astuce: clique un item pour le “try-on”, puis achète si ça te plaît.
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="shopSideCard" style={{ minHeight: 300 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1250 }}>
                {SKIN_CATS.find((x) => x.id === cat)?.emoji}{" "}
                {String(SKIN_CATS.find((x) => x.id === cat)?.label || "")?.toUpperCase()}
              </div>
              <div className="mutedSmall" style={{ opacity: 0.75 }}>
                {loading ? "Chargement…" : `${visible.length} items`}
              </div>
            </div>

            <div className="shopGrid2">
              {visible.map((it) => {
                const ownedNow = isOwnedItem(it);
                const isEquipped = (equipped as any)?.[it.kind] === it.code;

                const pr = Number(it.priceRubis ?? 0);
                const pp = Number((it as any).pricePrestige ?? 0);

                const isRubis = Number.isFinite(pr) && pr > 0;
                const isPrestige = Number.isFinite(pp) && pp > 0;

                const buyable = it.unlock === "shop" && (isRubis || isPrestige);
                const canAfford = isPrestige ? pp <= effectivePrestige : pr <= effectiveRubis;

                const selectedNow = selected?.kind === it.kind && selected?.code === it.code;

                const lock = !ownedNow && it.unlock !== "shop"; // non achetable et pas possédé
                const disabledBuy = !token || buying || loading || subsBusy || ownedNow || !canAfford;

                return (
                  <div
                    key={`${it.kind}:${it.code}`}
                    className={`shopItemCard ${selectedNow ? "isSelected" : ""}`}
                    onClick={() => setSelected({ kind: it.kind as Kind, code: it.code })}
                    title="Cliquer pour prévisualiser"
                    style={{
                      opacity: lock ? 0.62 : 1,
                      cursor: lock ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="shopItemHead">
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ minWidth: 0 }}>{renderItemTitle(it)}</div>
                        </div>

                        <div className="shopMetaRow">
                          {/* statut */}


                          {/* unlock / rarity seulement si utile */}
                          {it.unlock && it.unlock !== "shop" ? (
                            <span className="spPill" style={{ opacity: 0.85 }}>
                              {String(it.unlock)}
                              {(it as any).rarity ? ` • ${(it as any).rarity}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                        <PricePill
                          rubis={isRubis ? pr : null}
                          prestige={isPrestige ? pp : null}
                          owned={ownedNow}
                          equipped={isEquipped}
                        />
                      </div>
                    </div>

                    <div
                      className="shopPreviewBox"
                      style={{
                        marginTop: 10,
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
                          id: `shop-card:${it.kind}:${it.code}`,
                          userId: previewUserId,
                          username,
                          body: "…",
                          createdAt: new Date().toISOString(),
                          cosmetics: previewForItem(it),
                        }}
                      />
                    </div>

                    <div className="shopActionsRow">
                      {buyable ? (
                        <button
                          className={disabledBuy ? "btnGhostSmall" : "btnPrimarySmall"}
                          disabled={disabledBuy}
                          onClick={(e) => {
                            e.stopPropagation();
                            buy(it);
                          }}
                          title={
                            ownedNow
                              ? "Déjà possédé"
                              : !canAfford
                              ? "Pas assez"
                              : "Acheter"
                          }
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
