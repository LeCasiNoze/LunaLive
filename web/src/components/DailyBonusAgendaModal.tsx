// web/src/components/DailyBonusAgendaModal.tsx
import * as React from "react";
import { createPortal } from "react-dom";
import {
  claimDailyBonusToday,
  claimDailyBonusMilestone,
  publicGetContent,
  publicListContentTabs,
  getWelcomeState,
  claimWelcome,
  type ApiPublicContentTab,
} from "../lib/api";
import { useAuth } from "../auth/AuthProvider";
import { DailyBonusAgendaModalMobile } from "./DailyBonusAgendaModal.mobile";
import { useIsMobile } from "../hooks/useIsMobile";
import { UnreadBadge } from "./UnreadBadge";
import { contentVersionFromItem, isUnread, setSeenVersion } from "../lib/unread_seen";

/* ─── Types ──────────────────────────────────────────────────────── */
type WeekDay = {
  isodow: number;
  label: string;
  date: string;
  reward:
    | { type: "rubis"; amount: number; origin: string; weight_bp: number }
    | { type: "token"; token: "wheel_ticket"; amount: number };
  status: "future" | "missed" | "claimed" | "today_claimable" | "today_claimed";
};

type Milestone = {
  milestone: 5 | 10 | 20 | 30;
  status: "locked" | "claimable" | "claimed";
};

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
type TabKey = "agenda" | "content" | "welcome";
type ContentKey = string;

/* ─── Helpers ────────────────────────────────────────────────────── */
function roleRank(r: any): number {
  const v = String(r || "viewer").toLowerCase();
  if (v === "admin")                    return 3;
  if (v === "streamer")                 return 2;
  if (v === "moderator" || v === "mod") return 1;
  return 0;
}
function canSee(minRole: Role, userRole: any) {
  return roleRank(userRole) >= roleRank(minRole);
}
function rewardLabel(r: WeekDay["reward"]) {
  if (r.type === "rubis") return `💎 ${r.amount}`;
  return `🎡 ×${r.amount}`;
}
function toastTextFromGranted(granted: any[] | null | undefined) {
  const arr = Array.isArray(granted) ? granted : [];
  if (!arr.length) return "Récompense récupérée ✅";
  let rubis = 0, wheel = 0, prestige = 0;
  for (const g of arr) {
    if (!g) continue;
    if (g.type === "rubis")  { rubis    += Number(g.amount); continue; }
    if (g.type === "token")  {
      if (g.token === "wheel_ticket")   wheel    += Number(g.amount);
      else if (g.token === "prestige_token") prestige += Number(g.amount);
      continue;
    }
  }
  const parts: string[] = [];
  if (rubis)    parts.push(`+${rubis} rubis`);
  if (wheel)    parts.push(`+${wheel} ticket(s) roue`);
  if (prestige) parts.push(`+${prestige} jeton(s) prestige`);
  return parts.length ? `${parts.join(" · ")} ✅` : "Récompense récupérée ✅";
}
function dayBadge(status: WeekDay["status"]) {
  if (status === "claimed" || status === "today_claimed") return "✓";
  if (status === "missed") return "✗";
  return "";
}
function humanizeKey(key: string) {
  return String(key || "").replace(/^(bonus_|daily_bonus_|guide_)/, "").replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase()).trim() || "Contenu";
}
function sanitizeHtmlLite(input: string) {
  try {
    const doc = new DOMParser().parseFromString(String(input || ""), "text/html");
    doc.querySelectorAll("script, iframe, object, embed").forEach(n => n.remove());
    doc.querySelectorAll("*").forEach(el => {
      [...el.attributes].forEach(a => {
        const name = a.name.toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(a.name);
        if ((name === "href" || name === "src") && /^\s*javascript:/i.test(a.value))
          el.removeAttribute(a.name);
      });
    });
    return doc.body.innerHTML || "";
  } catch {
    return String(input || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  }
}
function versionFromAnyItem(item: any) {
  return contentVersionFromItem({
    ...item,
    updatedAt: (item as any)?.updatedAt ?? (item as any)?.updated_at,
  } as any);
}

function useInjectStyles(id: string, styles: string) {
  React.useEffect(() => {
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = styles;
    document.head.appendChild(el);
  }, [id, styles]);
}

/* ─── CSS ────────────────────────────────────────────────────────── */
const CSS = `
@keyframes dba-modal-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dba-modal-up {
  from { opacity: 0; transform: translateY(18px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes dba-shimmer {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@keyframes dba-toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes dba-claim-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(124,92,252,0); }
  50%       { box-shadow: 0 0 0 6px rgba(124,92,252,0.18); }
}

/* ── Backdrop ── */
.dba-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(4,3,10,0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  animation: dba-modal-fade 200ms ease;
}

/* ── Toast ── */
.dba-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(11,9,22,0.96);
  border: 1px solid rgba(124,92,252,0.30);
  box-shadow: 0 18px 60px rgba(0,0,0,0.55), 0 0 20px rgba(124,92,252,0.14);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: rgba(235,232,255,0.94);
  white-space: nowrap;
  animation: dba-toast-in 220ms cubic-bezier(0.22,1,0.36,1);
}

/* ── Dialog ── */
.dba-modal {
  position: relative;
  width: min(980px, 96vw);
  height: min(780px, 90vh);
  display: grid;
  grid-template-columns: 240px 1fr;
  border-radius: 22px;
  border: 1px solid rgba(124,92,252,0.20);
  background: rgba(9,7,20,0.96);
  box-shadow:
    0 40px 100px rgba(0,0,0,0.70),
    0 0 0 1px rgba(167,139,250,0.06) inset,
    0 0 80px rgba(124,92,252,0.10);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  overflow: hidden;
  animation: dba-modal-up 260ms cubic-bezier(0.22,1,0.36,1);
}
/* Reflet haut */
.dba-modal::before {
  content: "";
  position: absolute;
  top: 0; left: 6%; right: 6%;
  height: 1px;
  background: linear-gradient(90deg,
    transparent,
    rgba(167,139,250,0.45) 35%,
    rgba(91,142,248,0.32) 65%,
    transparent
  );
  pointer-events: none;
  z-index: 2;
}
/* Lueur ambiante */
.dba-modal::after {
  content: "";
  position: absolute;
  top: -60px; left: -60px;
  width: 340px; height: 220px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(124,92,252,0.12), transparent 70%);
  pointer-events: none;
}
@media (max-width: 780px) {
  .dba-modal { grid-template-columns: 1fr; height: 92vh; }
}

/* ── Sidebar ── */
.dba-sidebar {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 14px;
  border-right: 1px solid rgba(124,92,252,0.12);
  background: rgba(255,255,255,0.014);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
}
@media (max-width: 780px) {
  .dba-sidebar { border-right: none; border-bottom: 1px solid rgba(124,92,252,0.12); }
}

.dba-sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 2px;
}

/* Titre sidebar — Syne shimmer */
.dba-sidebar-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.4px;
  line-height: 1;
  background: linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 8px rgba(124,92,252,0.38));
  animation: dba-shimmer 5s ease-in-out infinite;
}

/* Bouton fermer */
.dba-close {
  width: 30px; height: 30px;
  border-radius: 9px;
  border: 1px solid rgba(124,92,252,0.18);
  background: rgba(255,255,255,0.04);
  color: rgba(200,195,240,0.65);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 13px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: background 150ms ease, border-color 150ms ease, transform 130ms cubic-bezier(.22,1,.36,1);
}
.dba-close:hover {
  background: rgba(124,92,252,0.12);
  border-color: rgba(124,92,252,0.35);
  transform: scale(1.06);
}

/* Nav tabs sidebar */
.dba-nav { display: grid; gap: 6px; }

.dba-nav-btn {
  width: 100%;
  text-align: left;
  padding: 9px 12px;
  border-radius: 13px;
  border: 1px solid rgba(124,92,252,0.10);
  background: rgba(124,92,252,0.05);
  color: rgba(200,195,240,0.75);
  cursor: pointer;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: -0.1px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 130ms cubic-bezier(.22,1,.36,1);
}
.dba-nav-btn:hover {
  background: rgba(124,92,252,0.10);
  border-color: rgba(124,92,252,0.22);
  color: rgba(235,232,255,0.90);
  transform: translateX(2px);
}
.dba-nav-btn.is-active {
  border-color: rgba(124,92,252,0.38);
  background: rgba(124,92,252,0.16);
  color: rgba(235,232,255,0.96);
  box-shadow: 0 4px 16px rgba(0,0,0,0.24), 0 0 0 1px rgba(124,92,252,0.10) inset;
}
.dba-nav-btn.is-soon {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Meta info */
.dba-meta {
  margin-top: auto;
  padding: 11px 12px;
  border-radius: 13px;
  border: 1px solid rgba(124,92,252,0.10);
  background: rgba(0,0,0,0.22);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(167,155,220,0.52);
  line-height: 1.65;
}
.dba-meta strong { color: rgba(200,195,240,0.80); font-weight: 700; }

/* ── Main body ── */
.dba-body {
  position: relative;
  z-index: 1;
  padding: 18px 18px 22px;
  overflow-y: auto;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: rgba(124,92,252,0.20) transparent;
}
.dba-body::-webkit-scrollbar { width: 4px; }
.dba-body::-webkit-scrollbar-track { background: transparent; }
.dba-body::-webkit-scrollbar-thumb { background: rgba(124,92,252,0.20); border-radius: 4px; }

/* Section header */
.dba-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.dba-section-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 16px;
  letter-spacing: -0.5px;
  background: linear-gradient(105deg, #c4b5fd 0%, #7c5cfc 35%, #5b8ef8 70%, #93c5fd 100%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 8px rgba(124,92,252,0.30));
  animation: dba-shimmer 5s ease-in-out infinite;
}
.dba-section-sub {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(167,155,220,0.50);
}

/* Premium pill */
.dba-premium-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(251,191,36,0.30);
  background: rgba(251,191,36,0.10);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: #fde68a;
  box-shadow: 0 0 16px rgba(251,191,36,0.10);
}
.dba-premium-pill .x2-badge {
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(251,191,36,0.25);
  background: rgba(0,0,0,0.22);
  font-size: 11px;
}

/* ── Grille semaine ── */
.dba-week-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 900px)  { .dba-week-grid { grid-template-columns: repeat(3,1fr); } }
@media (max-width: 640px)  { .dba-week-grid { grid-template-columns: repeat(2,1fr); } }

/* Card jour */
.dba-day {
  position: relative;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(124,92,252,0.12);
  background: rgba(255,255,255,0.025);
  color: rgba(235,232,255,0.88);
  text-align: left;
  cursor: default;
  user-select: none;
  transition:
    transform    130ms cubic-bezier(.22,1,.36,1),
    border-color 160ms ease,
    background   160ms ease,
    box-shadow   160ms ease;
}
.dba-day.is-claimable {
  cursor: pointer;
  border-color: rgba(124,92,252,0.28);
  background: rgba(124,92,252,0.08);
  animation: dba-claim-pulse 2s ease-in-out infinite;
}
.dba-day.is-claimable:hover {
  transform: translateY(-2px);
  border-color: rgba(167,139,250,0.55);
  background: rgba(124,92,252,0.14);
  box-shadow: 0 14px 40px rgba(0,0,0,0.38), 0 0 20px rgba(124,92,252,0.18);
  animation: none;
}
.dba-day.is-dim    { opacity: 0.60; }
.dba-day.is-missed { opacity: 0.40; filter: grayscale(0.8); }

.dba-day-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.dba-day-label {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: -0.1px;
  color: rgba(200,195,240,0.85);
}
.dba-day-mark {
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 700;
  font-size: 13px;
  opacity: 0.70;
}
.dba-day-reward {
  margin-top: 9px;
  font-family: 'Syne', system-ui, sans-serif;
  font-weight: 800;
  font-size: 17px;
  letter-spacing: -0.3px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.dba-x2-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(124,92,252,0.28);
  background: rgba(124,92,252,0.12);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #c4b5fd;
}
.dba-day-date {
  margin-top: 6px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  color: rgba(167,155,220,0.45);
}

/* Status pill */
.dba-status {
  margin-top: 9px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid rgba(255,255,255,0.09);
  background: rgba(0,0,0,0.18);
  color: rgba(167,155,220,0.60);
}
.dba-status.is-ok  { border-color: rgba(52,211,153,0.30); background: rgba(52,211,153,0.10); color: rgba(167,243,208,0.90); }
.dba-status.is-bad { border-color: rgba(239,68,68,0.28); background: rgba(239,68,68,0.10); color: rgba(252,165,165,0.90); }
.dba-status.is-cta {
  border-color: rgba(124,92,252,0.45);
  background: rgba(124,92,252,0.16);
  color: rgba(235,232,255,0.96);
  box-shadow: 0 0 10px rgba(124,92,252,0.14);
}

/* Premium star coin */
.dba-prem-star {
  position: absolute;
  top: 9px; right: 9px;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1px solid rgba(251,191,36,0.35);
  background: rgba(251,191,36,0.12);
  display: grid;
  place-items: center;
  font-size: 11px;
  pointer-events: none;
}

/* ── Panel (milestones / content) ── */
.dba-panel {
  margin-top: 14px;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(124,92,252,0.10);
  background: rgba(0,0,0,0.18);
}
.dba-panel-title {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: rgba(167,155,220,0.45);
  margin-bottom: 10px;
}

/* Milestones */
.dba-milestones { display: flex; flex-wrap: wrap; gap: 8px; }
.dba-milestone {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid rgba(124,92,252,0.12);
  background: rgba(0,0,0,0.18);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: rgba(200,195,240,0.75);
  cursor: default;
  user-select: none;
  transition:
    border-color 150ms ease,
    background   150ms ease,
    transform    130ms cubic-bezier(.22,1,.36,1),
    box-shadow   150ms ease;
}
.dba-milestone.is-locked  { opacity: 0.42; filter: grayscale(0.7); }
.dba-milestone.is-claimed { opacity: 0.65; }
.dba-milestone.is-claimable {
  cursor: pointer;
  border-color: rgba(124,92,252,0.32);
  background: rgba(124,92,252,0.10);
  color: rgba(235,232,255,0.92);
}
.dba-milestone.is-claimable:hover {
  border-color: rgba(167,139,250,0.55);
  background: rgba(124,92,252,0.18);
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.32), 0 0 14px rgba(124,92,252,0.18);
}
.dba-milestone-hint {
  margin-top: 10px;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: rgba(167,155,220,0.45);
  line-height: 1.65;
}

/* ── Content HTML ── */
.dba-content-html {
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(200,195,240,0.82);
  line-height: 1.7;
}
.dba-content-html h1,.dba-content-html h2,.dba-content-html h3 {
  font-weight: 800;
  color: rgba(235,232,255,0.94);
  margin: 12px 0 6px;
}
.dba-content-html a { color: #a78bfa; text-decoration: underline; }
.dba-content-html strong { color: rgba(235,232,255,0.90); font-weight: 700; }

/* ── Welcome quêtes ── */
.dba-quest-list { display: grid; gap: 8px; }
.dba-quest {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  border-radius: 13px;
  border: 1px solid rgba(124,92,252,0.10);
  background: rgba(0,0,0,0.16);
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: rgba(200,195,240,0.82);
}
.dba-quest.is-done {
  border-color: rgba(52,211,153,0.22);
  background: rgba(52,211,153,0.07);
  color: rgba(167,243,208,0.85);
}
.dba-quest-check { font-size: 14px; flex-shrink: 0; }
.dba-quest-progress {
  font-size: 11px;
  color: rgba(167,155,220,0.55);
  flex-shrink: 0;
}

/* ── Btn claim ── */
.dba-claim-btn {
  position: relative;
  padding: 10px 20px;
  border-radius: 13px;
  border: 1px solid rgba(124,92,252,0.38);
  background: linear-gradient(135deg, rgba(124,92,252,0.38), rgba(59,77,200,0.26), rgba(91,142,248,0.18));
  color: rgba(235,232,255,0.96);
  cursor: pointer;
  font-family: 'Syne', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: -0.15px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.30), 0 0 0 1px rgba(124,92,252,0.10) inset;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform    120ms cubic-bezier(.22,1,.36,1),
    filter       150ms ease,
    border-color 150ms ease,
    box-shadow   150ms ease;
}
.dba-claim-btn::before {
  content: "";
  position: absolute;
  top: 0; left: 12%; right: 12%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(200,180,255,0.40), transparent);
  pointer-events: none;
}
.dba-claim-btn:hover:not(:disabled) {
  filter: brightness(1.12);
  border-color: rgba(167,139,250,0.60);
  box-shadow: 0 14px 38px rgba(0,0,0,0.40), 0 0 24px rgba(124,92,252,0.24), 0 0 0 1px rgba(124,92,252,0.16) inset;
  transform: translateY(-1px);
}
.dba-claim-btn:active:not(:disabled) { transform: translateY(0); filter: brightness(0.95); }
.dba-claim-btn:disabled { opacity: 0.35; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .dba-day, .dba-milestone, .dba-nav-btn, .dba-close { transition: border-color .15s ease, background .15s ease; }
  .dba-day:hover, .dba-milestone:hover, .dba-nav-btn:hover, .dba-close:hover { transform: none !important; }
  .dba-day.is-claimable { animation: none; }
}
`;

/* ─── Composant wrapper mobile/desktop ───────────────────────────── */
export function DailyBonusAgendaModal({
  state,
  onClose,
  onState,
}: {
  state: DailyBonusState;
  onClose: () => void;
  onState: (s: DailyBonusState) => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DailyBonusAgendaModalMobile state={state} onClose={onClose} onState={onState} />;
  }
  return <DailyBonusAgendaModalDesktop state={state} onClose={onClose} onState={onState} />;
}

/* ─── Desktop modal ──────────────────────────────────────────────── */
function DailyBonusAgendaModalDesktop({
  state,
  onClose,
  onState,
}: {
  state: DailyBonusState;
  onClose: () => void;
  onState: (s: DailyBonusState) => void;
}) {
  useInjectStyles("dba-modal-styles", CSS);

  const auth      = useAuth() as any;
  const token     = auth?.token ?? null;
  const refreshMe = auth?.refreshMe ?? (async () => {});
  const userRole: Role = String(auth?.user?.role || "viewer").toLowerCase() as any;

  const tokensAny      = (state as any)?.tokens ?? {};
  const wheelTickets   = Number(tokensAny?.wheel_ticket ?? 0);
  const prestigeTokens = Number(tokensAny?.prestige_token ?? 0);
  const week           = Array.isArray((state as any)?.week)       ? (state as any).week       : [];
  const milestones     = Array.isArray((state as any)?.milestones) ? (state as any).milestones : [];
  const premiumActive  = Boolean((state as any)?.premiumActive ?? (state as any)?.premium?.active ?? false);
  const premiumLabel   = String((state as any)?.premium?.label ?? "").trim() || "Abonnement actif";

  /* ── Content tabs ── */
  const [contentList, setContentList] = React.useState<ApiPublicContentTab[]>([]);
  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r: any = await publicListContentTabs();
        const items = Array.isArray(r?.items) ? (r.items as ApiPublicContentTab[]) : [];
        if (!dead) setContentList(items);
      } catch { if (!dead) setContentList([]); }
    })();
    return () => { dead = true; };
  }, []);

  const contentTabs = React.useMemo(() => {
    return (contentList || [])
      .map((it: any) => ({
        key: String(it?.key || "").trim(),
        minRole: String(it?.min_role || "viewer").toLowerCase() as Role,
        title: String(it?.title || "").trim(),
        updated_at: it?.updated_at ?? null,
        fallbackLabel: String(it?.title || "").trim() || humanizeKey(String(it?.key || "")),
      }))
      .filter(t => t.key && canSee(t.minRole, userRole));
  }, [contentList, userRole]);

  /* ── Tab state ── */
  const [tab,             setTab]             = React.useState<TabKey>("agenda");
  const [activeContentKey, setActiveContentKey] = React.useState<ContentKey>("daily_bonus_infos");
  const [busy,            setBusy]            = React.useState<string | null>(null);

  /* ── Content HTML + versions ── */
  const [contentHtml,     setContentHtml]     = React.useState<string | null>(null);
  const [contentLoading,  setContentLoading]  = React.useState(false);
  const [contentTitles,   setContentTitles]   = React.useState<Record<string, string>>({});
  const [contentVersions, setContentVersions] = React.useState<Record<string, string>>({});
  const [contentUnread,   setContentUnread]   = React.useState<Record<string, boolean>>({});

  /* ── Welcome ── */
  const [welcome,      setWelcome]      = React.useState<any | null>(null);
  const [welcomeLoad,  setWelcomeLoad]  = React.useState(false);
  const [welcomeMeta,  setWelcomeMeta]  = React.useState<{ rewarded: boolean } | null>(null);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      if (!token) return;
      try {
        const r: any = await getWelcomeState(token);
        if (!dead && r?.ok) { setWelcomeMeta({ rewarded: Boolean(r.rewarded) }); setWelcome(r); }
      } catch { if (!dead) setWelcomeMeta(null); }
    })();
    return () => { dead = true; };
  }, [token]);

  React.useEffect(() => {
    let dead = false;
    (async () => {
      if (tab !== "welcome" || !token) return;
      setWelcomeLoad(true);
      try {
        const r: any = await getWelcomeState(token);
        if (!dead) { setWelcome(r); setWelcomeMeta({ rewarded: Boolean(r?.rewarded) }); }
      } catch { if (!dead) setWelcome(null); }
      finally   { if (!dead) setWelcomeLoad(false); }
    })();
    return () => { dead = true; };
  }, [tab, token]);

  /* sync activeContentKey si tabs change */
  React.useEffect(() => {
    if (tab !== "content") return;
    if (contentTabs.some(t => t.key === activeContentKey)) return;
    const first = contentTabs[0]?.key;
    if (first) setActiveContentKey(first);
  }, [tab, contentTabs, activeContentKey]);

  /* preload versions depuis listing */
  React.useEffect(() => {
    for (const t of contentTabs) {
      const v = versionFromAnyItem(t);
      if (v) {
        setContentVersions(m => ({ ...m, [t.key]: v }));
        setContentUnread(m => ({ ...m, [t.key]: isUnread(`content:${t.key}`, v) }));
      }
      const title = String((t as any)?.title || "").trim();
      if (title) setContentTitles(m => ({ ...m, [t.key]: title }));
    }
  }, [contentTabs]);

  /* charge HTML quand onglet content */
  React.useEffect(() => {
    let dead = false;
    (async () => {
      if (tab !== "content") return;
      setContentLoading(true);
      try {
        const r: any = await publicGetContent(activeContentKey);
        const html   = r?.item?.html ? sanitizeHtmlLite(String(r.item.html)) : null;
        const item   = r?.item ?? null;
        const v      = item ? contentVersionFromItem(item) : "";
        if (v && !dead) {
          setContentVersions(m => ({ ...m, [activeContentKey]: v }));
          setContentUnread(m => ({ ...m, [activeContentKey]: isUnread(`content:${activeContentKey}`, v) }));
        }
        const title = String(r?.item?.title || "").trim();
        if (title && !dead) setContentTitles(m => ({ ...m, [activeContentKey]: title }));
        if (!dead) setContentHtml(html);
      } catch { if (!dead) setContentHtml(null); }
      finally   { if (!dead) setContentLoading(false); }
    })();
    return () => { dead = true; };
  }, [tab, activeContentKey]);

  /* mark as seen */
  React.useEffect(() => {
    if (tab !== "content") return;
    const v = contentVersions[activeContentKey];
    if (!v) return;
    setSeenVersion(`content:${activeContentKey}`, v);
    setContentUnread(m => ({ ...m, [activeContentKey]: false }));
    window.dispatchEvent(new CustomEvent("ll:content-seen", { detail: { key: activeContentKey } }));
  }, [tab, activeContentKey, contentVersions]);

  /* ── Toast ── */
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  const showToast = React.useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  React.useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);

  /* ESC */
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  /* ── Actions ── */
  async function claimToday() {
    if (!token) return;
    setBusy("today");
    try {
      const r: any = await claimDailyBonusToday(token);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      showToast(toastTextFromGranted(r?.granted));
    } catch (e: any) { showToast(String(e?.message || "Erreur")); }
    finally { setBusy(null); }
  }

  async function claimMilestone(m: 5 | 10 | 20 | 30) {
    if (!token) return;
    setBusy(`m${m}`);
    try {
      const r: any = await claimDailyBonusMilestone(token, m);
      if (r?.state?.ok) onState(r.state);
      await refreshMe();
      showToast(r?.granted?.length ? toastTextFromGranted(r.granted) : `Palier ${m} j récupéré ✅`);
    } catch (e: any) { showToast(String(e?.message || "Erreur")); }
    finally { setBusy(null); }
  }

  const activeContentLabel = React.useMemo(() => {
    const found = contentTabs.find(t => t.key === activeContentKey);
    return contentTitles[activeContentKey] || found?.fallbackLabel || humanizeKey(activeContentKey);
  }, [activeContentKey, contentTabs, contentTitles]);

  const showWelcomeTab = !welcomeMeta?.rewarded;

  /* ── Render ── */
  return createPortal(
    <div
      className="dba-modal-backdrop"
      role="presentation"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {toast && <div className="dba-toast">{toast}</div>}

      <div className="dba-modal" role="dialog" aria-modal="true" aria-label="Bonus quotidien">

        {/* ── Sidebar ── */}
        <aside className="dba-sidebar">
          <div className="dba-sidebar-top">
            <span className="dba-sidebar-title">Daily Bonus</span>
            <button
              className="dba-close"
              type="button"
              aria-label="Fermer"
              onClick={onClose}
            >✕</button>
          </div>

          <nav className="dba-nav">
            <button
              type="button"
              className={`dba-nav-btn${tab === "agenda" ? " is-active" : ""}`}
              onClick={() => setTab("agenda")}
            >
              📅 Bonus quotidien
            </button>

            {showWelcomeTab && (
              <button
                type="button"
                className={`dba-nav-btn${tab === "welcome" ? " is-active" : ""}`}
                onClick={() => setTab("welcome")}
              >
                🎯 Bienvenue
              </button>
            )}

            {contentTabs.map(t => {
              const label   = contentTitles[t.key] || t.fallbackLabel;
              const active  = tab === "content" && activeContentKey === t.key;
              const unread  = Boolean(contentUnread[t.key]);
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`dba-nav-btn${active ? " is-active" : ""}`}
                  onClick={() => { setActiveContentKey(t.key); setTab("content"); }}
                >
                  <span>{label}</span>
                  <UnreadBadge show={unread} title="Nouveautés" />
                </button>
              );
            })}

            <button type="button" className="dba-nav-btn is-soon" disabled>
              🎉 Événements
            </button>
          </nav>

          <div className="dba-meta">
            Aujourd'hui&nbsp;: <strong>{state.day}</strong><br />
            Jours ce mois&nbsp;: <strong>{state.monthClaimedDays}</strong><br />
            Tickets roue&nbsp;: <strong>{wheelTickets}</strong><br />
            Prestige&nbsp;: <strong>{prestigeTokens}</strong><br />
            Premium&nbsp;: <strong>{premiumActive ? "actif" : "—"}</strong>
          </div>
        </aside>

        {/* ── Body ── */}
        <div className="dba-body">

          {/* ══ AGENDA ══ */}
          {tab === "agenda" && (
            <>
              <div className="dba-section-head">
                <span className="dba-section-title">Agenda hebdo</span>
                {premiumActive ? (
                  <div className="dba-premium-pill" title="Récompenses doublées">
                    ★ {premiumLabel}
                    <span className="x2-badge">×2</span>
                  </div>
                ) : null}
              </div>

              <div className="dba-week-grid">
                {week.map((d: any) => {
                  const claimable = d.status === "today_claimable" && !busy;
                  const statusMap: Record<string, string> = {
                    claimed: "is-ok", today_claimed: "is-ok",
                    missed: "is-bad",
                    today_claimable: "is-cta",
                  };
                  const statusKind = statusMap[d.status] ?? "";
                  const statusText: Record<string, string> = {
                    today_claimable: busy === "today" ? "Récupération…" : "À récupérer",
                    today_claimed: "Déjà récupéré", claimed: "Récupéré",
                    missed: "Manqué", future: "À venir",
                  };

                  return (
                    <div
                      key={d.date}
                      role={claimable ? "button" : undefined}
                      tabIndex={claimable ? 0 : -1}
                      className={[
                        "dba-day",
                        claimable ? "is-claimable" : "",
                        d.status === "missed" ? "is-missed" :
                          (d.status === "future" || d.status === "claimed" || d.status === "today_claimed") ? "is-dim" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => { if (claimable) claimToday(); }}
                      onKeyDown={e => {
                        if (!claimable) return;
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); claimToday(); }
                      }}
                    >
                      {premiumActive && (
                        <div className="dba-prem-star" aria-hidden>★</div>
                      )}
                      <div className="dba-day-top">
                        <span className="dba-day-label">{d.label}</span>
                        <span className="dba-day-mark">{dayBadge(d.status)}</span>
                      </div>
                      <div className="dba-day-reward">
                        {rewardLabel(d.reward)}
                        {premiumActive && <span className="dba-x2-chip">×2</span>}
                      </div>
                      <div className="dba-day-date">{d.date}</div>
                      <div className={`dba-status ${statusKind}`}>
                        {statusText[d.status] ?? "À venir"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Milestones */}
              <div className="dba-panel">
                <div className="dba-panel-title">Paliers du mois</div>
                <div className="dba-milestones">
                  {milestones.map((m: any) => {
                    const isClaimable = m.status === "claimable" && !busy;
                    const cls =
                      m.status === "locked" ? "is-locked"
                      : m.status === "claimed" ? "is-claimed"
                      : "is-claimable";
                    const icon = m.status === "claimed" ? "✓" : m.status === "claimable" ? (busy === `m${m.milestone}` ? "…" : "★") : "🔒";
                    return (
                      <div
                        key={m.milestone}
                        role={isClaimable ? "button" : undefined}
                        tabIndex={isClaimable ? 0 : -1}
                        className={`dba-milestone ${cls}`}
                        onClick={() => { if (isClaimable) claimMilestone(m.milestone); }}
                        onKeyDown={e => {
                          if (!isClaimable) return;
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); claimMilestone(m.milestone); }
                        }}
                      >
                        {m.milestone} jours <span style={{ opacity: 0.80 }}>{icon}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="dba-milestone-hint">
                  • 20 j = Skin unique (sinon +20 rubis)<br />
                  • 30 j = Titre unique (sinon +1 jeton prestige)
                </div>
              </div>
            </>
          )}

          {/* ══ CONTENT ══ */}
          {tab === "content" && (
            <>
              <div className="dba-section-head">
                <span className="dba-section-title">{activeContentLabel}</span>
                {premiumActive && (
                  <div className="dba-premium-pill">
                    ★ {premiumLabel} <span className="x2-badge">×2</span>
                  </div>
                )}
              </div>
              <div className="dba-panel">
                {contentLoading ? (
                  <div className="dba-section-sub" style={{ opacity: 0.70 }}>Chargement…</div>
                ) : contentHtml ? (
                  <div
                    className="dba-content-html"
                    dangerouslySetInnerHTML={{ __html: contentHtml }}
                  />
                ) : (
                  <div className="dba-section-sub" style={{ opacity: 0.70 }}>Contenu indisponible.</div>
                )}
              </div>
            </>
          )}

          {/* ══ WELCOME ══ */}
          {tab === "welcome" && (
            <>
              <div className="dba-section-head">
                <span className="dba-section-title">Quêtes de bienvenue</span>
                <span className="dba-section-sub">Complète tout pour débloquer tes récompenses</span>
              </div>
              <div className="dba-panel">
                {welcomeLoad ? (
                  <div className="dba-section-sub" style={{ opacity: 0.70 }}>Chargement…</div>
                ) : !welcome?.ok ? (
                  <div className="dba-section-sub" style={{ opacity: 0.70 }}>Indisponible.</div>
                ) : (() => {
                  const g = welcome.goals || {};
                  const items = [
                    { key: "follow",  label: "Suivre 1 streamer",            have: g.follow?.have  ?? 0, need: g.follow?.need  ?? 1  },
                    { key: "daily3",  label: "Récupérer 3 bonus quotidiens", have: g.daily3?.have  ?? 0, need: g.daily3?.need  ?? 3  },
                    { key: "calls2",  label: "Faire 2 calls",                have: g.calls2?.have  ?? 0, need: g.calls2?.need  ?? 2  },
                    { key: "wheel1",  label: "Tourner la roue 1 fois",       have: g.wheel1?.have  ?? 0, need: g.wheel1?.need  ?? 1  },
                    { key: "watch60", label: "Regarder 60 minutes",          have: g.watch60?.have ?? 0, need: g.watch60?.need ?? 60 },
                  ];
                  return (
                    <>
                      <div className="dba-quest-list">
                        {items.map(it => {
                          const done = Number(it.have) >= Number(it.need);
                          return (
                            <div key={it.key} className={`dba-quest${done ? " is-done" : ""}`}>
                              <span>{it.label}</span>
                              {done
                                ? <span className="dba-quest-check">✓</span>
                                : <span className="dba-quest-progress">{it.have}/{it.need}</span>
                              }
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14, gap: 8 }}>
                        <button
                          className="dba-claim-btn"
                          disabled={!welcome?.completed || !!busy}
                          onClick={async () => {
                            if (!token) return;
                            setBusy("welcome_claim");
                            try {
                              await claimWelcome(token);
                              showToast("Récompenses de bienvenue récupérées ✅");
                              await refreshMe();
                              const s: any = await getWelcomeState(token);
                              setWelcome(s);
                              setWelcomeMeta({ rewarded: Boolean(s?.rewarded) });
                              if (s?.rewarded) setTab("agenda");
                            } catch (e: any) { showToast(String(e?.message || "Erreur")); }
                            finally { setBusy(null); }
                          }}
                          title={!welcome?.completed ? "Complète toutes les quêtes" : "Récupérer"}
                        >
                          {busy === "welcome_claim" ? "Récupération…" : "Récupérer"}
                        </button>
                      </div>
                      <div className="dba-milestone-hint" style={{ marginTop: 10 }}>
                        Récompenses : <strong style={{ color: "rgba(200,195,240,0.85)" }}>+50 rubis</strong> et <strong style={{ color: "rgba(200,195,240,0.85)" }}>7 jours Viewer</strong>.
                      </div>
                    </>
                  );
                })()}
              </div>
            </>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}