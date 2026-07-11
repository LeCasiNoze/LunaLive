// web/src/components/DailyBonusAgendaModal.tsx
// ══════════════════════════════════════════════════════════════
//  PURPLE VELVET — DailyBonusAgendaModal
//  Refonte UX : hiérarchie claire, sections séparées, états visuels
// ══════════════════════════════════════════════════════════════
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
  if (v === "admin") return 3;
  if (v === "streamer") return 2;
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
    if (g.type === "rubis") { rubis += Number(g.amount); continue; }
    if (g.type === "token") {
      if (g.token === "wheel_ticket") wheel += Number(g.amount);
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

/* ─── CSS Purple Velvet ──────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@500;700;800&display=swap');

@keyframes dba-fade-in   { from { opacity:0; } to { opacity:1; } }
@keyframes dba-slide-up  { from { opacity:0; transform:translateY(20px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes dba-shimmer   { 0%,100% { background-position:0% 50%; } 50% { background-position:100% 50%; } }
@keyframes dba-toast-in  { from { opacity:0; transform:translateX(-50%) translateY(-10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
@keyframes dba-pulse-cta { 0%,100% { box-shadow:0 0 0 0 rgba(124,92,252,0); } 50% { box-shadow:0 0 0 8px rgba(124,92,252,.16); } }

/* ── Backdrop ── */
.dba-backdrop {
  position:fixed; inset:0; z-index:2147483647;
  display:grid; place-items:center; padding:20px;
  background:rgba(4,3,10,.84);
  backdrop-filter:blur(22px);
  animation:dba-fade-in 200ms ease;
}

/* ── Toast ── */
.dba-toast {
  position:fixed; top:20px; left:50%;
  transform:translateX(-50%);
  z-index:2147483647;
  padding:11px 20px; border-radius:999px;
  background:rgba(11,9,22,.97);
  border:1px solid rgba(124,92,252,.32);
  box-shadow:0 20px 60px rgba(0,0,0,.60), 0 0 22px rgba(124,92,252,.16);
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px;
  color:rgba(235,232,255,.94);
  white-space:nowrap;
  animation:dba-toast-in 230ms cubic-bezier(.22,1,.36,1);
}

/* ── Dialog principal ── */
.dba-dialog {
  position:relative;
  width:min(1000px,96vw); height:min(800px,90vh);
  display:grid; grid-template-columns:260px 1fr;
  border-radius:22px;
  border:1px solid rgba(124,92,252,.22);
  background:rgba(9,7,20,.97);
  box-shadow:0 40px 100px rgba(0,0,0,.75), 0 0 80px rgba(124,92,252,.10);
  backdrop-filter:blur(24px);
  overflow:hidden;
  animation:dba-slide-up 260ms cubic-bezier(.22,1,.36,1);
}

/* Reflet haut signature */
.dba-dialog::before {
  content:"";
  position:absolute; top:0; left:6%; right:6%; height:1px;
  pointer-events:none; z-index:3;
  background:linear-gradient(90deg,transparent,rgba(167,139,250,.45) 35%,rgba(91,142,248,.32) 65%,transparent);
}

/* Lueur ambiante coin */
.dba-dialog::after {
  content:"";
  position:absolute; top:-60px; left:-60px;
  width:340px; height:220px; border-radius:50%;
  background:radial-gradient(ellipse,rgba(124,92,252,.12),transparent 70%);
  pointer-events:none;
}

@media (max-width:800px) {
  .dba-dialog { grid-template-columns:1fr; height:92vh; }
}

/* ── Sidebar ── */
.dba-sidebar {
  position:relative; z-index:1;
  display:flex; flex-direction:column; gap:0;
  border-right:1px solid rgba(124,92,252,.12);
  background:rgba(255,255,255,.012);
  overflow:hidden;
}

.dba-sidebar-head {
  padding:18px 16px 14px;
  border-bottom:1px solid rgba(124,92,252,.10);
  display:flex; align-items:center; justify-content:space-between; gap:10px;
  flex-shrink:0;
}

.dba-sidebar-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:16px; letter-spacing:-.3px;
  background:linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 40%,#5b8ef8 70%,#93c5fd 100%);
  background-size:220% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 8px rgba(124,92,252,.35));
  animation:dba-shimmer 5s ease-in-out infinite;
}

.dba-close-btn {
  width:32px; height:32px; border-radius:10px;
  border:1px solid rgba(124,92,252,.18);
  background:rgba(255,255,255,.04);
  color:rgba(200,195,240,.65);
  cursor:pointer; display:grid; place-items:center;
  font-size:14px; outline:none;
  -webkit-tap-highlight-color:transparent;
  transition:all 150ms ease;
}

.dba-close-btn:hover {
  background:rgba(124,92,252,.14);
  border-color:rgba(124,92,252,.36);
  color:rgba(235,232,255,.90);
  transform:scale(1.06);
}

.dba-sidebar-nav {
  flex:1; overflow-y:auto; padding:12px;
  display:flex; flex-direction:column; gap:6px;
  -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
}
.dba-sidebar-nav::-webkit-scrollbar { display:none; }

.dba-nav-item {
  width:100%; text-align:left;
  padding:10px 12px; border-radius:14px;
  border:1px solid rgba(124,92,252,.10);
  background:rgba(124,92,252,.05);
  color:rgba(200,195,240,.72);
  cursor:pointer;
  font-family:'Syne',system-ui,sans-serif;
  font-size:13px; font-weight:700;
  outline:none; -webkit-tap-highlight-color:transparent;
  display:inline-flex; align-items:center; gap:8px;
  transition:all 150ms ease;
}

.dba-nav-item:hover {
  background:rgba(124,92,252,.12);
  border-color:rgba(124,92,252,.24);
  color:rgba(235,232,255,.90);
  transform:translateX(2px);
}

.dba-nav-item.active {
  border-color:rgba(124,92,252,.40);
  background:linear-gradient(90deg,rgba(124,92,252,.22),rgba(59,77,200,.16),rgba(91,142,248,.14));
  color:rgba(235,232,255,.96);
  box-shadow:0 4px 16px rgba(0,0,0,.24), 0 0 0 1px rgba(124,92,252,.10) inset;
}

.dba-nav-item.disabled {
  opacity:.40; cursor:not-allowed;
}

.dba-sidebar-meta {
  padding:14px 14px 16px;
  border-top:1px solid rgba(124,92,252,.08);
  flex-shrink:0;
}

.dba-meta-card {
  padding:12px; border-radius:14px;
  border:1px solid rgba(124,92,252,.10);
  background:rgba(0,0,0,.22);
}

.dba-meta-row {
  display:flex; align-items:center; justify-content:space-between;
  padding:4px 0;
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px;
}

.dba-meta-label { color:rgba(167,155,220,.52); font-weight:600; }
.dba-meta-value { color:rgba(200,195,240,.80); font-weight:800; }

/* ── Body principal ── */
.dba-body {
  position:relative; z-index:1;
  padding:20px 22px 24px;
  overflow-y:auto; min-height:0;
  -webkit-overflow-scrolling:touch;
  scrollbar-width:thin;
  scrollbar-color:rgba(124,92,252,.20) transparent;
}
.dba-body::-webkit-scrollbar { width:4px; }
.dba-body::-webkit-scrollbar-track { background:transparent; }
.dba-body::-webkit-scrollbar-thumb { background:rgba(124,92,252,.20); border-radius:4px; }

/* Section header */
.dba-section-head {
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; flex-wrap:wrap; margin-bottom:18px;
}

.dba-section-title {
  font-family:'Syne',system-ui,sans-serif;
  font-weight:800; font-size:18px; letter-spacing:-.4px;
  background:linear-gradient(105deg,#c4b5fd 0%,#7c5cfc 40%,#5b8ef8 70%,#93c5fd 100%);
  background-size:220% 100%;
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 8px rgba(124,92,252,.28));
  animation:dba-shimmer 5s ease-in-out infinite;
}

.dba-section-sub {
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:600;
  color:rgba(167,155,220,.50);
}

/* Premium pill */
.dba-prem-pill {
  display:inline-flex; align-items:center; gap:8px;
  padding:7px 14px; border-radius:999px;
  border:1px solid rgba(251,191,36,.32);
  background:rgba(251,191,36,.10);
  font-family:'Syne',system-ui,sans-serif;
  font-size:12px; font-weight:800;
  color:#fde68a;
  box-shadow:0 0 18px rgba(251,191,36,.12);
}
.dba-prem-pill .x2 {
  padding:2px 8px; border-radius:999px;
  border:1px solid rgba(251,191,36,.28);
  background:rgba(0,0,0,.22); font-size:11px;
}

/* ── Grille semaine ── */
.dba-week-grid {
  display:grid; gap:10px;
  grid-template-columns:repeat(4,1fr);
}
@media (max-width:900px) { .dba-week-grid { grid-template-columns:repeat(3,1fr); } }
@media (max-width:640px) { .dba-week-grid { grid-template-columns:repeat(2,1fr); } }

/* ── Carte jour ── */
.dba-day-card {
  position:relative;
  padding:14px; border-radius:16px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(255,255,255,.025);
  cursor:default; user-select:none;
  transition:all 160ms ease;
}
.dba-day-card.claimable {
  cursor:pointer;
  border-color:rgba(124,92,252,.30);
  background:rgba(124,92,252,.08);
  animation:dba-pulse-cta 2.4s ease-in-out infinite;
}
.dba-day-card.claimable:hover {
  transform:translateY(-3px);
  border-color:rgba(167,139,250,.55);
  background:rgba(124,92,252,.16);
  box-shadow:0 16px 44px rgba(0,0,0,.42), 0 0 24px rgba(124,92,252,.20);
  animation:none;
}
.dba-day-card.dimmed  { opacity:.60; }
.dba-day-card.missed  { opacity:.38; filter:grayscale(.85); }

.dba-day-header {
  display:flex; justify-content:space-between; align-items:center; gap:8px;
}
.dba-day-label {
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:12px;
  color:rgba(200,195,240,.85);
}
.dba-day-mark {
  font-family:'Syne',system-ui,sans-serif; font-weight:700; font-size:13px;
  opacity:.72;
}
.dba-day-reward {
  margin-top:10px;
  font-family:'Syne',system-ui,sans-serif; font-weight:800; font-size:18px;
  letter-spacing:-.3px;
  display:flex; align-items:center; gap:8px;
}
.dba-x2-chip {
  padding:2px 8px; border-radius:999px;
  border:1px solid rgba(124,92,252,.30);
  background:rgba(124,92,252,.14);
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:700; color:#c4b5fd;
}
.dba-day-date {
  margin-top:6px;
  font-family:'Syne',system-ui,sans-serif; font-size:11px;
  color:rgba(167,155,220,.45);
}
.dba-day-prem-star {
  position:absolute; top:10px; right:10px;
  width:22px; height:22px; border-radius:50%;
  border:1px solid rgba(251,191,36,.38);
  background:rgba(251,191,36,.14);
  display:grid; place-items:center;
  font-size:11px; pointer-events:none;
}

/* Status pill */
.dba-status-pill {
  margin-top:10px;
  display:inline-flex; align-items:center; gap:6px;
  padding:5px 10px; border-radius:999px;
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:700;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(0,0,0,.18);
  color:rgba(167,155,220,.60);
}
.dba-status-pill.ok   { border-color:rgba(52,211,153,.30); background:rgba(52,211,153,.10); color:rgba(167,243,208,.90); }
.dba-status-pill.bad  { border-color:rgba(239,68,68,.28); background:rgba(239,68,68,.10); color:rgba(252,165,165,.90); }
.dba-status-pill.cta  { border-color:rgba(124,92,252,.45); background:rgba(124,92,252,.18); color:rgba(235,232,255,.96); box-shadow:0 0 12px rgba(124,92,252,.16); }

/* ── Section card ── */
.dba-section-card {
  margin-top:16px; padding:16px; border-radius:16px;
  border:1px solid rgba(124,92,252,.10);
  background:rgba(0,0,0,.18);
}

.dba-card-label {
  font-family:'Syne',system-ui,sans-serif;
  font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase;
  color:rgba(167,155,220,.45); margin-bottom:12px;
}

/* ── Milestones ── */
.dba-milestones { display:flex; flex-wrap:wrap; gap:8px; }

.dba-milestone {
  display:inline-flex; align-items:center; gap:8px;
  padding:10px 16px; border-radius:999px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(0,0,0,.20);
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700;
  color:rgba(200,195,240,.75);
  cursor:default; user-select:none;
  transition:all 150ms ease;
}
.dba-milestone.locked  { opacity:.40; filter:grayscale(.70); }
.dba-milestone.claimed { opacity:.62; }
.dba-milestone.claimable {
  cursor:pointer;
  border-color:rgba(124,92,252,.34);
  background:rgba(124,92,252,.12);
  color:rgba(235,232,255,.94);
}
.dba-milestone.claimable:hover {
  border-color:rgba(167,139,250,.58);
  background:rgba(124,92,252,.20);
  transform:translateY(-2px);
  box-shadow:0 10px 28px rgba(0,0,0,.36), 0 0 16px rgba(124,92,252,.20);
}

.dba-milestone-hint {
  margin-top:12px;
  font-family:'Syne',system-ui,sans-serif; font-size:11px; font-weight:600;
  color:rgba(167,155,220,.45); line-height:1.7;
}

/* ── Content HTML ── */
.dba-html {
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:500;
  color:rgba(200,195,240,.82); line-height:1.75;
}
.dba-html h1,.dba-html h2,.dba-html h3 { font-weight:800; color:rgba(235,232,255,.94); margin:14px 0 6px; }
.dba-html a { color:#a78bfa; text-decoration:underline; }
.dba-html strong { color:rgba(235,232,255,.90); font-weight:700; }
.dba-html code { background:rgba(124,92,252,.12); border-radius:6px; padding:1px 6px; font-size:12px; }

/* ── Quest list ── */
.dba-quest-list { display:grid; gap:8px; }

.dba-quest {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:12px 14px; border-radius:14px;
  border:1px solid rgba(124,92,252,.12);
  background:rgba(0,0,0,.16);
  font-family:'Syne',system-ui,sans-serif; font-size:13px; font-weight:700;
  color:rgba(200,195,240,.82);
  transition:border-color 140ms;
}
.dba-quest.done {
  border-color:rgba(52,211,153,.24);
  background:rgba(52,211,153,.08);
  color:rgba(167,243,208,.88);
}
.dba-quest-progress {
  font-size:11px; color:rgba(167,155,220,.55); flex-shrink:0;
}
.dba-quest-check { font-size:16px; flex-shrink:0; }

/* ── Claim button ── */
.dba-claim-btn {
  position:relative;
  padding:12px 24px; border-radius:14px;
  border:1px solid rgba(124,92,252,.40);
  background:linear-gradient(135deg,rgba(124,92,252,.38),rgba(59,77,200,.26),rgba(91,142,248,.18));
  color:rgba(235,232,255,.96);
  cursor:pointer;
  font-family:'Syne',system-ui,sans-serif; font-size:14px; font-weight:800;
  letter-spacing:-.15px;
  box-shadow:0 8px 28px rgba(0,0,0,.32), 0 0 0 1px rgba(124,92,252,.12) inset;
  outline:none; -webkit-tap-highlight-color:transparent;
  transition:all 150ms ease;
}
.dba-claim-btn::before {
  content:"";
  position:absolute; top:0; left:14%; right:14%; height:1px;
  background:linear-gradient(90deg,transparent,rgba(200,180,255,.42),transparent);
  pointer-events:none;
}
.dba-claim-btn:hover:not(:disabled) {
  filter:brightness(1.14);
  border-color:rgba(167,139,250,.62);
  box-shadow:0 16px 42px rgba(0,0,0,.44), 0 0 28px rgba(124,92,252,.26);
  transform:translateY(-2px);
}
.dba-claim-btn:active:not(:disabled) { transform:translateY(0); filter:brightness(.96); }
.dba-claim-btn:disabled { opacity:.34; cursor:not-allowed; }

@media (prefers-reduced-motion:reduce) {
  .dba-day-card.claimable { animation:none; }
  .dba-day-card:hover,.dba-milestone:hover { transform:none !important; }
}

/* Creator-grade layout: compact, lisible et orienté action. */
.dba-backdrop { padding:28px;background:rgba(3,2,9,.88); }
.dba-dialog { width:min(1120px,96vw);height:min(720px,90vh);grid-template-columns:224px minmax(0,1fr);border-radius:28px;border-color:rgba(167,139,250,.25);background:#090711;box-shadow:0 45px 130px rgba(0,0,0,.82),0 0 0 1px rgba(255,255,255,.025) inset; }
.dba-dialog::after { top:-120px;left:-90px;width:520px;height:360px;background:radial-gradient(circle,rgba(124,92,252,.19),transparent 70%); }
.dba-sidebar { padding:18px 12px 14px;border-right:1px solid rgba(255,255,255,.065);background:linear-gradient(180deg,rgba(25,18,48,.68),rgba(9,7,17,.9) 42%); }
.dba-sidebar-head { padding:2px 8px 18px; }.dba-sidebar-title { color:#f3efff;font-size:15px;letter-spacing:-.02em;background:none;-webkit-text-fill-color:initial; }.dba-close-btn { position:fixed;top:calc(5vh + 18px);right:calc(2vw + 18px);z-index:5;width:38px;height:38px;border-radius:12px; }
.dba-sidebar-nav { gap:5px; }.dba-nav-item { min-height:43px;padding:0 12px;border:1px solid transparent;border-radius:12px;color:rgba(190,183,211,.62);background:transparent;font-size:11px; }.dba-nav-item:hover { color:#eee9fa;background:rgba(255,255,255,.035); }.dba-nav-item.active { color:#fff;border-color:rgba(139,92,246,.3);background:linear-gradient(90deg,rgba(124,92,252,.23),rgba(124,92,252,.07));box-shadow:none; }
.dba-sidebar-meta { padding:14px 4px 2px; }.dba-meta-card { padding:13px;border-color:rgba(255,255,255,.07);border-radius:15px;background:rgba(0,0,0,.18); }.dba-meta-row { font-size:9px; }.dba-meta-value { color:#d9d3e6; }
.dba-body { padding:30px 32px; }.dba-section-head { min-height:50px;margin-bottom:18px;padding-right:45px; }.dba-section-title { color:#faf8ff;font-size:22px;background:none;-webkit-text-fill-color:initial;letter-spacing:-.035em; }.dba-section-sub { color:#777083; }
.dba-week-grid { grid-template-columns:repeat(7,minmax(0,1fr));gap:8px; }.dba-day-card { min-height:154px;padding:14px 12px;border-color:rgba(255,255,255,.075);border-radius:17px;background:linear-gradient(160deg,rgba(255,255,255,.04),rgba(255,255,255,.012)); }.dba-day-card.dimmed { opacity:.62; }.dba-day-card.claimable { border-color:rgba(139,92,246,.55);background:radial-gradient(circle at 20% 0%,rgba(139,92,246,.27),transparent 65%),rgba(139,92,246,.08);box-shadow:0 14px 35px rgba(76,29,149,.22); }.dba-day-label { color:#aaa3b8;font-size:9px;letter-spacing:.08em;text-transform:uppercase; }.dba-day-reward { margin-top:19px;color:#f0ecf8;font-size:18px; }.dba-day-date { color:#5f5969;font-size:8px; }.dba-status-pill { margin-top:auto;padding:6px 8px;font-size:8px; }
.dba-section-card { margin-top:18px;padding:18px;border-color:rgba(255,255,255,.07);border-radius:18px;background:rgba(255,255,255,.018); }.dba-card-label { color:#837c91;font-size:9px;letter-spacing:.14em; }.dba-milestones { margin-top:13px;gap:8px; }.dba-milestone { min-width:104px;padding:10px 13px;border-radius:12px; }.dba-milestone-hint { color:#666073;font-size:9px; }
.dba-quest { padding:14px;border-color:rgba(255,255,255,.075);background:rgba(255,255,255,.018); }
@media(max-width:900px){.dba-dialog{grid-template-columns:190px 1fr}.dba-body{padding:24px 20px}.dba-week-grid{grid-template-columns:repeat(4,1fr)}.dba-day-card{min-height:135px}}
`;

/* ─── Composant wrapper mobile/desktop ───────────────────────────── */
export function DailyBonusAgendaModal({
  state, onClose, onState,
}: {
  state: DailyBonusState; onClose: () => void; onState: (s: DailyBonusState) => void;
}) {
  const isMobile = useIsMobile();
  if (isMobile) return <DailyBonusAgendaModalMobile state={state} onClose={onClose} onState={onState} />;
  return <DailyBonusAgendaModalDesktop state={state} onClose={onClose} onState={onState} />;
}

/* ─── Desktop modal ──────────────────────────────────────────────── */
function DailyBonusAgendaModalDesktop({
  state, onClose, onState,
}: {
  state: DailyBonusState; onClose: () => void; onState: (s: DailyBonusState) => void;
}) {
  useInjectStyles("dba-styles-v2", CSS);
  const auth         = useAuth() as any;
  const token        = auth?.token ?? null;
  const refreshMe    = auth?.refreshMe ?? (async () => {});
  const userRole: Role = String(auth?.user?.role || "viewer").toLowerCase() as any;
  const tokensAny    = (state as any)?.tokens ?? {};
  const wheelTickets = Number(tokensAny?.wheel_ticket ?? 0);
  const prestigeTok  = Number(tokensAny?.prestige_token ?? 0);
  const week         = Array.isArray(state?.week)       ? state.week       : [];
  const milestones   = Array.isArray(state?.milestones) ? state.milestones : [];
  const premiumActive = Boolean(state?.premiumActive ?? state?.premium?.active ?? false);
  const premiumLabel  = String(state?.premium?.label ?? "").trim() || "Abonnement actif";

  /* ── Content tabs ── */
  const [contentList, setContentList] = React.useState<ApiPublicContentTab[]>([]);
  React.useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r: any = await publicListContentTabs();
        if (!dead) setContentList(Array.isArray(r?.items) ? r.items as ApiPublicContentTab[] : []);
      } catch { if (!dead) setContentList([]); }
    })();
    return () => { dead = true; };
  }, []);

  const contentTabs = React.useMemo(() => {
    return (contentList || [])
      .map((it: any) => ({
        key:           String(it?.key || "").trim(),
        minRole:       String(it?.min_role || "viewer").toLowerCase() as Role,
        title:         String(it?.title || "").trim(),
        updated_at:    it?.updated_at ?? null,
        fallbackLabel: String(it?.title || "").trim() || humanizeKey(String(it?.key || "")),
      }))
      .filter(t => t.key && canSee(t.minRole, userRole));
  }, [contentList, userRole]);

  /* ── Tab state ── */
  const [tab,              setTab]             = React.useState<TabKey>("agenda");
  const [activeContentKey, setActiveContentKey] = React.useState<ContentKey>("daily_bonus_infos");
  const [busy,             setBusy]            = React.useState<string | null>(null);

  /* ── Content HTML + versions ── */
  const [contentHtml,     setContentHtml]     = React.useState<string | null>(null);
  const [contentLoading,  setContentLoading]  = React.useState(false);
  const [contentTitles,   setContentTitles]   = React.useState<Record<string, string>>({});
  const [contentVersions, setContentVersions] = React.useState<Record<string, string>>({});
  const [contentUnread,   setContentUnread]   = React.useState<Record<string, boolean>>({});

  /* ── Welcome ── */
  const [welcome,     setWelcome]     = React.useState<any | null>(null);
  const [welcomeLoad, setWelcomeLoad] = React.useState(false);
  const [welcomeMeta, setWelcomeMeta] = React.useState<{ rewarded: boolean } | null>(null);

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

  React.useEffect(() => {
    if (tab !== "content") return;
    if (contentTabs.some(t => t.key === activeContentKey)) return;
    const first = contentTabs[0]?.key;
    if (first) setActiveContentKey(first);
  }, [tab, contentTabs, activeContentKey]);

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

  React.useEffect(() => {
    let dead = false;
    (async () => {
      if (tab !== "content") return;
      setContentLoading(true);
      try {
        const r: any   = await publicGetContent(activeContentKey);
        const html      = r?.item?.html ? sanitizeHtmlLite(String(r.item.html)) : null;
        const item      = r?.item ?? null;
        const v         = item ? contentVersionFromItem(item) : "";
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

  /* Helpers status */
  function statusClass(status: WeekDay["status"]) {
    if (status === "claimed" || status === "today_claimed") return "ok";
    if (status === "missed") return "bad";
    if (status === "today_claimable") return "cta";
    return "";
  }
  function statusText(status: WeekDay["status"]) {
    const map: Record<string, string> = {
      today_claimable: busy === "today" ? "Récupération…" : "À récupérer",
      today_claimed: "Déjà récupéré",
      claimed: "Récupéré",
      missed: "Manqué",
      future: "À venir",
    };
    return map[status] ?? "À venir";
  }
  function dayCardClass(d: WeekDay) {
    const base = "dba-day-card";
    if (d.status === "today_claimable" && !busy) return `${base} claimable`;
    if (d.status === "missed") return `${base} missed`;
    if (d.status === "future" || d.status === "claimed" || d.status === "today_claimed") return `${base} dimmed`;
    return base;
  }

  /* ── Render ── */
  return createPortal(
    <div className="dba-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {toast ? <div className="dba-toast">{toast}</div> : null}

      <div className="dba-dialog" role="dialog" aria-modal="true" aria-label="Bonus quotidien">

        {/* ── Sidebar ── */}
        <aside className="dba-sidebar">
          <div className="dba-sidebar-head">
            <span className="dba-sidebar-title">Daily Bonus</span>
            <button className="dba-close-btn" type="button" aria-label="Fermer" onClick={onClose}>✕</button>
          </div>

          <nav className="dba-sidebar-nav">
            <button type="button" className={`dba-nav-item${tab === "agenda" ? " active" : ""}`} onClick={() => setTab("agenda")}>
              📅 Bonus quotidien
            </button>
            {showWelcomeTab ? (
              <button type="button" className={`dba-nav-item${tab === "welcome" ? " active" : ""}`} onClick={() => setTab("welcome")}>
                🎯 Bienvenue
              </button>
            ) : null}
            {contentTabs.map(t => {
              const label  = contentTitles[t.key] || t.fallbackLabel;
              const active = tab === "content" && activeContentKey === t.key;
              const unread = Boolean(contentUnread[t.key]);
              return (
                <button key={t.key} type="button"
                  className={`dba-nav-item${active ? " active" : ""}`}
                  onClick={() => { setActiveContentKey(t.key); setTab("content"); }}>
                  <span>{label}</span>
                  <UnreadBadge show={unread} title="Nouveautés" />
                </button>
              );
            })}
            <button type="button" className="dba-nav-item disabled" disabled>
              🎉 Événements
            </button>
          </nav>

          <div className="dba-sidebar-meta">
            <div className="dba-meta-card">
              {[
                ["📅 Aujourd'hui", state.day],
                ["📆 Jours ce mois", String(state.monthClaimedDays)],
                ["🎡 Tickets roue", String(wheelTickets)],
                ["✨ Prestige", String(prestigeTok)],
                ["⭐ Premium", premiumActive ? premiumLabel : "—"],
              ].map(([label, value]) => (
                <div key={label} className="dba-meta-row">
                  <span className="dba-meta-label">{label}</span>
                  <span className="dba-meta-value">{value}</span>
                </div>
              ))}
            </div>
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
                  <div className="dba-prem-pill" title="Récompenses doublées">
                    ★ {premiumLabel} <span className="x2">×2</span>
                  </div>
                ) : null}
              </div>

              <div className="dba-week-grid">
                {week.map((d) => {
                  const claimable = d.status === "today_claimable" && !busy;
                  const sc = statusClass(d.status);
                  return (
                    <div key={d.date}
                      role={claimable ? "button" : undefined}
                      tabIndex={claimable ? 0 : -1}
                      className={dayCardClass(d)}
                      onClick={() => { if (claimable) claimToday(); }}
                      onKeyDown={e => { if (!claimable) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); claimToday(); } }}>

                      {premiumActive ? <div className="dba-day-prem-star" aria-hidden>★</div> : null}

                      <div className="dba-day-header">
                        <span className="dba-day-label">{d.label}</span>
                        <span className="dba-day-mark">{dayBadge(d.status)}</span>
                      </div>

                      <div className="dba-day-reward">
                        {rewardLabel(d.reward)}
                        {premiumActive ? <span className="dba-x2-chip">×2</span> : null}
                      </div>

                      <div className="dba-day-date">{d.date}</div>

                      <div className={`dba-status-pill${sc ? " " + sc : ""}`}>
                        {statusText(d.status)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Milestones */}
              <div className="dba-section-card">
                <div className="dba-card-label">Paliers du mois</div>
                <div className="dba-milestones">
                  {milestones.map((m) => {
                    const isClaimable = m.status === "claimable" && !busy;
                    const cls = m.status === "locked" ? "locked" : m.status === "claimed" ? "claimed" : "claimable";
                    const icon = m.status === "claimed" ? "✓" : m.status === "claimable" ? (busy === `m${m.milestone}` ? "⏳" : "★") : "🔒";
                    return (
                      <div key={m.milestone}
                        role={isClaimable ? "button" : undefined}
                        tabIndex={isClaimable ? 0 : -1}
                        className={`dba-milestone ${cls}`}
                        onClick={() => { if (isClaimable) claimMilestone(m.milestone); }}
                        onKeyDown={e => { if (!isClaimable) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); claimMilestone(m.milestone); } }}>
                        {m.milestone} jours <span style={{ opacity:.80 }}>{icon}</span>
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
                {premiumActive ? (
                  <div className="dba-prem-pill">★ {premiumLabel} <span className="x2">×2</span></div>
                ) : null}
              </div>
              <div className="dba-section-card">
                {contentLoading ? (
                  <div className="dba-section-sub" style={{ opacity:.70 }}>⏳ Chargement…</div>
                ) : contentHtml ? (
                  <div className="dba-html" dangerouslySetInnerHTML={{ __html: contentHtml }} />
                ) : (
                  <div className="dba-section-sub" style={{ opacity:.70 }}>Contenu indisponible.</div>
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
              <div className="dba-section-card">
                {welcomeLoad ? (
                  <div className="dba-section-sub" style={{ opacity:.70 }}>⏳ Chargement…</div>
                ) : !welcome?.ok ? (
                  <div className="dba-section-sub" style={{ opacity:.70 }}>Indisponible.</div>
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
                            <div key={it.key} className={`dba-quest${done ? " done" : ""}`}>
                              <span>{it.label}</span>
                              {done
                                ? <span className="dba-quest-check">✅</span>
                                : <span className="dba-quest-progress">{it.have}/{it.need}</span>
                              }
                            </div>
                          );
                        })}
                      </div>

                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, gap:12 }}>
                        <div className="dba-milestone-hint" style={{ marginTop:0 }}>
                          Récompenses : <strong style={{ color:"rgba(200,195,240,.85)" }}>+50 rubis</strong> + <strong style={{ color:"rgba(200,195,240,.85)" }}>7 jours Viewer</strong>
                        </div>
                        <button className="dba-claim-btn" disabled={!welcome?.completed || !!busy}
                          title={!welcome?.completed ? "Complète toutes les quêtes" : "Récupérer"}
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
                          }}>
                          {busy === "welcome_claim" ? "⏳ Récupération…" : "Récupérer"}
                        </button>
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
