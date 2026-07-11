// web/src/components/DailyBonusAgendaModal.mobile.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import {
  claimDailyBonusToday,
  claimDailyBonusMilestone,
  publicGetContent,
  publicListContentTabs,
  type ApiPublicContentTab,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { UnreadBadge } from "./UnreadBadge";
import { contentVersionFromItem, isUnread, setSeenVersion } from "../lib/unread_seen";

type WeekDay = {
  isodow: number;
  label: string;
  date: string;
  reward:
    | { type: "rubis"; amount: number; origin: string; weight_bp: number }
    | { type: "token"; token: "wheel_ticket"; amount: number };
  status: "future" | "missed" | "claimed" | "today_claimable" | "today_claimed";
};

type Milestone = { milestone: 5 | 10 | 20 | 30; status: "locked" | "claimable" | "claimed" };

export type DailyBonusState = {
  ok: true;
  day: string;
  weekStart: string;
  monthStart: string;
  monthClaimedDays: number;
  todayClaimed: boolean;
  week: WeekDay[];
  milestones: Milestone[];
  tokens?: { wheel_ticket?: number; prestige_token?: number };

  premiumActive?: boolean;
  premium?: { active?: boolean; multiplier?: number; label?: string; plan?: string };
};

type Role = "viewer" | "moderator" | "streamer" | "admin";
type TabKey = "agenda" | "content" | "event";
type ContentKey = string;

function roleRank(r: any): number {
  const v = String(r || "viewer").toLowerCase();
  if (v === "admin") return 3;
  if (v === "streamer") return 2;
  if (v === "moderator" || v === "mod") return 1;
  return 0; // viewer
}
function canSee(minRole: Role, userRole: any) {
  return roleRank(userRole) >= roleRank(minRole);
}

function rewardLabel(r: WeekDay["reward"]) {
  if (r.type === "rubis") return `💎 ${r.amount}`;
  return `🎡 x${r.amount}`;
}

function toastTextFromGranted(granted: any[] | null | undefined) {
  const arr = Array.isArray(granted) ? granted : [];
  if (!arr.length) return "Récompense récupérée ✅";

  let rubis = 0;
  let wheel = 0;
  let prestige = 0;
  let uniqSkin = 0;
  let uniqTitle = 0;

  for (const g of arr) {
    if (!g) continue;

    if (g.type === "rubis" && Number.isFinite(Number(g.amount))) {
      rubis += Number(g.amount);
      continue;
    }

    if (g.type === "token" && Number.isFinite(Number(g.amount))) {
      const t = String(g.token || "");
      if (t === "wheel_ticket") wheel += Number(g.amount);
      else if (t === "prestige_token") prestige += Number(g.amount);
      continue;
    }

    const kind = String(g.kind || g.unique || "");
    if (kind === "skin") uniqSkin += 1;
    if (kind === "title") uniqTitle += 1;
  }

  const parts: string[] = [];
  if (rubis > 0) parts.push(`+${rubis} rubis`);
  if (wheel > 0) parts.push(`+${wheel} ticket(s) roue`);
  if (prestige > 0) parts.push(`+${prestige} jeton(s) prestige`);
  if (uniqSkin > 0) parts.push(`Skin débloqué`);
  if (uniqTitle > 0) parts.push(`Titre débloqué`);

  return parts.length ? `${parts.join(" • ")} ✅` : "Récompense récupérée ✅";
}

function statusChip(status: WeekDay["status"]) {
  if (status === "today_claimable") return { label: "À récupérer", kind: "cta" as const };
  if (status === "today_claimed") return { label: "Déjà récupéré", kind: "ok" as const };
  if (status === "claimed") return { label: "Récupéré", kind: "ok" as const };
  if (status === "missed") return { label: "Manqué", kind: "bad" as const };
  return { label: "À venir", kind: "muted" as const };
}

function dayBadge(status: WeekDay["status"]) {
  if (status === "claimed" || status === "today_claimed") return "✓";
  if (status === "missed") return "×";
  return "";
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function sanitizeHtmlLite(input: string) {
  const html = String(input || "");
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, iframe, object, embed").forEach((n) => n.remove());

    doc.querySelectorAll("*").forEach((el) => {
      [...el.attributes].forEach((a) => {
        const name = a.name.toLowerCase();
        const val = String(a.value || "");
        if (name.startsWith("on")) el.removeAttribute(a.name);
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(val)) el.removeAttribute(a.name);
      });
    });

    return doc.body.innerHTML || "";
  } catch {
    return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  }
}

// version "stable" pour le unread: accepte updated_at du listing
function versionFromAnyItem(item: any) {
  return contentVersionFromItem({
    ...item,
    updatedAt: (item as any)?.updatedAt ?? (item as any)?.updated_at,
  } as any);
}

function humanizeKey(key: string) {
  const s = String(key || "")
    .replace(/^bonus_/, "")
    .replace(/^daily_bonus_/, "")
    .replace(/^guide_/, "")
    .trim();
  const t = s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return t || "Contenu";
}

export function DailyBonusAgendaModalMobile({
  state,
  onClose,
  onState,
}: {
  state: DailyBonusState;
  onClose: () => void;
  onState: (s: DailyBonusState) => void;
}) {
  const auth = useAuth() as any;
  const token = auth?.token ?? null;
  const refreshMe = auth?.refreshMe ?? (async () => {});
  const userRole: Role = String(auth?.user?.role || "viewer").toLowerCase() as any;

  const tokensAny = (state as any)?.tokens ?? {};
  const wheelTickets = Number(tokensAny?.wheel_ticket ?? 0);
  const prestigeTokens = Number(tokensAny?.prestige_token ?? 0);

  const week: WeekDay[] = Array.isArray((state as any)?.week) ? (state as any).week : [];
  const milestones: Milestone[] = Array.isArray((state as any)?.milestones) ? (state as any).milestones : [];

  const premiumActive = Boolean(
    (state as any)?.premiumActive ?? (state as any)?.premium?.active ?? (state as any)?.premium?.isActive ?? false
  );
  const premiumLabel = String((state as any)?.premium?.label ?? "").trim() || "Abonnement actif";

  // ✅ charge la liste des tabs depuis l'API (admin content)
  const [contentList, setContentList] = React.useState<ApiPublicContentTab[]>([]);
  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r: any = await publicListContentTabs();
        const items = Array.isArray(r?.items) ? (r.items as ApiPublicContentTab[]) : [];
        if (!dead) setContentList(items);
      } catch {
        if (!dead) setContentList([]);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // ✅ Tabs visibles selon rôle (un rôle “au-dessus” voit tout en dessous)
  const contentTabs = React.useMemo(() => {
    const tabs = (contentList || [])
      .map((it: any) => {
        const key = String(it?.key || "").trim();
        const minRole = String(it?.min_role || "viewer").toLowerCase() as Role;
        const title = String(it?.title || "").trim();
        return {
          key,
          minRole,
          title,
          updated_at: it?.updated_at ?? null,
          fallbackLabel: title || humanizeKey(key),
        };
      })
      .filter((t) => t.key && canSee(t.minRole, userRole));

    return tabs;
  }, [contentList, userRole]);

  // UI state
  const [tab, setTab] = React.useState<TabKey>("agenda");
  const [activeContentKey, setActiveContentKey] = React.useState<ContentKey>("daily_bonus_infos");
  const [busy, setBusy] = React.useState<string | null>(null);

  // ✅ unread + versions (align desktop)
  const [contentVersions, setContentVersions] = React.useState<Record<string, string>>({});
  const [contentUnread, setContentUnread] = React.useState<Record<string, boolean>>({});
  const [contentTitles, setContentTitles] = React.useState<Record<string, string>>({});

  // ✅ Précharge titres + unread depuis la liste (sans fetch n fois)
  React.useEffect(() => {
    let dead = false;

    try {
      for (const t of contentTabs) {
        const key = t.key;

        const v = versionFromAnyItem(t);
        if (v && !dead) {
          setContentVersions((m) => ({ ...m, [key]: v }));
          setContentUnread((m) => ({ ...m, [key]: isUnread(`content:${key}`, v) }));
        }

        const title = String((t as any)?.title || "").trim();
        if (title && !dead) {
          setContentTitles((m) => ({ ...m, [key]: title }));
        }
      }
    } catch {
      // ignore
    }

    return () => {
      dead = true;
    };
  }, [contentTabs]);

  // ✅ garde-fou: si role change / liste change, on garde un onglet safe
  React.useEffect(() => {
    if (tab !== "content") return;
    if (contentTabs.some((t) => t.key === activeContentKey)) return;

    const first = contentTabs[0]?.key;
    if (first) setActiveContentKey(first);
  }, [tab, contentTabs, activeContentKey]);

  // toast
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);

  const showToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  async function claimToday() {
    if (!token) return;
    setBusy("today");
    try {
      const r: any = await claimDailyBonusToday(token);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      showToast(toastTextFromGranted(r?.granted));
    } catch (e: any) {
      showToast(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  async function claimMilestone(m: 5 | 10 | 20 | 30) {
    if (!token) return;
    setBusy(`m${m}`);
    try {
      const r: any = await claimDailyBonusMilestone(token, m);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      showToast(r?.granted?.length ? toastTextFromGranted(r.granted) : `Palier ${m} jours récupéré ✅`);
    } catch (e: any) {
      showToast(String(e?.message || "Erreur"));
    } finally {
      setBusy(null);
    }
  }

  // ESC
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ✅ Contenu HTML (align desktop)
  const [contentHtml, setContentHtml] = React.useState<string | null>(null);
  const [contentLoading, setContentLoading] = React.useState(false);

  React.useEffect(() => {
    let dead = false;

    async function load() {
      if (tab !== "content") return;

      const key = activeContentKey;
      setContentLoading(true);
      try {
        const r: any = await publicGetContent(key);
        const html = r?.item?.html ? sanitizeHtmlLite(String(r.item.html)) : null;
        const item = r?.item ?? null;

        // version d'après item (source of truth)
        const v = item ? contentVersionFromItem(item) : "";
        if (v && !dead) {
          setContentVersions((m) => ({ ...m, [key]: v }));
          setContentUnread((m) => ({ ...m, [key]: isUnread(`content:${key}`, v) }));
        }

        // title DB => label d’onglet
        const title = String(r?.item?.title || "").trim();
        if (title && !dead) setContentTitles((m) => ({ ...m, [key]: title }));

        if (!dead) setContentHtml(html);
      } catch {
        if (!dead) setContentHtml(null);
      } finally {
        if (!dead) setContentLoading(false);
      }
    }

    load();
    return () => {
      dead = true;
    };
  }, [tab, activeContentKey]);

  // ✅ mark as seen quand on ouvre un onglet content (utilise version "item" si chargée)
  React.useEffect(() => {
    if (tab !== "content") return;
    const key = activeContentKey;
    const v = contentVersions[key];
    if (!v) return;

    setSeenVersion(`content:${key}`, v);
    setContentUnread((m) => ({ ...m, [key]: false }));
    window.dispatchEvent(new CustomEvent("ll:content-seen", { detail: { key } }));
  }, [tab, activeContentKey, contentVersions]);

  const activeContentLabel = React.useMemo(() => {
    const found = contentTabs.find((t) => t.key === activeContentKey);
    const fallback = found?.fallbackLabel || humanizeKey(activeContentKey);
    return contentTitles[activeContentKey] || fallback;
  }, [activeContentKey, contentTabs, contentTitles]);

  const anyContentUnread = React.useMemo(() => Object.values(contentUnread || {}).some(Boolean), [contentUnread]);

  // Swipe tabs (agenda/content/event)
  const TABS: Array<{ key: TabKey; label: string }> = React.useMemo(
    () => [
      { key: "agenda", label: "Bonus" },
      { key: "content", label: "Infos" },
      { key: "event", label: "Events" },
    ],
    []
  );

  const activeIndex = React.useMemo(() => TABS.findIndex((t) => t.key === tab), [tab, TABS]);

  const touch = React.useRef<{
    x0: number;
    y0: number;
    t0: number;
    dragging: boolean;
    dx: number;
  } | null>(null);

  const [dragDx, setDragDx] = React.useState(0);

  const setTabByIndex = React.useCallback(
    (idx: number) => {
      const i = clamp(idx, 0, TABS.length - 1);
      setTab(TABS[i].key);
    },
    [TABS]
  );

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    touch.current = { x0: t.clientX, y0: t.clientY, t0: Date.now(), dragging: true, dx: 0 };
    setDragDx(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const st = touch.current;
    const t = e.touches?.[0];
    if (!st || !t) return;

    const dx = t.clientX - st.x0;
    const dy = t.clientY - st.y0;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      st.dragging = false;
      setDragDx(0);
      return;
    }
    if (!st.dragging) return;

    st.dx = dx;
    setDragDx(dx);
  };

  const onTouchEnd = () => {
    const st = touch.current;
    touch.current = null;

    const dx = st?.dx ?? 0;
    const dt = st ? Date.now() - st.t0 : 9999;

    setDragDx(0);

    const distOk = Math.abs(dx) >= 60;
    const flickOk = Math.abs(dx) >= 35 && dt <= 220;

    if (distOk || flickOk) {
      if (dx < 0) setTabByIndex(activeIndex + 1);
      else setTabByIndex(activeIndex - 1);
    }
  };

  // UI helpers
  const today = week.find((d) => d.status === "today_claimable" || d.status === "today_claimed") ?? null;
  const canClaimToday = today?.status === "today_claimable" && !busy;

  const slidePct = React.useMemo(() => -activeIndex * 100, [activeIndex]);
  const dragPx = clamp(dragDx, -120, 120);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="llDBmOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        .llDBmOverlay{
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          background: rgba(0,0,0,0.78);
          backdrop-filter: blur(8px);
          display:flex;
          align-items: flex-end;
          justify-content: center;
          padding: 0;
        }

        .llDBmToast{
          position: fixed;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483647;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(15,15,24,0.92);
          border: 1px solid rgba(255,255,255,0.14);
          box-shadow: 0 18px 60px rgba(0,0,0,0.55);
          font-weight: 950;
          font-size: 13px;
          color: rgba(255,255,255,0.92);
          max-width: min(92vw, 640px);
          text-align:center;
        }

        .llDBmSheet{
          width: 100%;
          max-width: 980px;
          height: min(92vh, 820px);
          background:
            radial-gradient(520px 260px at 12% 0%, rgba(124,77,255,0.18), rgba(0,0,0,0) 60%),
            rgba(10,10,14,0.98);
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 -26px 90px rgba(0,0,0,0.60);
          overflow: hidden;
          display:flex;
          flex-direction: column;
          min-height: 0;
        }

        .llDBmGrab{
          display:flex;
          justify-content:center;
          padding: 10px 0 4px;
        }
        .llDBmGrab span{
          width: 44px;
          height: 5px;
          border-radius: 999px;
          background: rgba(255,255,255,0.16);
        }

        .llDBmHeader{
          padding: 10px 14px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .llDBmTitleRow{
          display:flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .llDBmTitle{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 15px;
          color: rgba(255,255,255,0.92);
          line-height: 1.1;
        }
        .llDBmSub{
          font-size: 12px;
          color: rgba(255,255,255,0.62);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70vw;
        }

        .llDBmClose{
          border-radius: 14px;
          padding: 10px 12px;
          font-weight: 950;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
        }
        .llDBmClose:active{ transform: scale(0.98); }

        .llDBmPremium{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(160px 80px at 20% 0%, rgba(255,255,255,0.12), rgba(0,0,0,0) 60%),
            rgba(124,77,255,0.14);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
          user-select: none;
          max-width: 70vw;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .llDBmPremium .x2{
          opacity: 0.92;
          padding: 2px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.18);
          font-size: 11px;
        }

        .llDBmTabsWrap{
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(10,10,14,0.96);
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .llDBmTabs{
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .llDBmTab{
          padding: 10px 10px;
          border-radius: 14px;
          font-weight: 950;
          font-size: 13px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
        }
        .llDBmTab.isActive{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }

        .llDBmContent{
          flex: 1;
          overflow: hidden;
          position: relative;
          min-height: 0;
        }
        .llDBmSlides{
          height: 100%;
          width: 100%;
          display:flex;
          will-change: transform;
          transform: translate3d(0,0,0);
        }
        .llDBmSlide{
          flex: 0 0 100%;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: auto;
          padding: 12px 14px 18px;
          -webkit-overflow-scrolling: touch;
        }

        .llDBmChips{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .llDBmChip{
          display:inline-flex;
          align-items:center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.86);
        }
        .llDBmChip strong{
          font-weight: 1100;
          color: rgba(255,255,255,0.94);
        }

        .llDBmToday{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background:
            radial-gradient(220px 110px at 18% 0%, rgba(124,77,255,0.16), rgba(0,0,0,0) 62%),
            rgba(0,0,0,0.18);
          padding: 12px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.32);
          margin-bottom: 12px;
        }
        .llDBmTodayTop{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .llDBmTodayTitle{
          font-weight: 1100;
          letter-spacing: -0.2px;
          font-size: 14px;
          color: rgba(255,255,255,0.92);
        }
        .llDBmTodayDate{
          font-size: 12px;
          color: rgba(255,255,255,0.62);
          margin-top: 2px;
        }
        .llDBmTodayReward{
          margin-top: 10px;
          display:flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .llDBmRewardBig{
          font-weight: 1200;
          font-size: 22px;
          letter-spacing: -0.3px;
          color: rgba(255,255,255,0.96);
          line-height: 1.05;
        }
        .llDBmX2{
          display:inline-flex;
          align-items:center;
          padding: 6px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(124,77,255,0.12);
          color: rgba(255,255,255,0.92);
          user-select: none;
        }
        .llDBmCTA{
          margin-top: 12px;
          width: 100%;
          padding: 12px 12px;
          border-radius: 16px;
          font-weight: 1100;
          font-size: 14px;
          border: 1px solid rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.18);
          color: rgba(255,255,255,0.96);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
          cursor:pointer;
        }
        .llDBmCTA:disabled{
          opacity: 0.6;
          cursor: not-allowed;
        }
        .llDBmCTA:active{ transform: scale(0.99); }

        /* ── Semaine en GRILLE calendrier (rework 11 juil — fini les 7
              grosses cartes empilées à scroller) ── */
        .llDBmWeekGrid{
          display:grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
        }
        .llDBmWDay{
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.18);
          padding: 8px 2px 7px;
          display:flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          min-width: 0;
        }
        .llDBmWDayL{
          font-weight: 1000;
          font-size: 10px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
        }
        .llDBmWDayR{
          font-weight: 1100;
          font-size: 11.5px;
          color: rgba(255,255,255,0.92);
          white-space: nowrap;
        }
        .llDBmWDayS{
          font-weight: 1200;
          font-size: 12px;
          line-height: 1;
          height: 13px;
        }
        .llDBmWDay.isClaimed{
          border-color: rgba(60,240,180,0.30);
          background: linear-gradient(180deg, rgba(60,240,180,0.12), rgba(0,0,0,0.14));
        }
        .llDBmWDay.isClaimed .llDBmWDayS{ color: #3cf0b4; }
        .llDBmWDay.isMissed{ opacity: 0.42; filter: grayscale(1); }
        .llDBmWDay.isMissed .llDBmWDayS{ color: rgba(255,120,120,0.9); }
        .llDBmWDay.isFuture{ opacity: 0.72; }
        .llDBmWDay.isToday{
          border-color: rgba(124,77,255,0.75);
          background: linear-gradient(180deg, rgba(124,77,255,0.26), rgba(124,77,255,0.08));
          box-shadow: 0 0 0 2px rgba(124,77,255,0.18), 0 0 16px rgba(124,77,255,0.30);
          animation: llDBmTodayPulse 2.4s ease-in-out infinite;
        }
        .llDBmWDay.isToday .llDBmWDayL{ color: rgba(220,205,255,0.95); }
        @keyframes llDBmTodayPulse{
          0%, 100% { box-shadow: 0 0 0 2px rgba(124,77,255,0.18), 0 0 10px rgba(124,77,255,0.22); }
          50% { box-shadow: 0 0 0 2px rgba(124,77,255,0.30), 0 0 20px rgba(124,77,255,0.45); }
        }

        .llDBmSectionTitle{
          margin: 14px 2px 10px;
          font-weight: 1100;
          font-size: 13px;
          color: rgba(255,255,255,0.88);
        }

        /* ── Paliers du mois : barre de progression + jalons posés dessus ── */
        .llDBmTrack{
          position: relative;
          height: 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          margin: 26px 12px 34px;
        }
        .llDBmFill{
          position: absolute;
          left: 0; top: 0; bottom: 0;
          border-radius: 999px;
          background: linear-gradient(90deg, #7c4dff, #b39dff);
          box-shadow: 0 0 12px rgba(124,77,255,0.55);
          transition: width .4s ease;
        }
        .llDBmStone{
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display:flex;
          flex-direction: column;
          align-items:center;
          justify-content:center;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(16,12,24,0.98);
          font-weight: 1100;
          font-size: 10px;
          color: rgba(255,255,255,0.88);
          user-select: none;
          line-height: 1.05;
        }
        .llDBmStone small{ font-size: 9px; opacity: 0.7; font-weight: 900; }
        .llDBmStone.isLocked{ opacity: 0.55; filter: grayscale(1); }
        .llDBmStone.isClaimed{
          border-color: rgba(60,240,180,0.45);
          background: rgba(20,40,34,0.98);
          color: #3cf0b4;
        }
        .llDBmStone.isClaimable{
          border-color: rgba(255,214,110,0.75);
          background: rgba(40,32,10,0.98);
          color: #ffd66e;
          cursor: pointer;
          animation: llDBmStonePulse 1.6s ease-in-out infinite;
        }
        .llDBmStone.isClaimable:active{ transform: translate(-50%, -50%) scale(0.94); }
        @keyframes llDBmStonePulse{
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,214,110,0.35); }
          50% { box-shadow: 0 0 0 7px rgba(255,214,110,0); }
        }

        .llDBmInfoCard{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          padding: 12px;
        }
        .llDBmInfoText{
          font-size: 13px;
          color: rgba(255,255,255,0.86);
          line-height: 1.7;
          font-weight: 850;
        }
        .llDBmInfoText small{
          font-weight: 800;
          color: rgba(255,255,255,0.70);
        }

        .llDBmCms{
          font-size: 13px;
          color: rgba(255,255,255,0.90);
          line-height: 1.75;
          font-weight: 850;
        }
        .llDBmCms a{
          color: rgba(200,185,255,0.95);
          text-decoration: underline;
        }
        .llDBmCms h1,.llDBmCms h2,.llDBmCms h3{
          margin: 10px 0 6px;
          color: rgba(255,255,255,0.95);
          font-weight: 1100;
          letter-spacing: -0.2px;
        }
        .llDBmCms p{ margin: 8px 0; }
        .llDBmCms ul{ margin: 8px 0 8px 18px; }
        .llDBmCms li{ margin: 4px 0; }

        .llDBmContentTabs{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .llDBmContentTab{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 9px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.86);
          cursor: pointer;
          user-select: none;
        }
        .llDBmContentTab.isActive{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }

        @media (prefers-reduced-motion: reduce){
          .llDBmSlides{ transition: none !important; }
        }
      `}</style>

      {toast ? <div className="llDBmToast">{toast}</div> : null}

      <div className="llDBmSheet">
        <div className="llDBmGrab" aria-hidden="true">
          <span />
        </div>

        <div className="llDBmHeader">
          <div className="llDBmTitleRow">
            <div className="llDBmTitle">Bonus</div>
            <div className="llDBmSub">
              Aujourd’hui: {state.day} • {state.monthClaimedDays} jour(s) ce mois • 🎡 {wheelTickets} • 🏅 {prestigeTokens} • Rôle{" "}
              {String(userRole || "viewer")}
            </div>
          </div>

          <button
            type="button"
            className="llDBmClose"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="llDBmTabsWrap">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {premiumActive ? (
              <div className="llDBmPremium" title="Vos récompenses quotidiennes sont doublées">
                <span style={{ fontWeight: 1100 }}>★</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{premiumLabel}</span>
                <span className="x2">x2</span>
              </div>
            ) : (
              <div />
            )}
          </div>

          <div className="llDBmTabs" style={{ marginTop: 10 }}>
            {TABS.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`llDBmTab ${isActive ? "isActive" : ""}`}
                  onClick={() => setTab(t.key)}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", width: "100%" }}>
                    <span>{t.label}</span>
                    {t.key === "content" ? <UnreadBadge show={anyContentUnread} title="Nouveautés à lire" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="llDBmContent" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div
            className="llDBmSlides"
            style={{
              transform: `translate3d(${slidePct}%, 0, 0) translate3d(${dragPx}px, 0, 0)`,
              transition: dragDx ? "none" : "transform .18s ease",
            }}
          >
            {/* Slide 1: Agenda */}
            <div className="llDBmSlide">
              <div className="llDBmChips">
                <div className="llDBmChip">
                  <span>📅</span> <span>Cycle</span> <strong>hebdo</strong>
                </div>
                <div className="llDBmChip">
                  <span>🕒</span> <span>Timezone</span> <strong>Europe/Paris</strong>
                </div>
                {premiumActive ? (
                  <div className="llDBmChip" title="Récompenses quotidiennes doublées">
                    <span>★</span> <strong>x2</strong>
                  </div>
                ) : null}
              </div>

              {today ? (
                <div className="llDBmToday">
                  <div className="llDBmTodayTop">
                    <div>
                      <div className="llDBmTodayTitle">Aujourd’hui</div>
                      <div className="llDBmTodayDate">
                        {today.label} • {today.date}
                      </div>
                    </div>
                    <div className="llDBmBadge" title="Statut">
                      {statusChip(today.status).label}
                    </div>
                  </div>

                  <div className="llDBmTodayReward">
                    <div className="llDBmRewardBig">{rewardLabel(today.reward)}</div>
                    {premiumActive ? <div className="llDBmX2">x2</div> : null}
                  </div>

                  <button
                    type="button"
                    className="llDBmCTA"
                    onClick={() => {
                      if (canClaimToday) claimToday();
                    }}
                    disabled={!canClaimToday || busy === "today"}
                  >
                    {busy === "today"
                      ? "Récupération…"
                      : today.status === "today_claimed"
                      ? "Déjà récupéré"
                      : "Récupérer maintenant"}
                  </button>
                </div>
              ) : null}

              {/* semaine en grille calendrier compacte (tout visible d'un
                  coup, l'état se lit à la couleur — rework 11 juil) */}
              <div className="llDBmSectionTitle" style={{ marginTop: 0 }}>Ma semaine</div>
              <div className="llDBmWeekGrid">
                {week.map((d) => {
                  const cls =
                    d.status === "today_claimable" || d.status === "today_claimed"
                      ? "isToday"
                      : d.status === "claimed"
                      ? "isClaimed"
                      : d.status === "missed"
                      ? "isMissed"
                      : "isFuture";
                  return (
                    <div key={d.date} className={`llDBmWDay ${cls}`} title={`${d.label} • ${d.date} • ${statusChip(d.status).label}`}>
                      <div className="llDBmWDayL">{String(d.label || "").slice(0, 3)}</div>
                      <div className="llDBmWDayR">{rewardLabel(d.reward)}</div>
                      <div className="llDBmWDayS" aria-hidden="true">{dayBadge(d.status)}</div>
                    </div>
                  );
                })}
              </div>

              {/* paliers = jalons posés sur la progression du mois */}
              <div className="llDBmSectionTitle">
                Paliers du mois — {state.monthClaimedDays}/30 jours
              </div>
              <div className="llDBmTrack">
                <div className="llDBmFill" style={{ width: `${clamp((state.monthClaimedDays / 30) * 100, 0, 100)}%` }} />
                {milestones.map((m) => {
                  const isClaimable = m.status === "claimable" && !busy;
                  const cls = m.status === "locked" ? "isLocked" : m.status === "claimed" ? "isClaimed" : "isClaimable";
                  const icon = m.status === "claimed" ? "✓" : m.status === "claimable" ? (busy === `m${m.milestone}` ? "…" : "★") : "🔒";
                  return (
                    <div
                      key={m.milestone}
                      role={isClaimable ? "button" : undefined}
                      tabIndex={isClaimable ? 0 : -1}
                      className={`llDBmStone ${cls}`}
                      style={{ left: `${(m.milestone / 30) * 100}%` }}
                      onClick={() => {
                        if (m.status === "claimable" && !busy) claimMilestone(m.milestone);
                      }}
                      onKeyDown={(e) => {
                        if (!isClaimable) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          claimMilestone(m.milestone);
                        }
                      }}
                      title={m.status === "claimable" ? "Cliquer pour récupérer" : `Palier ${m.milestone} jours`}
                    >
                      <span>{m.milestone}j</span>
                      <small>{icon}</small>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 10 }} className="llDBmInfoCard">
                <div className="llDBmInfoText">
                  <small>
                    • 20j = Skin (unique, sinon +20 rubis)
                    <br />• 30j = Titre (unique, sinon +1 jeton prestige)
                  </small>
                </div>
              </div>
            </div>

            {/* Slide 2: Content (CMS) — align desktop */}
            <div className="llDBmSlide">
              <div className="llDBmContentTabs">
                {contentTabs.map((t) => {
                  const label = contentTitles[t.key] || t.fallbackLabel;
                  const active = activeContentKey === t.key;
                  const showBang = Boolean(contentUnread[t.key]);
                  return (
                    <button
                      key={t.key}
                      type="button"
                      className={`llDBmContentTab ${active ? "isActive" : ""}`}
                      onClick={() => setActiveContentKey(t.key)}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span>{label}</span>
                        <UnreadBadge show={showBang} title="Nouveautés à lire" />
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="llDBmInfoCard">
                <div className="llDBmSectionTitle" style={{ margin: "0 0 10px" }}>
                  {activeContentLabel}
                </div>

                {contentLoading ? (
                  <div className="llDBmInfoText">Chargement…</div>
                ) : contentHtml ? (
                  <div className="llDBmCms" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                ) : (
                  <div className="llDBmInfoText">Contenu indisponible.</div>
                )}
              </div>

              <div style={{ marginTop: 12 }} className="llDBmInfoCard">
                <div className="llDBmInfoText">
                  <strong>Conseil :</strong> ouvre ce menu chaque jour et récupère direct.
                  <br />
                  <small>(Tu peux swipe pour passer Bonus / Infos / Events.)</small>
                </div>
              </div>
            </div>

            {/* Slide 3: Events */}
            <div className="llDBmSlide">
              <div className="llDBmInfoCard">
                <div className="llDBmInfoText">Onglet réservé pour plus tard (events, annonces, promos, etc.).</div>
              </div>

              <div style={{ marginTop: 12 }} className="llDBmInfoCard">
                <div className="llDBmInfoText">
                  <small>Astuce : tu pourras pousser ici des événements “week-end”, des boosts temporaires, des annonces…</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
