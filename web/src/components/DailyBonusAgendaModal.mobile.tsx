// web/src/components/DailyBonusAgendaModal.mobile.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import { claimDailyBonusToday, claimDailyBonusMilestone, publicGetContent } from "../lib/api";
import { useAuth } from "../auth/AuthProvider";

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

const TABS = [
  { key: "agenda", label: "Bonus" },
  { key: "infos", label: "Infos" },
  { key: "event", label: "Events" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

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

  const [tab, setTab] = React.useState<TabKey>("agenda");
  const [busy, setBusy] = React.useState<string | null>(null);

  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);

  const tokensAny = (state as any)?.tokens ?? {};
  const wheelTickets = Number(tokensAny?.wheel_ticket ?? 0);
  const prestigeTokens = Number(tokensAny?.prestige_token ?? 0);

  const week: WeekDay[] = Array.isArray((state as any)?.week) ? (state as any).week : [];
  const milestones: Milestone[] = Array.isArray((state as any)?.milestones) ? (state as any).milestones : [];

  const premiumActive = Boolean(
    (state as any)?.premiumActive ??
      (state as any)?.premium?.active ??
      (state as any)?.premium?.isActive ??
      false
  );
  const premiumLabel = String((state as any)?.premium?.label ?? "").trim() || "Abonnement actif";

  const activeIndex = React.useMemo(() => TABS.findIndex((t) => t.key === tab), [tab]);

  const showToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
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

  // ESC (utile sur desktop même si fichier mobile)
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ✅ Infos dynamiques (CMS)
  const [infosHtml, setInfosHtml] = React.useState<string | null>(null);
  const [infosLoading, setInfosLoading] = React.useState(false);

  React.useEffect(() => {
    let dead = false;

    async function loadInfos() {
      if (tab !== "infos") return;
      setInfosLoading(true);
      try {
        const r: any = await publicGetContent("daily_bonus_infos");
        const html = r?.item?.html ? sanitizeHtmlLite(String(r.item.html)) : null;
        if (!dead) setInfosHtml(html);
      } catch {
        if (!dead) setInfosHtml(null);
      } finally {
        if (!dead) setInfosLoading(false);
      }
    }

    loadInfos();
    return () => {
      dead = true;
    };
  }, [tab]);

  // Swipe tabs
  const touch = React.useRef<{
    x0: number;
    y0: number;
    t0: number;
    dragging: boolean;
    dx: number;
  } | null>(null);

  const [dragDx, setDragDx] = React.useState(0);

  const setTabByIndex = React.useCallback((idx: number) => {
    const i = clamp(idx, 0, TABS.length - 1);
    setTab(TABS[i].key);
  }, []);

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

    // si c'est plutôt un scroll vertical, on ne “lock” pas le swipe
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

    // seuil: soit distance, soit flick rapide
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

        .llDBmList{
          display:flex;
          flex-direction: column;
          gap: 10px;
        }
        .llDBmDay{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(180px 90px at 18% 0%, rgba(255,255,255,0.06), rgba(0,0,0,0) 62%),
            rgba(0,0,0,0.16);
          padding: 12px;
        }
        .llDBmDay.isMissed{ opacity: 0.55; filter: grayscale(1); }
        .llDBmDay.isDim{ opacity: 0.78; }
        .llDBmDayHead{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .llDBmDayLeft{
          display:flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .llDBmDayLabel{
          font-weight: 1100;
          font-size: 13px;
          color: rgba(255,255,255,0.92);
        }
        .llDBmDayDate{
          font-size: 12px;
          color: rgba(255,255,255,0.62);
        }
        .llDBmBadge{
          font-weight: 1200;
          opacity: 0.85;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.86);
        }

        .llDBmDayReward{
          margin-top: 10px;
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
        }
        .llDBmReward{
          font-weight: 1100;
          font-size: 18px;
          letter-spacing: -0.2px;
          color: rgba(255,255,255,0.92);
        }

        .llDBmChipStatus{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 7px 10px;
          border-radius: 999px;
          font-weight: 950;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          color: rgba(255,255,255,0.80);
          white-space: nowrap;
        }
        .llDBmChipStatus.ok{
          border-color: rgba(60, 240, 180, 0.26);
          background: rgba(60, 240, 180, 0.10);
          color: rgba(230,255,248,0.92);
        }
        .llDBmChipStatus.bad{
          border-color: rgba(255,90,90,0.24);
          background: rgba(255,90,90,0.10);
          color: rgba(255,210,210,0.92);
        }
        .llDBmChipStatus.cta{
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.16);
          color: rgba(255,255,255,0.92);
          box-shadow: 0 0 0 2px rgba(124,77,255,0.10);
        }

        .llDBmSectionTitle{
          margin: 14px 2px 10px;
          font-weight: 1100;
          font-size: 13px;
          color: rgba(255,255,255,0.88);
        }
        .llDBmMilestones{
          display:flex;
          gap: 10px;
          overflow-x: auto;
          padding-bottom: 6px;
          -webkit-overflow-scrolling: touch;
        }
        .llDBmMilestone{
          flex: 0 0 auto;
          display:inline-flex;
          align-items:center;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.14);
          font-weight: 1000;
          font-size: 12px;
          color: rgba(255,255,255,0.88);
          user-select: none;
        }
        .llDBmMilestone.isLocked{ opacity: 0.55; filter: grayscale(1); }
        .llDBmMilestone.isClaimed{ opacity: 0.78; }
        .llDBmMilestone.isClaimable{
          border-color: rgba(255,255,255,0.18);
          cursor: pointer;
        }
        .llDBmMilestone.isClaimable:active{
          transform: scale(0.98);
          border-color: rgba(124,77,255,0.55);
          background: rgba(124,77,255,0.14);
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

        /* ✅ rendu HTML CMS */
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
              Aujourd’hui: {state.day} • {state.monthClaimedDays} jour(s) ce mois • 🎡 {wheelTickets} • 🏅 {prestigeTokens}
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
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`llDBmTab ${tab === t.key ? "isActive" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
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

              <div className="llDBmList">
                {week.map((d) => {
                  const chip = statusChip(d.status);
                  const dim = d.status === "future" || d.status === "claimed" || d.status === "today_claimed";
                  const missed = d.status === "missed";

                  return (
                    <div
                      key={d.date}
                      className={["llDBmDay", dim ? "isDim" : "", missed ? "isMissed" : ""].join(" ")}
                    >
                      <div className="llDBmDayHead">
                        <div className="llDBmDayLeft">
                          <div className="llDBmDayLabel">{d.label}</div>
                          <div className="llDBmDayDate">{d.date}</div>
                        </div>
                        <div className="llDBmBadge" aria-hidden="true">
                          {dayBadge(d.status)}
                        </div>
                      </div>

                      <div className="llDBmDayReward">
                        <div className="llDBmReward">{rewardLabel(d.reward)}</div>
                        {premiumActive ? <div className="llDBmX2">x2</div> : null}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <span className={`llDBmChipStatus ${chip.kind}`}>
                          {chip.kind === "cta" && busy === "today" ? "Récupération…" : chip.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="llDBmSectionTitle">Paliers du mois</div>
              <div className="llDBmMilestones">
                {milestones.map((m) => {
                  const isClaimable = m.status === "claimable" && !busy;
                  const cls =
                    m.status === "locked" ? "isLocked" : m.status === "claimed" ? "isClaimed" : "isClaimable";

                  const right =
                    m.status === "claimed"
                      ? "✓"
                      : m.status === "claimable"
                      ? busy === `m${m.milestone}`
                        ? "…"
                        : "★"
                      : "🔒";

                  return (
                    <div
                      key={m.milestone}
                      role={isClaimable ? "button" : undefined}
                      tabIndex={isClaimable ? 0 : -1}
                      className={`llDBmMilestone ${cls}`}
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
                      title={m.status === "claimable" ? "Cliquer pour récupérer" : undefined}
                    >
                      <span>{m.milestone}j</span>
                      <span style={{ opacity: 0.86 }}>{right}</span>
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

            {/* Slide 2: Infos (CMS) */}
            <div className="llDBmSlide">
              <div className="llDBmInfoCard">
                {infosLoading ? (
                  <div className="llDBmInfoText">Chargement…</div>
                ) : infosHtml ? (
                  <div className="llDBmCms" dangerouslySetInnerHTML={{ __html: infosHtml }} />
                ) : (
                  <div className="llDBmInfoText">
                    • 1 récupération par jour <small>(timezone Europe/Paris)</small>.<br />
                    • Cycle hebdo : <strong>Lun 3</strong> / <strong>Mar 3</strong> / <strong>Mer 🎡</strong> /{" "}
                    <strong>Jeu 5</strong> / <strong>Ven 5</strong> / <strong>Sam 🎡</strong> / <strong>Dim 10</strong>.
                    <br />
                    • Les paliers <strong>5/10/20/30</strong> = nombre de jours claimés dans le mois (pas forcément en
                    streak).
                    <br />
                    • Skins/titres seront visibles plus tard (shop/collections).
                    {premiumActive ? (
                      <>
                        <br />• Premium actif : récompenses quotidiennes <strong>x2</strong>.
                      </>
                    ) : null}
                  </div>
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
