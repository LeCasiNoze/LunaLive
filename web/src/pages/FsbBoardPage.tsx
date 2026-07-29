import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  createExpense,
  deleteExpense,
  listExpenses,
  setExpensePaid,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ExpenseListSummary,
  type ExpenseVisibleRow,
} from "../lib/api_expenses";
import {
  getFsbInstagramDashboard,
  type FsbInstagramDashboardResponse,
  type FsbInstagramItem,
} from "../lib/api_fsb_dashboard";
import { canAccessFsbBoard } from "../lib/fsb_access";
import { FsbAgencySection } from "./fsb/FsbAgencySection";
import { OverlayDesignerSection } from "./fsb/OverlayDesignerSection";
import { FsbTikTokOutreachSection } from "./fsb/FsbTikTokOutreachSection";
import { FsbScoutSection } from "./fsb/FsbScoutSection";
import { FsbRumbleOutreachSection } from "./fsb/FsbRumbleOutreachSection";
import { FsbTodoWidget } from "../components/FsbTodoWidget";

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  giveaway: "Giveaway",
  offres: "Offres",
  parrainage: "Parrainage",
  abonnement: "Abonnement",
  personnalise: "Personnalise",
};

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  giveaway: "#a855f7",
  offres: "#22d3ee",
  parrainage: "#10b981",
  abonnement: "#6366f1",
  personnalise: "#f59e0b",
};

type BoardSection = "home" | "expenses" | "instagram" | "agency" | "tools" | "tiktok" | "scout" | "outreach";
type SortBy = "date" | "amount";
type SortDirection = "asc" | "desc";
type InstagramView = "week" | "month";

type FormState = {
  description: string;
  category: ExpenseCategory;
  amount: string;
  date: string;
  isRecurring: boolean;
  recurrenceEndDate: string;
  notes: string;
};

const SECTION_LABELS: Record<BoardSection, string> = {
  home: "🏠 Accueil",
  expenses: "💸 Frais",
  instagram: "📅 Agenda",
  agency: "🏢 Agence",
  tools: "🛠 Outils",
  tiktok: "🎯 TikTok",
  scout: "🎰 Scout",
  outreach: "📨 Outreach Rumble",
};

const PAGE_CSS = `
/* ─── FSB Board — Design System v2 ────────────────────────────────── */
.fsb{
  --bg:#060d1c;--panel:#0a1628;--surface:#0e1d38;--surface2:#122244;
  --bd:rgba(60,95,175,.18);--bd-s:rgba(99,140,220,.32);
  --text:#dde8ff;--muted:rgba(148,178,232,.62);
  --p:#6366f1;--p-dim:rgba(99,102,241,.14);
  --cyan:#22d3ee;--cyan-dim:rgba(34,211,238,.11);
  --amber:#f59e0b;--amber-dim:rgba(245,158,11,.12);
  --purple:#a855f7;--purple-dim:rgba(168,85,247,.12);
  --green:#10b981;--green-dim:rgba(16,185,129,.12);
  --red:#f04e4e;--red-dim:rgba(240,78,78,.1);
  color:var(--text);font-size:14px;
}
.fsb-shell{
  background:
    radial-gradient(ellipse 70% 50% at 5% 0%,rgba(99,102,241,.12) 0%,transparent 55%),
    radial-gradient(ellipse 55% 40% at 95% 0%,rgba(34,211,238,.08) 0%,transparent 50%),
    var(--bg);
  border:1px solid var(--bd);border-radius:24px;padding:28px;
  box-shadow:0 32px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.06);
}
.fsb-card,.fsb-empty{
  border:1px solid var(--bd);border-radius:20px;padding:22px;
  background:linear-gradient(160deg,rgba(255,255,255,.028) 0%,transparent 60%),var(--panel);
  box-shadow:0 2px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
}
.fsb-card+.fsb-card,.fsb-card+.fsb-empty,.fsb-empty+.fsb-card{margin-top:18px}
.fsb-modal{
  width:min(720px,100%);max-height:88vh;overflow:auto;padding:28px;
  border:1px solid var(--bd-s);border-radius:22px;
  background:linear-gradient(160deg,rgba(99,102,241,.05) 0%,transparent 50%),var(--panel);
  box-shadow:0 40px 100px rgba(0,0,0,.65),0 0 0 1px rgba(99,102,241,.1);
}
.fsb-nav{
  display:flex;gap:5px;flex-wrap:wrap;align-items:center;
  background:var(--panel);border:1px solid var(--bd);border-radius:16px;padding:5px;margin-top:14px;
}
.fsb-navbtn{
  border-radius:11px;border:1px solid transparent;font:inherit;font-size:13px;font-weight:700;
  background:transparent;color:var(--muted);cursor:pointer;padding:8px 16px;
  transition:color .15s,background .15s,box-shadow .15s;letter-spacing:.01em;
  text-decoration:none;display:inline-flex;align-items:center;gap:6px;
}
.fsb-navbtn:hover{color:var(--text);background:rgba(255,255,255,.05)}
.fsb-navbtn-active{
  background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
  color:#fff !important;box-shadow:0 4px 20px rgba(99,102,241,.42);border-color:transparent;
}
.fsb-row,.fsb-sectionhead{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.fsb-actions,.fsb-inline,.fsb-tags,.fsb-pills{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fsb-btn,.fsb-icon,.fsb-table button,.fsb-jump{
  border-radius:11px;border:1px solid var(--bd);font:inherit;font-size:13px;font-weight:700;
  background:rgba(255,255,255,.04);color:var(--text);cursor:pointer;letter-spacing:.01em;
  transition:transform .14s,box-shadow .14s,background .14s,filter .14s;
}
.fsb-btn:hover,.fsb-icon:hover,.fsb-table button:hover,.fsb-jump:hover{transform:translateY(-1px);background:rgba(255,255,255,.07);filter:brightness(1.06)}
.fsb-btn,.fsb-jump{padding:9px 16px;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none}
.fsb-btn-primary{
  background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);
  border-color:rgba(139,92,246,.4);color:#fff;box-shadow:0 2px 14px rgba(99,102,241,.32);
}
.fsb-btn-primary:hover{box-shadow:0 4px 22px rgba(99,102,241,.52);filter:brightness(1.1)}
.fsb-icon{width:36px;height:36px;display:grid;place-items:center;padding:0}
.fsb-copy,.fsb-muted{color:var(--muted);line-height:1.6;font-size:13px}
.fsb-sectiontitle{
  margin:0;font-size:22px;font-weight:800;letter-spacing:-.04em;
  background:linear-gradient(135deg,var(--text) 40%,var(--muted));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.fsb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:18px}
.fsb-stat{border:1px solid var(--bd);border-radius:16px;background:var(--surface);padding:16px 18px;position:relative;overflow:hidden}
.fsb-stat::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--p),var(--cyan));border-radius:16px 16px 0 0}
.fsb-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800}
.fsb-stat strong{display:block;margin-top:10px;font-size:28px;font-weight:800;letter-spacing:-.05em;line-height:1}
.fsb-stat span{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.fsb-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.fsb-grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.fsb-module{display:flex;flex-direction:column;gap:14px;min-height:220px}
.fsb-module strong{font-size:16px;font-weight:800;letter-spacing:-.02em}
.fsb-pill,.fsb-tag{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;border:1px solid var(--bd);background:rgba(255,255,255,.04);font-size:11px;font-weight:700;letter-spacing:.02em}
.fsb-pill-soft{background:var(--cyan-dim);border-color:rgba(34,211,238,.22);color:var(--cyan)}
.fsb-pill-warn{background:var(--amber-dim);border-color:rgba(245,158,11,.24);color:var(--amber)}
.fsb-pill-bad{background:var(--red-dim);border-color:rgba(240,78,78,.24);color:var(--red)}
.fsb-tag-scheduled{background:var(--cyan-dim);border-color:rgba(34,211,238,.2);color:#67e8f9}
.fsb-tag-done,.fsb-tag-paid{background:var(--green-dim);border-color:rgba(16,185,129,.22);color:#34d399}
.fsb-tag-due{background:var(--amber-dim);border-color:rgba(245,158,11,.24);color:#fbbf24}
.fsb-tag-error{background:var(--red-dim);border-color:rgba(240,78,78,.24);color:#fc8181}
.fsb-tag-uploading{background:var(--purple-dim);border-color:rgba(168,85,247,.24);color:#c084fc}
.fsb-tag-rec{background:var(--p-dim);border-color:rgba(99,102,241,.24);color:#a5b4fc}
.fsb-list{display:grid;gap:8px;margin-top:14px}
.fsb-listitem{
  display:flex;gap:12px;align-items:center;justify-content:space-between;
  padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.055);
  background:rgba(255,255,255,.02);transition:background .15s,border-color .15s;
}
.fsb-listitem:hover{background:rgba(255,255,255,.04);border-color:var(--bd-s)}
.fsb-listmain{min-width:0}
.fsb-listmain strong,.fsb-listmain a{display:block;color:var(--text);text-decoration:none;font-size:14px;font-weight:700}
.fsb-listmeta{margin-top:3px;color:var(--muted);font-size:12px;line-height:1.45}
.fsb-toolbar{margin-top:18px}
.fsb-tablewrap{margin-top:18px;border:1px solid var(--bd);border-radius:18px;overflow:hidden;background:var(--panel)}
.fsb-table{width:100%;border-collapse:collapse}
.fsb-table th,.fsb-table td{padding:13px 16px;text-align:left;vertical-align:top}
.fsb-table th{background:rgba(255,255,255,.025);font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);font-weight:800}
.fsb-table td{border-top:1px solid rgba(255,255,255,.04)}
.fsb-table tr:hover td{background:rgba(255,255,255,.018)}
.fsb-table strong{display:block;font-weight:700}
.fsb-table button{padding:6px 12px;font-size:12px}
.fsb-sub{margin-top:4px;color:var(--muted);font-size:12px;line-height:1.5}
.fsb-alert{margin-top:16px;padding:13px 16px;border-radius:14px;border:1px solid rgba(240,78,78,.26);background:var(--red-dim);color:#fca5a5;font-size:13px}
.fsb-backdrop{position:fixed;inset:0;background:rgba(4,8,24,.82);backdrop-filter:blur(14px);display:grid;place-items:center;padding:16px;z-index:120}
.fsb-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}
.fsb-field{display:grid;gap:8px}
.fsb-field-full{grid-column:1/-1}
.fsb-field label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.fsb-input,.fsb-select,.fsb-textarea{
  width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--bd);
  background:var(--surface);color:var(--text);font:inherit;font-size:14px;padding:10px 13px;
  transition:border-color .15s,box-shadow .15s;outline:none;
}
.fsb-input:focus,.fsb-select:focus,.fsb-textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.fsb-select option{color:#0d1b2e;background:#fff}
.fsb-textarea{min-height:110px;resize:vertical}
.fsb-check{display:flex;gap:10px;align-items:center;font-weight:700}
.fsb-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}
.fsb-calendar{margin-top:18px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
.fsb-calendar-head{padding:8px 6px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:center}
.fsb-day,.fsb-daylist{border-radius:16px;border:1px solid rgba(255,255,255,.052);background:var(--surface);padding:10px;display:flex;flex-direction:column;gap:8px}
.fsb-day{min-height:180px}
.fsb-daylist{min-height:220px}
.fsb-day-out{opacity:.42}
.fsb-day-today{border-color:rgba(99,102,241,.36);box-shadow:0 0 0 1px rgba(99,102,241,.16) inset,0 4px 16px rgba(99,102,241,.1)}
.fsb-day-top{display:flex;align-items:center;justify-content:space-between;gap:6px}
.fsb-day-title{font-weight:800;font-size:13px}
.fsb-day-sub{font-size:11px;color:var(--muted)}
.fsb-day-items{display:grid;gap:6px}
.fsb-mini{display:grid;gap:3px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:var(--text);text-decoration:none;transition:background .12s}
.fsb-mini:hover{background:rgba(255,255,255,.06)}
.fsb-mini strong{font-size:12px;font-weight:700;line-height:1.3}
.fsb-mini small{color:var(--muted);font-size:11px}
.fsb-mini-scheduled{border-color:rgba(34,211,238,.2)}
.fsb-mini-done{border-color:rgba(16,185,129,.2)}
.fsb-mini-error{border-color:rgba(240,78,78,.22)}
.fsb-mini-uploading{border-color:rgba(168,85,247,.2)}
.fsb-more{color:var(--muted);font-size:11px}
.fsb-week{margin-top:18px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px}
.fsb-emptyblock{display:grid;place-items:center;min-height:100px;border-radius:14px;border:1px dashed rgba(255,255,255,.08);color:var(--muted);font-size:13px}
.fsb-tabs{display:flex;gap:2px;flex-wrap:wrap;margin-top:18px;background:var(--surface);border-radius:12px;padding:4px;width:fit-content;border:1px solid var(--bd)}
.fsb-tab{padding:7px 16px;border-radius:9px;border:1px solid transparent;background:transparent;color:var(--muted);font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:color .12s,background .12s}
.fsb-tab:hover{color:var(--text)}
.fsb-tab-active{background:var(--panel);border-color:var(--bd);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.22)}
.fsb-tab-content{margin-top:18px}
.fsb-hint{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5}
.fsb-form-section{background:var(--surface);border:1px solid var(--bd);border-radius:18px;padding:20px;margin-bottom:16px}
.fsb-form-section h4{margin:0 0 14px;font-size:14px;font-weight:800;letter-spacing:-.02em}
.fsb-badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:800;background:var(--amber-dim);color:#fbbf24;border:1px solid rgba(245,158,11,.24)}
.fsb-badge-green{background:var(--green-dim);color:#34d399;border-color:rgba(16,185,129,.24)}
.fsb-thumbrow{display:flex;gap:12px;align-items:center}
.fsb-thumb{width:64px;height:64px;border-radius:14px;object-fit:cover;background:rgba(255,255,255,.04);flex-shrink:0}
.fsb-thumb-placeholder{display:grid;place-items:center;background:linear-gradient(135deg,var(--amber-dim),var(--cyan-dim));font-weight:800}
.fsb-coming{display:grid;gap:10px;margin-top:14px}
.fsb-coming div{padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.052);font-size:13px}
.fsb-coming strong{display:block;font-weight:700;margin-bottom:2px}
.fsb-module-icon{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-size:18px;flex-shrink:0;margin-bottom:4px}
.fsb-module-icon-amber{background:var(--amber-dim);border:1px solid rgba(245,158,11,.24)}
.fsb-module-icon-cyan{background:var(--cyan-dim);border:1px solid rgba(34,211,238,.22)}
.fsb-module-icon-purple{background:var(--purple-dim);border:1px solid rgba(168,85,247,.22)}
.fsb-module-icon-indigo{background:var(--p-dim);border:1px solid rgba(99,102,241,.24)}
@media(max-width:1100px){.fsb-grid-3,.fsb-grid-2,.fsb-week{grid-template-columns:1fr}.fsb-calendar{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:860px){.fsb-grid{grid-template-columns:1fr}.fsb-calendar{grid-template-columns:1fr}.fsb-calendar-head{display:none}.fsb-shell{padding:16px}}
@media(max-width:740px){.fsb-tablewrap{overflow:auto}.fsb-table{min-width:760px}}

/* ─── Design System v3 — KPI, charts, filters, switches ───────────── */
.fsb-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:18px}
.fsb-kpi{position:relative;overflow:hidden;border:1px solid var(--bd-s);border-radius:22px;padding:22px 24px;background:linear-gradient(140deg,rgba(99,102,241,.12) 0%,rgba(34,211,238,.06) 40%,transparent 80%),var(--panel);box-shadow:0 8px 30px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.07)}
.fsb-kpi::after{content:'';position:absolute;top:-40%;right:-20%;width:60%;height:180%;background:radial-gradient(ellipse at center,rgba(99,102,241,.18) 0%,transparent 60%);pointer-events:none}
.fsb-kpi-neutral{background:linear-gradient(140deg,rgba(148,178,232,.06) 0%,transparent 60%),var(--panel)}
.fsb-kpi-neutral::after{display:none}
.fsb-kpi-good{background:linear-gradient(140deg,rgba(16,185,129,.14) 0%,rgba(34,211,238,.06) 50%,transparent 80%),var(--panel)}
.fsb-kpi-good::after{background:radial-gradient(ellipse at center,rgba(16,185,129,.2) 0%,transparent 60%)}
.fsb-kpi-warn{background:linear-gradient(140deg,rgba(245,158,11,.14) 0%,transparent 60%),var(--panel)}
.fsb-kpi-warn::after{background:radial-gradient(ellipse at center,rgba(245,158,11,.2) 0%,transparent 60%)}
.fsb-kpi-bad{background:linear-gradient(140deg,rgba(240,78,78,.14) 0%,transparent 60%),var(--panel)}
.fsb-kpi-bad::after{background:radial-gradient(ellipse at center,rgba(240,78,78,.2) 0%,transparent 60%)}
.fsb-kpi small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;font-size:10.5px;font-weight:800}
.fsb-kpi-val{display:block;margin-top:10px;font-size:38px;font-weight:800;letter-spacing:-.055em;line-height:1;font-variant-numeric:tabular-nums}
.fsb-kpi-val-neg{color:#fca5a5}
.fsb-kpi-val-pos{color:#6ee7b7}
.fsb-kpi-sub{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.5;position:relative;z-index:1}
.fsb-kpi-row{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap;position:relative;z-index:1}

.fsb-progress{height:8px;border-radius:999px;background:rgba(255,255,255,.04);overflow:hidden;border:1px solid rgba(255,255,255,.05)}
.fsb-progress-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--green),var(--cyan));transition:width .4s ease}
.fsb-progress-fill-warn{background:linear-gradient(90deg,var(--amber),#fb923c)}

.fsb-stackbar{display:flex;height:16px;border-radius:10px;overflow:hidden;border:1px solid var(--bd);background:rgba(255,255,255,.02)}
.fsb-stackbar-seg{height:100%;transition:filter .15s}
.fsb-stackbar-seg:hover{filter:brightness(1.15)}
.fsb-legend{display:flex;flex-wrap:wrap;gap:12px 18px;margin-top:12px}
.fsb-legend-item{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--text)}
.fsb-legend-dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
.fsb-legend-item small{color:var(--muted);font-size:11px;text-transform:none;letter-spacing:0;font-weight:600}

.fsb-chips{display:flex;gap:6px;flex-wrap:wrap}
.fsb-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--bd);background:rgba(255,255,255,.03);color:var(--muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:all .14s;letter-spacing:.01em}
.fsb-chip:hover{color:var(--text);background:rgba(255,255,255,.06)}
.fsb-chip-active{background:var(--p-dim);border-color:rgba(99,102,241,.42);color:#c7d2fe}

.fsb-seg{display:inline-flex;gap:2px;background:var(--surface);border:1px solid var(--bd);border-radius:11px;padding:3px}
.fsb-seg-btn{padding:6px 14px;border-radius:8px;border:none;background:transparent;color:var(--muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer;transition:all .12s}
.fsb-seg-btn:hover{color:var(--text)}
.fsb-seg-btn-active{background:var(--panel);color:var(--text);box-shadow:0 2px 8px rgba(0,0,0,.25)}

.fsb-search{position:relative;display:inline-flex;align-items:center;flex:0 0 auto}
.fsb-search svg{position:absolute;left:12px;width:14px;height:14px;color:var(--muted);pointer-events:none}
.fsb-search input{padding-left:34px}

.fsb-switch{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.fsb-switch input{position:absolute;opacity:0;pointer-events:none}
.fsb-switch-track{width:34px;height:20px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid var(--bd);position:relative;transition:background .16s,border-color .16s}
.fsb-switch-track::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#dde8ff;transition:transform .18s,background .16s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.fsb-switch input:checked + .fsb-switch-track{background:linear-gradient(90deg,var(--green),#34d399);border-color:rgba(16,185,129,.4)}
.fsb-switch input:checked + .fsb-switch-track::after{transform:translateX(14px);background:#fff}

.fsb-cat-stripe{display:inline-block;width:4px;align-self:stretch;border-radius:3px;margin-right:10px;vertical-align:middle}
.fsb-cat-giveaway{background:linear-gradient(180deg,#a855f7,#7c3aed)}
.fsb-cat-offres{background:linear-gradient(180deg,#22d3ee,#0891b2)}
.fsb-cat-parrainage{background:linear-gradient(180deg,#10b981,#059669)}
.fsb-cat-abonnement{background:linear-gradient(180deg,#6366f1,#4f46e5)}
.fsb-cat-personnalise{background:linear-gradient(180deg,#f59e0b,#d97706)}

.fsb-barlist{display:grid;gap:10px;margin-top:14px}
.fsb-barlist-row{display:grid;grid-template-columns:minmax(120px,20%) 1fr auto;gap:14px;align-items:center;font-size:13px}
.fsb-barlist-name{font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fsb-barlist-name small{display:block;color:var(--muted);font-size:11px;font-weight:500;margin-top:1px;letter-spacing:0;text-transform:none}
.fsb-barlist-track{position:relative;height:22px;border-radius:8px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.05);overflow:hidden}
.fsb-barlist-bar{height:100%;background:linear-gradient(90deg,var(--p),var(--cyan));border-radius:8px;transition:width .35s ease}
.fsb-barlist-bar-soft{background:linear-gradient(90deg,rgba(99,102,241,.5),rgba(34,211,238,.5))}
.fsb-barlist-val{font-weight:800;font-variant-numeric:tabular-nums;font-size:13px;text-align:right;min-width:80px}

.fsb-ring-wrap{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
.fsb-ring{position:relative;width:160px;height:160px;flex-shrink:0}
.fsb-ring-center{position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none}
.fsb-ring-center strong{font-size:26px;font-weight:800;letter-spacing:-.04em;line-height:1}
.fsb-ring-center small{display:block;color:var(--muted);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;margin-top:6px}

.fsb-panel-split{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:1200px){.fsb-panel-split{grid-template-columns:1fr}}

.fsb-mini-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:14px}
.fsb-mini-stat{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02)}
.fsb-mini-stat small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:800}
.fsb-mini-stat strong{display:block;margin-top:6px;font-size:18px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums}

.fsb-ghost-btn{background:transparent;border:1px dashed rgba(255,255,255,.12);color:var(--muted);padding:14px;border-radius:14px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;width:100%;transition:all .15s}
.fsb-ghost-btn:hover{color:var(--text);border-color:var(--bd-s);background:rgba(255,255,255,.02)}

.fsb-affi-card{border:1px solid var(--bd);border-radius:20px;overflow:hidden;background:linear-gradient(160deg,rgba(255,255,255,.025) 0%,transparent 60%),var(--panel);transition:border-color .18s,box-shadow .18s}
.fsb-affi-card:hover{border-color:var(--bd-s);box-shadow:0 8px 26px rgba(0,0,0,.28)}
.fsb-affi-head{padding:16px 20px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.05);background:linear-gradient(180deg,rgba(99,102,241,.04),transparent)}
.fsb-avatar{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;background:linear-gradient(135deg,rgba(99,102,241,.35),rgba(34,211,238,.25));border:1px solid rgba(99,102,241,.3);flex-shrink:0;color:#fff}
.fsb-affi-name{font-weight:800;font-size:16px;letter-spacing:-.01em;line-height:1.2}
.fsb-affi-meta{color:var(--muted);font-size:12px;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.fsb-dot-access{display:inline-block;width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 0 2px rgba(16,185,129,.18)}
.fsb-dot-noaccess{display:inline-block;width:7px;height:7px;border-radius:50%;background:#fca5a5;box-shadow:0 0 0 2px rgba(240,78,78,.18)}

.fsb-assignment{padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.04);display:grid;gap:10px}
.fsb-assignment:last-child{border-bottom:none}
.fsb-assignment-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.fsb-assignment-title{font-weight:700;font-size:14px}
.fsb-assignment-title span{color:var(--muted);font-weight:500;font-size:13px;margin-left:6px}
.fsb-chip-row{display:flex;gap:14px;flex-wrap:wrap;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04)}
.fsb-chipstat{display:inline-flex;flex-direction:column;gap:2px;min-width:68px}
.fsb-chipstat small{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:800}
.fsb-chipstat strong{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.fsb-chipstat-accent strong{color:#6ee7b7}
.fsb-chipstat-warn strong{color:#fbbf24}

.fsb-step-nav{display:flex;gap:6px;padding:4px;background:var(--surface);border:1px solid var(--bd);border-radius:12px;margin-bottom:14px;flex-wrap:wrap}
.fsb-step{padding:9px 14px;border-radius:9px;border:none;background:transparent;color:var(--muted);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:all .14s;display:inline-flex;align-items:center;gap:8px}
.fsb-step-num{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid var(--bd);font-size:11px;font-weight:800}
.fsb-step:hover{color:var(--text)}
.fsb-step-active{background:var(--panel);color:var(--text);box-shadow:0 2px 10px rgba(0,0,0,.22)}
.fsb-step-active .fsb-step-num{background:linear-gradient(135deg,var(--p),#8b5cf6);border-color:transparent;color:#fff}

.fsb-inline-form{margin:0 20px 16px;background:linear-gradient(160deg,rgba(245,158,11,.04),transparent 60%),rgba(255,255,255,.02);border:1px solid rgba(245,158,11,.18);border-radius:16px;padding:18px}
.fsb-inline-form h5{margin:0 0 12px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);display:flex;gap:8px;align-items:center}
.fsb-inline-form h5::before{content:'';width:4px;height:14px;border-radius:2px;background:var(--amber)}
.fsb-preview-bar{display:flex;gap:14px;padding:10px 12px;margin:12px 0 4px;border-radius:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);flex-wrap:wrap}
`;

function normalizeSection(value: string | null): BoardSection {
  if (value === "expenses" || value === "instagram" || value === "agency" || value === "tools" || value === "tiktok" || value === "scout" || value === "outreach") return value;
  return "home";
}

function todayKey() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(p.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentMonthKey() {
  return todayKey().slice(0, 7);
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function dateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function dayLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function shortDayName(index: number) {
  const base = new Date(Date.UTC(2026, 0, 5 + index));
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "short" }).format(base);
}

function eur(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(value);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKeyValue: string, delta: number) {
  const date = parseDateOnly(dateKeyValue);
  date.setUTCDate(date.getUTCDate() + delta);
  return toDateKey(date);
}

function addMonthsToDate(dateKeyValue: string, delta: number) {
  const [year, month, day] = dateKeyValue.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const safeDay = Math.min(day, daysInMonth(next.getUTCFullYear(), next.getUTCMonth() + 1));
  next.setUTCDate(safeDay);
  return toDateKey(next);
}

function startOfWeek(dateKeyValue: string) {
  const date = parseDateOnly(dateKeyValue);
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex);
  return toDateKey(date);
}

function endOfWeek(dateKeyValue: string) {
  return addDays(startOfWeek(dateKeyValue), 6);
}

function startOfMonthDate(dateKeyValue: string) {
  return `${dateKeyValue.slice(0, 7)}-01`;
}

function endOfMonthDate(dateKeyValue: string) {
  const [year, month] = dateKeyValue.slice(0, 7).split("-").map(Number);
  return `${dateKeyValue.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

function startOfCalendarMonth(dateKeyValue: string) {
  return startOfWeek(startOfMonthDate(dateKeyValue));
}

function endOfCalendarMonth(dateKeyValue: string) {
  const end = parseDateOnly(endOfMonthDate(dateKeyValue));
  const dayIndex = (end.getUTCDay() + 6) % 7;
  end.setUTCDate(end.getUTCDate() + (6 - dayIndex));
  return toDateKey(end);
}

function buildMonthGrid(dateKeyValue: string) {
  const start = startOfCalendarMonth(dateKeyValue);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function weekRangeLabel(dateKeyValue: string) {
  const from = startOfWeek(dateKeyValue);
  const to = endOfWeek(dateKeyValue);
  return `${dayLabel(from)} - ${dayLabel(to)}`;
}

function instagramDisplayRange(view: InstagramView, focusDate: string) {
  if (view === "week") return { from: startOfWeek(focusDate), to: endOfWeek(focusDate) };
  return { from: startOfMonthDate(focusDate), to: endOfMonthDate(focusDate) };
}

function instagramFetchRange(view: InstagramView, focusDate: string) {
  if (view === "week") {
    return { from: startOfWeek(focusDate), toExclusive: addDays(endOfWeek(focusDate), 1) };
  }
  return { from: startOfCalendarMonth(focusDate), toExclusive: addDays(endOfCalendarMonth(focusDate), 1) };
}

function defaultForm(): FormState {
  return {
    description: "",
    category: "abonnement",
    amount: "",
    date: todayKey(),
    isRecurring: false,
    recurrenceEndDate: "",
    notes: "",
  };
}

function expenseToForm(expense: Expense): FormState {
  return {
    description: expense.description,
    category: expense.category,
    amount: String(expense.amount),
    date: expense.date,
    isRecurring: expense.isRecurring,
    recurrenceEndDate: expense.recurrenceEndDate || "",
    notes: expense.notes || "",
  };
}

function toPayload(form: FormState): ExpenseInput {
  return {
    description: form.description.trim(),
    category: form.category,
    amount: Number(form.amount),
    date: form.date,
    isRecurring: form.isRecurring,
    recurrenceEndDate: form.isRecurring && form.recurrenceEndDate ? form.recurrenceEndDate : null,
    notes: form.notes.trim() ? form.notes.trim() : null,
  };
}

function getInstagramItemDay(item: FsbInstagramItem) {
  return item.scheduledDay || item.scheduledAt?.slice(0, 10) || "";
}

function getInstagramItemTime(item: FsbInstagramItem) {
  if (item.scheduledTime) return item.scheduledTime;
  if (item.scheduledAt) return item.scheduledAt.slice(11, 16);
  return "--:--";
}

function getInstagramItemHref(item: FsbInstagramItem) {
  return item.platformUrl || item.outputUrl || null;
}

function isAbsoluteUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function instagramStatusLabel(status: string) {
  if (status === "done") return "Publie";
  if (status === "error") return "Erreur";
  if (status === "uploading") return "En cours";
  return "Programme";
}

function instagramStatusClass(status: string) {
  if (status === "done") return "fsb-tag-done";
  if (status === "error") return "fsb-tag-error";
  if (status === "uploading") return "fsb-tag-uploading";
  return "fsb-tag-scheduled";
}

function groupInstagramItems(items: FsbInstagramItem[]) {
  return items.reduce<Record<string, FsbInstagramItem[]>>((acc, item) => {
    const day = getInstagramItemDay(item);
    if (!day) return acc;
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {});
}

function computeInstagramStats(items: FsbInstagramItem[]) {
  return items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.status === "done") acc.published += 1;
      else if (item.status === "error") acc.errors += 1;
      else if (item.status === "uploading") acc.uploading += 1;
      else acc.scheduled += 1;
      return acc;
    },
    { total: 0, scheduled: 0, published: 0, errors: 0, uploading: 0 }
  );
}

function ExpenseModal({
  editing,
  form,
  saving,
  error,
  onClose,
  onChange,
  onSubmit,
}: {
  editing: Expense | null;
  form: FormState;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onChange: (patch: Partial<FormState>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fsb-backdrop" onClick={onClose}>
      <div className="fsb-modal" onClick={(event) => event.stopPropagation()}>
        <h2 style={{ margin: 0 }}>{editing ? "Modifier le frais" : "Nouveau frais"}</h2>
        <p className="fsb-copy" style={{ marginTop: 10 }}>
          {editing?.isRecurring
            ? "La date modifie l'ancre de la serie recurrente."
            : "Version rapide : EUR uniquement et recurrence mensuelle simple."}
        </p>
        {error ? <div className="fsb-alert">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="fsb-grid">
            <div className="fsb-field fsb-field-full">
              <label>Description</label>
              <input
                className="fsb-input"
                value={form.description}
                onChange={(event) => onChange({ description: event.target.value })}
                maxLength={160}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Categorie</label>
              <select
                className="fsb-select"
                value={form.category}
                onChange={(event) => onChange({ category: event.target.value as ExpenseCategory })}
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="fsb-field">
              <label>Montant (EUR)</label>
              <input
                className="fsb-input"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) => onChange({ amount: event.target.value })}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Date</label>
              <input
                className="fsb-input"
                type="date"
                value={form.date}
                onChange={(event) => onChange({ date: event.target.value })}
                required
              />
            </div>
            <div className="fsb-field">
              <label>Fin de recurrence</label>
              <input
                className="fsb-input"
                type="date"
                value={form.recurrenceEndDate}
                onChange={(event) => onChange({ recurrenceEndDate: event.target.value })}
                disabled={!form.isRecurring}
                min={form.date}
              />
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Recurrence</label>
              <label className="fsb-check">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(event) =>
                    onChange({
                      isRecurring: event.target.checked,
                      recurrenceEndDate: event.target.checked ? form.recurrenceEndDate : "",
                    })
                  }
                />
                Recalculer ce frais tous les mois sur le meme jour
              </label>
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Notes</label>
              <textarea
                className="fsb-textarea"
                value={form.notes}
                onChange={(event) => onChange({ notes: event.target.value })}
                maxLength={2000}
              />
            </div>
          </div>
          <div className="fsb-modal-actions">
            <button className="fsb-btn" type="button" onClick={onClose}>
              Annuler
            </button>
            <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving}>
              {saving ? "Enregistrement..." : editing ? "Mettre a jour" : "Creer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type ExpensesPanelProps = {
  monthKeyValue: string;
  setMonthKeyValue: React.Dispatch<React.SetStateAction<string>>;
  expenseRows: ExpenseVisibleRow[];
  sortedExpenseRows: ExpenseVisibleRow[];
  expenseSummary: ExpenseListSummary;
  expensesLoading: boolean;
  expensesError: string | null;
  sortBy: SortBy;
  setSortBy: React.Dispatch<React.SetStateAction<SortBy>>;
  sortDirection: SortDirection;
  setSortDirection: React.Dispatch<React.SetStateAction<SortDirection>>;
  reloadExpenses: () => Promise<void>;
  openCreate: () => void;
  openEdit: (expense: Expense) => void;
  onTogglePaid: (row: ExpenseVisibleRow) => Promise<void>;
  onDelete: (expense: Expense) => Promise<void>;
};

type CategoryFilter = "all" | ExpenseCategory;

function ExpensesPanel({
  monthKeyValue,
  setMonthKeyValue,
  expenseRows,
  sortedExpenseRows,
  expenseSummary,
  expensesLoading,
  expensesError,
  sortBy,
  setSortBy,
  sortDirection,
  setSortDirection,
  reloadExpenses,
  openCreate,
  openEdit,
  onTogglePaid,
  onDelete,
}: ExpensesPanelProps) {
  const [search, setSearch] = React.useState("");
  const [catFilter, setCatFilter] = React.useState<CategoryFilter>("all");

  const paidRatio = expenseSummary.total > 0
    ? Math.min(100, Math.max(0, (expenseSummary.paid / expenseSummary.total) * 100))
    : 0;

  const categoryBreakdown = React.useMemo(() => {
    const map: Record<ExpenseCategory, number> = {
      giveaway: 0, offres: 0, parrainage: 0, abonnement: 0, personnalise: 0,
    };
    for (const row of expenseRows) {
      map[row.expense.category] = (map[row.expense.category] || 0) + Number(row.expense.amount || 0);
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const entries = (Object.keys(map) as ExpenseCategory[])
      .map((cat) => ({ cat, amount: map[cat], pct: total > 0 ? (map[cat] / total) * 100 : 0 }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    return { entries, total };
  }, [expenseRows]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortedExpenseRows.filter((row) => {
      if (catFilter !== "all" && row.expense.category !== catFilter) return false;
      if (!q) return true;
      return (
        row.expense.description.toLowerCase().includes(q) ||
        (row.expense.notes || "").toLowerCase().includes(q)
      );
    });
  }, [sortedExpenseRows, search, catFilter]);

  const netTone: "good" | "bad" | "neutral" =
    expenseSummary.agencyNet > 0 ? "good" : expenseSummary.agencyNet < 0 ? "bad" : "neutral";

  return (
    <>
      {expensesError ? <div className="fsb-alert">{expensesError}</div> : null}

      {/* ── Hero header ───────────────────────────────────────────────── */}
      <section className="fsb-card">
        <div className="fsb-row">
          <div>
            <h2 className="fsb-sectiontitle" style={{ textTransform: "capitalize" }}>
              {monthLabel(monthKeyValue)}
            </h2>
            <div className="fsb-muted" style={{ marginTop: 6 }}>
              Trésorerie agence : frais manuels + versements affiliés sur {monthLabel(monthKeyValue)}.
            </div>
          </div>
          <div className="fsb-actions">
            <button className="fsb-icon" title="Mois précédent" onClick={() => setMonthKeyValue((c) => addMonths(c, -1))}>‹</button>
            <button className="fsb-btn" onClick={() => setMonthKeyValue(currentMonthKey())} disabled={monthKeyValue === currentMonthKey()}>
              Ce mois-ci
            </button>
            <button className="fsb-icon" title="Mois suivant" onClick={() => setMonthKeyValue((c) => addMonths(c, 1))}>›</button>
            <button className="fsb-icon" title="Rafraîchir" onClick={() => void reloadExpenses()}>↻</button>
          </div>
        </div>

        {/* Hero KPIs : 2 grands cards */}
        <div className="fsb-kpi-grid">
          <div className={`fsb-kpi ${netTone === "good" ? "fsb-kpi-good" : netTone === "bad" ? "fsb-kpi-bad" : "fsb-kpi-neutral"}`}>
            <small>Solde net agence</small>
            <strong className={`fsb-kpi-val ${netTone === "bad" ? "fsb-kpi-val-neg" : netTone === "good" ? "fsb-kpi-val-pos" : ""}`}>
              {eur(expenseSummary.agencyNet)}
            </strong>
            <div className="fsb-kpi-sub">
              Revenu brut <strong style={{ color: "#dde8ff" }}>{eur(expenseSummary.agencyIncome)}</strong> – versements dus <strong style={{ color: "#dde8ff" }}>{eur(expenseSummary.agencyDue)}</strong>
            </div>
          </div>
          <div className="fsb-kpi">
            <small>Sortie de trésorerie</small>
            <strong className="fsb-kpi-val">{eur(expenseSummary.total)}</strong>
            <div className="fsb-kpi-sub">{expenseRows.length} ligne{expenseRows.length > 1 ? "s" : ""} sur {monthLabel(monthKeyValue)}</div>
            <div className="fsb-kpi-row" style={{ marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div className="fsb-progress">
                  <div
                    className={`fsb-progress-fill ${paidRatio < 50 ? "fsb-progress-fill-warn" : ""}`}
                    style={{ width: `${paidRatio}%` }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 6, fontWeight: 700 }}>
                  <span>{eur(expenseSummary.paid)} payé</span>
                  <span>{paidRatio.toFixed(0)}%</span>
                  <span>{eur(expenseSummary.due)} dû</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="fsb-mini-stats">
          <div className="fsb-mini-stat"><small>Payé ce mois</small><strong style={{ color: "#34d399" }}>{eur(expenseSummary.paid)}</strong></div>
          <div className="fsb-mini-stat"><small>Reste à régler</small><strong style={{ color: "#fbbf24" }}>{eur(expenseSummary.due)}</strong></div>
          <div className="fsb-mini-stat"><small>Revenu agence brut</small><strong>{eur(expenseSummary.agencyIncome)}</strong></div>
          <div className="fsb-mini-stat"><small>Versements dus (affiliés)</small><strong>{eur(expenseSummary.agencyDue)}</strong></div>
        </div>

        {/* Category breakdown — stacked bar */}
        {categoryBreakdown.entries.length > 0 ? (
          <div style={{ marginTop: 20 }}>
            <div className="fsb-muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
              Répartition par catégorie
            </div>
            <div className="fsb-stackbar">
              {categoryBreakdown.entries.map((e) => (
                <div
                  key={e.cat}
                  className="fsb-stackbar-seg"
                  style={{ width: `${e.pct}%`, background: CATEGORY_COLORS[e.cat] }}
                  title={`${CATEGORY_LABELS[e.cat]} — ${eur(e.amount)} (${e.pct.toFixed(1)}%)`}
                />
              ))}
            </div>
            <div className="fsb-legend">
              {categoryBreakdown.entries.map((e) => (
                <span key={e.cat} className="fsb-legend-item">
                  <span className="fsb-legend-dot" style={{ background: CATEGORY_COLORS[e.cat] }} />
                  <strong>{CATEGORY_LABELS[e.cat]}</strong>
                  <small>· {eur(e.amount)} ({e.pct.toFixed(0)}%)</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <section className="fsb-card fsb-toolbar">
        <div className="fsb-row">
          <div className="fsb-actions" style={{ flex: 1 }}>
            <div className="fsb-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input
                className="fsb-input"
                style={{ width: 240 }}
                placeholder="Rechercher un frais..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="fsb-chips">
              <button type="button" className={`fsb-chip ${catFilter === "all" ? "fsb-chip-active" : ""}`} onClick={() => setCatFilter("all")}>
                Toutes
              </button>
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`fsb-chip ${catFilter === cat ? "fsb-chip-active" : ""}`}
                  onClick={() => setCatFilter(cat)}
                  style={catFilter === cat ? { borderColor: CATEGORY_COLORS[cat], color: CATEGORY_COLORS[cat], background: `${CATEGORY_COLORS[cat]}1a` } : undefined}
                >
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: CATEGORY_COLORS[cat], marginRight: 6, verticalAlign: "middle" }} />
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>
          <div className="fsb-actions">
            <div className="fsb-seg">
              <button className={`fsb-seg-btn ${sortBy === "date" ? "fsb-seg-btn-active" : ""}`} onClick={() => setSortBy("date")}>Date</button>
              <button className={`fsb-seg-btn ${sortBy === "amount" ? "fsb-seg-btn-active" : ""}`} onClick={() => setSortBy("amount")}>Montant</button>
            </div>
            <button
              className="fsb-icon"
              title={sortDirection === "asc" ? "Croissant" : "Décroissant"}
              onClick={() => setSortDirection((c) => (c === "asc" ? "desc" : "asc"))}
            >
              {sortDirection === "asc" ? "↑" : "↓"}
            </button>
            <button className="fsb-btn fsb-btn-primary" onClick={openCreate}>+ Nouveau frais</button>
          </div>
        </div>
      </section>

      {/* ── Table ───────────────────────────────────────────────────── */}
      {filteredRows.length === 0 && !expensesLoading ? (
        <section className="fsb-empty">
          <h3 style={{ margin: 0 }}>{expenseRows.length === 0 ? "Aucun frais sur ce mois" : "Aucun résultat"}</h3>
          <p className="fsb-copy" style={{ marginTop: 10 }}>
            {expenseRows.length === 0
              ? "Ajoute un frais manuel ou renseigne des stats agence avec une date de paiement."
              : "Essaie de modifier la recherche ou le filtre de catégorie."}
          </p>
          {expenseRows.length === 0 ? (
            <button className="fsb-btn fsb-btn-primary" style={{ marginTop: 12 }} onClick={openCreate}>+ Nouveau frais</button>
          ) : (
            <button className="fsb-btn" style={{ marginTop: 12 }} onClick={() => { setSearch(""); setCatFilter("all"); }}>Réinitialiser les filtres</button>
          )}
        </section>
      ) : (
        <section className="fsb-tablewrap">
          <table className="fsb-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Date</th>
                <th>Frais</th>
                <th style={{ width: 180 }}>Catégorie</th>
                <th style={{ width: 130 }}>Montant</th>
                <th style={{ width: 100 }}>Statut</th>
                <th style={{ width: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{dateLabel(row.occurrenceDate)}</strong>
                    <div className="fsb-sub">Source : {dateLabel(row.expense.date)}</div>
                    {row.paidAt ? <div className="fsb-sub" style={{ color: "#34d399" }}>Payé le {dateLabel(row.paidAt.slice(0, 10))}</div> : null}
                  </td>
                  <td>
                    <div style={{ display: "flex" }}>
                      <span className={`fsb-cat-stripe fsb-cat-${row.expense.category}`} />
                      <div style={{ minWidth: 0 }}>
                        <strong>{row.expense.description}</strong>
                        <div className="fsb-sub">{row.expense.notes || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="fsb-tags">
                      <span className="fsb-tag" style={{ background: `${CATEGORY_COLORS[row.expense.category]}18`, borderColor: `${CATEGORY_COLORS[row.expense.category]}40`, color: CATEGORY_COLORS[row.expense.category] }}>
                        {CATEGORY_LABELS[row.expense.category]}
                      </span>
                      {row.expense.sourceType === "agency_streamer_payout" ? (
                        <span className="fsb-tag fsb-tag-rec">Agence</span>
                      ) : null}
                      {row.expense.isRecurring ? (
                        <span className="fsb-tag fsb-tag-rec">
                          {row.isProjected ? "Récurrent (proj.)" : "Récurrent"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <strong style={{ fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{eur(row.expense.amount)}</strong>
                  </td>
                  <td>
                    <label className="fsb-switch" title={row.paid ? "Marquer comme à payer" : "Marquer comme payé"}>
                      <input type="checkbox" checked={row.paid} onChange={() => void onTogglePaid(row)} />
                      <span className="fsb-switch-track" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: row.paid ? "#34d399" : "#fbbf24" }}>
                        {row.paid ? "Payé" : "Dû"}
                      </span>
                    </label>
                  </td>
                  <td>
                    <div className="fsb-inline">
                      {row.canEdit ? (
                        <button type="button" onClick={() => openEdit(row.expense)}>Modifier</button>
                      ) : null}
                      {row.canDelete ? (
                        <button type="button" style={{ color: "rgba(255,120,100,.85)" }} onClick={() => void onDelete(row.expense)}>Supp.</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

export default function FsbBoardPage() {
  const { user, token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = normalizeSection(searchParams.get("section"));
  const canAccess = canAccessFsbBoard(user);
  const editorHref = `/editorFSN?returnTo=${encodeURIComponent("/FSB_Board?section=tools")}`;
  const editorV3Href = `/editorFSNV3?returnTo=${encodeURIComponent("/FSB_Board?section=tools")}`;

  const [expenseRows, setExpenseRows] = React.useState<ExpenseVisibleRow[]>([]);
  const [expenseSummary, setExpenseSummary] = React.useState<ExpenseListSummary>({
    total: 0,
    paid: 0,
    due: 0,
    agencyIncome: 0,
    agencyDue: 0,
    agencyNet: 0,
  });
  const [expensesLoading, setExpensesLoading] = React.useState(false);
  const [expensesError, setExpensesError] = React.useState<string | null>(null);
  const [monthKeyValue, setMonthKeyValue] = React.useState(currentMonthKey);
  const [sortBy, setSortBy] = React.useState<SortBy>("date");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [form, setForm] = React.useState<FormState>(defaultForm);

  const [instagramView, setInstagramView] = React.useState<InstagramView>("week");
  const [instagramFocusDate, setInstagramFocusDate] = React.useState(todayKey);
  const [instagramData, setInstagramData] = React.useState<FsbInstagramDashboardResponse | null>(null);
  const [instagramLoading, setInstagramLoading] = React.useState(false);
  const [instagramError, setInstagramError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = "FSB Board | LunaLive";
  }, []);

  const setSection = React.useCallback(
    (next: BoardSection) => {
      const params = new URLSearchParams(searchParams);
      if (next === "home") params.delete("section");
      else params.set("section", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const reloadExpenses = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setExpensesLoading(true);
    setExpensesError(null);
    try {
      const response = await listExpenses(monthKeyValue);
      setExpenseRows(response.visibleExpenses);
      setExpenseSummary(response.summary);
    } catch (err: any) {
      setExpensesError(String(err?.message || "Chargement impossible."));
    } finally {
      setExpensesLoading(false);
    }
  }, [canAccess, monthKeyValue, token]);

  React.useEffect(() => {
    void reloadExpenses();
  }, [reloadExpenses, section]);

  const instagramRange = React.useMemo(
    () => ({
      display: instagramDisplayRange(instagramView, instagramFocusDate),
      fetch: instagramFetchRange(instagramView, instagramFocusDate),
    }),
    [instagramFocusDate, instagramView]
  );

  const reloadInstagram = React.useCallback(async () => {
    if (!token || !canAccess) return;
    setInstagramLoading(true);
    setInstagramError(null);
    try {
      const response = await getFsbInstagramDashboard({
        from: instagramRange.fetch.from,
        to: instagramRange.fetch.toExclusive,
      });
      setInstagramData(response);
    } catch (err: any) {
      setInstagramError(String(err?.message || "Chargement Instagram impossible."));
    } finally {
      setInstagramLoading(false);
    }
  }, [canAccess, instagramRange.fetch.from, instagramRange.fetch.toExclusive, token]);

  React.useEffect(() => {
    void reloadInstagram();
  }, [reloadInstagram]);

  const today = React.useMemo(() => todayKey(), []);

  const sortedExpenseRows = React.useMemo(() => {
    const rows = [...expenseRows];
    return rows.sort((a, b) => {
      if (sortBy === "amount") {
        const delta = a.expense.amount - b.expense.amount;
        return sortDirection === "asc" ? delta : -delta;
      }
      const delta = a.occurrenceDate.localeCompare(b.occurrenceDate);
      return sortDirection === "asc" ? delta : -delta;
    });
  }, [expenseRows, sortBy, sortDirection]);

  const instagramDisplayItems = React.useMemo(() => {
    const items = instagramData?.items || [];
    return items
      .filter((item) => {
        const day = getInstagramItemDay(item);
        return day >= instagramRange.display.from && day <= instagramRange.display.to;
      })
      .sort((a, b) => {
        const left = `${getInstagramItemDay(a)} ${getInstagramItemTime(a)}`;
        const right = `${getInstagramItemDay(b)} ${getInstagramItemTime(b)}`;
        return left.localeCompare(right);
      });
  }, [instagramData?.items, instagramRange.display.from, instagramRange.display.to]);

  const instagramItemsByDay = React.useMemo(
    () => groupInstagramItems(instagramData?.items || []),
    [instagramData?.items]
  );

  const instagramStats = React.useMemo(
    () => computeInstagramStats(instagramDisplayItems),
    [instagramDisplayItems]
  );

  const upcomingInstagram = React.useMemo(
    () => instagramDisplayItems.filter((item) => getInstagramItemDay(item) >= today).slice(0, 6),
    [instagramDisplayItems, today]
  );

  const instagramTimeline = React.useMemo(
    () =>
      (instagramData?.timeline || []).filter(
        (point) => point.day >= instagramRange.display.from && point.day <= instagramRange.display.to
      ),
    [instagramData?.timeline, instagramRange.display.from, instagramRange.display.to]
  );

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setModalError(null);
    setModalOpen(true);
  }

  function openEdit(expense: Expense) {
    setEditing(expense);
    setForm(expenseToForm(expense));
    setModalError(null);
    setModalOpen(true);
  }

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setModalError(null);
    try {
      const payload = toPayload(form);
      if (!payload.description) throw new Error("La description est obligatoire.");
      if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
        throw new Error("Le montant doit etre superieur a 0.");
      }
      if (payload.recurrenceEndDate && payload.recurrenceEndDate < payload.date) {
        throw new Error("La fin de recurrence doit etre posterieure a la date.");
      }

      if (editing) {
        await updateExpense(editing.id, payload);
      } else {
        await createExpense(payload);
      }

      await reloadExpenses();

      setModalOpen(false);
      setEditing(null);
      setForm(defaultForm());
    } catch (err: any) {
      setModalError(String(err?.message || "Enregistrement impossible."));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(expense: Expense) {
    const message = expense.isRecurring
      ? "Supprimer cette serie recurrente ?"
      : "Supprimer ce frais ?";
    if (!window.confirm(message)) return;
    try {
      await deleteExpense(expense.id);
      await reloadExpenses();
    } catch (err: any) {
      setExpensesError(String(err?.message || "Suppression impossible."));
    }
  }

  async function onTogglePaid(row: ExpenseVisibleRow) {
    try {
      await setExpensePaid(row.expense.id, {
        paid: !row.paid,
        occurrenceDate: row.expense.isRecurring ? row.occurrenceDate : null,
      });
      await reloadExpenses();
    } catch (err: any) {
      setExpensesError(String(err?.message || "Mise a jour du paiement impossible."));
    }
  }

  function moveInstagram(delta: number) {
    setInstagramFocusDate((current) =>
      instagramView === "week" ? addDays(current, delta * 7) : addMonthsToDate(current, delta)
    );
  }

  function renderInstagramItem(item: FsbInstagramItem) {
    const href = getInstagramItemHref(item);
    const content = (
      <>
        <strong>{item.title || "Clip Instagram"}</strong>
        <small>
          {getInstagramItemTime(item)} | {instagramStatusLabel(item.status)}
          {item.streamerName ? ` | ${item.streamerName}` : ""}
        </small>
      </>
    );

    if (!href) {
      return (
        <div key={item.id} className={`fsb-mini fsb-mini-${item.status || "scheduled"}`}>
          {content}
        </div>
      );
    }

    return (
      <a
        key={item.id}
        className={`fsb-mini fsb-mini-${item.status || "scheduled"}`}
        href={href}
        target={isAbsoluteUrl(href) ? "_blank" : undefined}
        rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
      >
        {content}
      </a>
    );
  }

  if (!user) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>FSB Board</h1>
          <p className="muted">Connecte-toi pour acceder au dashboard interne.</p>
        </div>
      </main>
    );
  }

  if (!canAccess) {
    return (
      <main className="container">
        <div className="pageTitle">
          <h1>FSB Board</h1>
          <p className="muted">Acces reserve aux comptes autorises pour ce board.</p>
          <Link to="/profile" className="btnGhostInline">
            Retour au profil
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container fsb" style={{ paddingBottom: 36 }}>
      <style>{PAGE_CSS}</style>
      <div className="pageTitle">
        <h1>FSB Board</h1>
        <div className="fsb-nav">
          {(["home", "expenses", "agency", "instagram", "tiktok", "scout", "outreach", "tools"] as BoardSection[]).map((item) => (
            <button
              key={item}
              className={`fsb-navbtn ${section === item ? "fsb-navbtn-active" : ""}`}
              onClick={() => setSection(item)}
            >
              {SECTION_LABELS[item]}
            </button>
          ))}
        </div>
      </div>

      <section className="fsb-shell">
        {section === "home" ? (
          <>
            <section className="fsb-grid-3">
              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-amber">💸</span>
                    <div>
                      <strong>Frais societe</strong>
                      <div className="fsb-copy">Vue mensuelle, stats rapides et CRUD interne.</div>
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-warn">{monthLabel(monthKeyValue)}</span>
                </div>
                <div className="fsb-stats" style={{ marginTop: 0 }}>
                  <div className="fsb-stat">
                    <small>Total du mois</small>
                    <strong>{eur(expenseSummary.total)}</strong>
                    <span>{expenseRows.length} ligne(s)</span>
                  </div>
                  <div className="fsb-stat">
                    <small>A payer</small>
                    <strong>{eur(expenseSummary.due)}</strong>
                    <span>Reste a regler</span>
                  </div>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("expenses")}>
                    Ouvrir les frais
                  </button>
                  <button className="fsb-btn" onClick={openCreate}>
                    + Nouveau
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-cyan">📅</span>
                    <div>
                      <strong>Agenda Instagram</strong>
                      <div className="fsb-copy">Programmations detectees depuis les publish jobs.</div>
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-soft">
                    {instagramView === "week" ? "Semaine" : "Mois"}
                  </span>
                </div>
                <div className="fsb-pills">
                  <span className="fsb-pill fsb-pill-soft">{instagramStats.scheduled} a venir</span>
                  <span className="fsb-pill">{instagramStats.published} publies</span>
                  {instagramStats.errors > 0 && (
                    <span className="fsb-pill fsb-pill-bad">{instagramStats.errors} erreur(s)</span>
                  )}
                </div>
                <div className="fsb-list">
                  {upcomingInstagram.length ? (
                    upcomingInstagram.slice(0, 3).map((item) => (
                      <div key={item.id} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.title}</strong>
                          <div className="fsb-listmeta">
                            {dayLabel(getInstagramItemDay(item))} a {getInstagramItemTime(item)}
                          </div>
                        </div>
                        <span className={`fsb-tag ${instagramStatusClass(item.status)}`}>
                          {instagramStatusLabel(item.status)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune programmation sur la plage chargee.</div>
                  )}
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("instagram")}>
                    Ouvrir l agenda
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-indigo">🛠</span>
                    <div>
                      <strong>Outils</strong>
                      <div className="fsb-copy">Redirections rapides vers les outils internes.</div>
                    </div>
                  </div>
                  <span className="fsb-pill">Hub</span>
                </div>
                <div className="fsb-list">
                  <div className="fsb-listitem">
                    <div className="fsb-listmain">
                      <strong>Editeur des modeles</strong>
                      <div className="fsb-listmeta">Acces direct a /editorFSN avec retour au board.</div>
                    </div>
                  </div>
                  <div className="fsb-listitem">
                    <div className="fsb-listmain">
                      <strong>Structure stats videos</strong>
                      <div className="fsb-listmeta">Place reservee pour vues, tops et historiques.</div>
                    </div>
                  </div>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <Link className="fsb-btn fsb-btn-primary" to={editorHref}>
                    Ouvrir l editeur
                  </Link>
                  <button className="fsb-btn" onClick={() => setSection("tools")}>
                    Voir les outils
                  </button>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-purple">🏢</span>
                    <div>
                      <strong>Agence</strong>
                      <div className="fsb-copy">Casinos, deals, streamers subaffiliation et gains.</div>
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-soft">Interne</span>
                </div>
                <div className="fsb-stats" style={{ marginTop: 0 }}>
                  <div className="fsb-stat">
                    <small>Revenu agence brut</small>
                    <strong>{eur(expenseSummary.agencyIncome)}</strong>
                    <span>Genere ce mois</span>
                  </div>
                  <div className="fsb-stat">
                    <small>Solde net agence</small>
                    <strong style={{ color: expenseSummary.agencyNet >= 0 ? "inherit" : "var(--red)" }}>
                      {eur(expenseSummary.agencyNet)}
                    </strong>
                    <span>Apres versements</span>
                  </div>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto" }}>
                  <button className="fsb-btn fsb-btn-primary" onClick={() => setSection("agency")}>
                    Ouvrir agence
                  </button>
                </div>
              </div>
            </section>

            <section className="fsb-grid-2" style={{ marginTop: 18 }}>
              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Planning proche</h2>
                    <div className="fsb-muted">{weekRangeLabel(instagramFocusDate)}</div>
                  </div>
                  <button className="fsb-btn" onClick={() => setSection("instagram")}>
                    Aller a l agenda
                  </button>
                </div>
                {instagramError ? <div className="fsb-alert">{instagramError}</div> : null}
                <div className="fsb-list">
                  {upcomingInstagram.length ? (
                    upcomingInstagram.map((item) => {
                      const href = getInstagramItemHref(item);
                      return (
                        <div key={item.id} className="fsb-listitem">
                          <div className="fsb-listmain">
                            <strong>{item.title}</strong>
                            <div className="fsb-listmeta">
                              {dayLabel(getInstagramItemDay(item))} a {getInstagramItemTime(item)}
                              {item.streamerName ? ` | ${item.streamerName}` : ""}
                            </div>
                          </div>
                          <div className="fsb-actions">
                            {href ? (
                              <a
                                className="fsb-btn"
                                href={href}
                                target={isAbsoluteUrl(href) ? "_blank" : undefined}
                                rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                              >
                                Ouvrir
                              </a>
                            ) : null}
                            <span className={`fsb-tag ${instagramStatusClass(item.status)}`}>
                              {instagramStatusLabel(item.status)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="fsb-emptyblock">Aucune publication programmee pour le moment.</div>
                  )}
                </div>
              </div>

              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">A venir</h2>
                    <div className="fsb-muted">Structure deja prete pour les prochains modules.</div>
                  </div>
                </div>
                <div className="fsb-coming">
                  <div>
                    <strong>Stats Instagram</strong>
                    Vues totales, vues par video et cadence de publication.
                  </div>
                  <div>
                    <strong>Classement des meilleures videos</strong>
                    Top clips publies avec acces direct a la video source.
                  </div>
                  <div>
                    <strong>Historique editorial</strong>
                    Suivi des clips publies, en erreur ou en attente d upload.
                  </div>
                </div>
              </div>
            </section>

            <section className="fsb-grid-3" style={{ marginTop: 16 }}>
              <FsbTodoWidget token={token} />
            </section>
          </>
        ) : null}
        {section === "expenses" ? (
          <ExpensesPanel
            monthKeyValue={monthKeyValue}
            setMonthKeyValue={setMonthKeyValue}
            expenseRows={expenseRows}
            sortedExpenseRows={sortedExpenseRows}
            expenseSummary={expenseSummary}
            expensesLoading={expensesLoading}
            expensesError={expensesError}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            reloadExpenses={reloadExpenses}
            openCreate={openCreate}
            openEdit={openEdit}
            onTogglePaid={onTogglePaid}
            onDelete={onDelete}
          />
        ) : null}
        {section === "instagram" ? (
          <>
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h2 className="fsb-sectiontitle">
                    {instagramView === "week"
                      ? weekRangeLabel(instagramFocusDate)
                      : monthLabel(instagramFocusDate.slice(0, 7))}
                  </h2>
                  <div className="fsb-muted" style={{ marginTop: 6 }}>
                    Agenda interne des publications Instagram detectees via les jobs programmes.
                  </div>
                </div>
                <div className="fsb-actions">
                  <button className="fsb-btn" onClick={() => moveInstagram(-1)}>
                    Precedent
                  </button>
                  <button className="fsb-btn" onClick={() => setInstagramFocusDate(today)}>
                    Aujourd hui
                  </button>
                  <button className="fsb-btn" onClick={() => moveInstagram(1)}>
                    Suivant
                  </button>
                </div>
              </div>

              <div className="fsb-row" style={{ marginTop: 16 }}>
                <div className="fsb-actions">
                  <button
                    className={`fsb-btn ${instagramView === "week" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setInstagramView("week")}
                  >
                    Vue semaine
                  </button>
                  <button
                    className={`fsb-btn ${instagramView === "month" ? "fsb-btn-primary" : ""}`}
                    onClick={() => setInstagramView("month")}
                  >
                    Vue mois
                  </button>
                </div>
                <div className="fsb-actions">
                  <button className="fsb-btn" onClick={() => void reloadInstagram()}>
                    {instagramLoading ? "Actualisation..." : "Rafraichir"}
                  </button>
                </div>
              </div>

              <div className="fsb-stats">
                <div className="fsb-stat">
                  <small>Planifies</small>
                  <strong>{instagramStats.scheduled}</strong>
                  <span>Sur la plage affichee</span>
                </div>
                <div className="fsb-stat">
                  <small>Publies</small>
                  <strong>{instagramStats.published}</strong>
                  <span>Sur la plage affichee</span>
                </div>
                <div className="fsb-stat">
                  <small>Erreurs</small>
                  <strong>{instagramStats.errors}</strong>
                  <span>Jobs a surveiller</span>
                </div>
                <div className="fsb-stat">
                  <small>A venir</small>
                  <strong>{instagramData?.summary.upcomingAllTime ?? 0}</strong>
                  <span>Toutes plages confondues</span>
                </div>
              </div>
            </section>

            {instagramError ? <div className="fsb-alert">{instagramError}</div> : null}

            {instagramView === "month" ? (
              <div className="fsb-calendar">
                {Array.from({ length: 7 }, (_, index) => (
                  <div key={index} className="fsb-calendar-head">
                    {shortDayName(index)}
                  </div>
                ))}
                {buildMonthGrid(instagramFocusDate).map((day) => {
                  const items = instagramItemsByDay[day] || [];
                  const inMonth = day.startsWith(instagramFocusDate.slice(0, 7));
                  return (
                    <div
                      key={day}
                      className={`fsb-day ${inMonth ? "" : "fsb-day-out"} ${day === today ? "fsb-day-today" : ""}`}
                    >
                      <div className="fsb-day-top">
                        <div>
                          <div className="fsb-day-title">{dayLabel(day)}</div>
                          <div className="fsb-day-sub">{items.length} element(s)</div>
                        </div>
                        <button
                          className="fsb-jump"
                          onClick={() => {
                            setInstagramFocusDate(day);
                            setInstagramView("week");
                          }}
                        >
                          Semaine
                        </button>
                      </div>
                      {items.length ? (
                        <div className="fsb-day-items">
                          {items.slice(0, 3).map((item) => renderInstagramItem(item))}
                          {items.length > 3 ? <div className="fsb-more">+{items.length - 3} autre(s)</div> : null}
                        </div>
                      ) : (
                        <div className="fsb-emptyblock">Aucune publication</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="fsb-week">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = addDays(startOfWeek(instagramFocusDate), index);
                  const items = instagramItemsByDay[day] || [];
                  return (
                    <div key={day} className={`fsb-daylist ${day === today ? "fsb-day-today" : ""}`}>
                      <div className="fsb-day-top">
                        <div>
                          <div className="fsb-day-title">{dayLabel(day)}</div>
                          <div className="fsb-day-sub">{items.length} publication(s)</div>
                        </div>
                      </div>
                      {items.length ? (
                        <div className="fsb-day-items">{items.map((item) => renderInstagramItem(item))}</div>
                      ) : (
                        <div className="fsb-emptyblock">Rien de planifie</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <section className="fsb-grid-2" style={{ marginTop: 18 }}>
              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Dernieres publications</h2>
                    <div className="fsb-muted">Acces direct aux derniers clips deja publies.</div>
                  </div>
                </div>
                <div className="fsb-list">
                  {instagramData?.recentPublished?.length ? (
                    instagramData.recentPublished.map((item) => {
                      const href = item.platformUrl;
                      const title = item.title || "Clip Instagram";
                      return (
                        <div key={item.id} className="fsb-listitem">
                          <div className="fsb-thumbrow">
                            {item.thumbnailUrl ? (
                              <img className="fsb-thumb" src={item.thumbnailUrl} alt={title} />
                            ) : (
                              <div className="fsb-thumb fsb-thumb-placeholder">IG</div>
                            )}
                            <div className="fsb-listmain">
                              <strong>{title}</strong>
                              <div className="fsb-listmeta">
                                {item.finishedAt ? `Publie le ${dateLabel(item.finishedAt.slice(0, 10))}` : "Publie"}
                              </div>
                            </div>
                          </div>
                          {href ? (
                            <a
                              className="fsb-btn"
                              href={href}
                              target={isAbsoluteUrl(href) ? "_blank" : undefined}
                              rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                            >
                              Ouvrir
                            </a>
                          ) : (
                            <span className="fsb-tag fsb-tag-done">Publie</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="fsb-emptyblock">Aucune publication recente a afficher.</div>
                  )}
                </div>
              </div>

              <div className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h2 className="fsb-sectiontitle">Stats de publication</h2>
                    <div className="fsb-muted">Volumes par jour et repartition par streamer sur la plage chargee.</div>
                  </div>
                </div>
                <div className="fsb-list">
                  {instagramTimeline.length ? (
                    instagramTimeline.map((point) => (
                      <div key={point.day} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{dayLabel(point.day)}</strong>
                          <div className="fsb-listmeta">
                            {point.publishedCount} publie(s), {point.scheduledCount} programme(s), {point.errorCount} erreur(s)
                          </div>
                        </div>
                        <span className="fsb-tag">{point.totalCount} total</span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune activite sur la plage chargee.</div>
                  )}
                </div>
                <div className="fsb-list" style={{ marginTop: 18 }}>
                  {(instagramData?.topStreamers || []).length ? (
                    instagramData!.topStreamers.map((item, index) => (
                      <div key={`${item.streamerSlug || item.streamerName || "streamer"}:${index}`} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.streamerName || "Sans streamer"}</strong>
                          <div className="fsb-listmeta">
                            {item.publishedCount} publie(s), {item.scheduledCount} programme(s), {item.errorCount} erreur(s)
                          </div>
                        </div>
                        <span className="fsb-tag">{item.totalCount} total</span>
                      </div>
                    ))
                  ) : (
                    <div className="fsb-emptyblock">Aucune repartition streamer disponible.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h2 className="fsb-sectiontitle">Dernieres erreurs</h2>
                  <div className="fsb-muted">Les jobs Instagram en erreur les plus recents.</div>
                </div>
              </div>
              <div className="fsb-list">
                {instagramData?.recentErrors?.length ? (
                  instagramData.recentErrors.map((item) => {
                    const href = item.platformUrl || item.outputUrl;
                    return (
                      <div key={item.id} className="fsb-listitem">
                        <div className="fsb-listmain">
                          <strong>{item.title}</strong>
                          <div className="fsb-listmeta">
                            {item.streamerName ? `${item.streamerName} | ` : ""}
                            {item.scheduledAt ? `${dateLabel(item.scheduledAt.slice(0, 10))} | ` : ""}
                            {item.errorMessage || "Erreur non detaillee"}
                          </div>
                        </div>
                        <div className="fsb-actions">
                          {href ? (
                            <a
                              className="fsb-btn"
                              href={href}
                              target={isAbsoluteUrl(href) ? "_blank" : undefined}
                              rel={isAbsoluteUrl(href) ? "noreferrer" : undefined}
                            >
                              Ouvrir
                            </a>
                          ) : null}
                          <span className="fsb-tag fsb-tag-error">Erreur</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="fsb-emptyblock">Aucune erreur recente.</div>
                )}
              </div>
            </section>
          </>
        ) : null}
        {section === "agency" ? <FsbAgencySection /> : null}
        {section === "tiktok" ? <FsbTikTokOutreachSection /> : null}
        {section === "scout" ? <FsbScoutSection /> : null}
        {section === "outreach" ? <FsbRumbleOutreachSection /> : null}
        {section === "tools" ? (
          <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Quick-access tool cards */}
            <div className="fsb-grid-3">
              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-indigo">✏️</span>
                    <div>
                      <strong>Editeur des modeles</strong>
                      <div className="fsb-copy">Editeur V1 (tous modeles) ou V3 (wizard rapide M1).</div>
                    </div>
                  </div>
                  <span className="fsb-pill">Actif</span>
                </div>
                <div className="fsb-actions" style={{ marginTop: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link className="fsb-btn fsb-btn-primary" to={editorHref}>
                    Editeur V1
                  </Link>
                  <Link className="fsb-btn fsb-btn-primary" to={editorV3Href}>
                    Editeur V3
                  </Link>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-cyan">📊</span>
                    <div>
                      <strong>Stats videos Instagram</strong>
                      <div className="fsb-copy">Metrics de publication et classement clips.</div>
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-warn">Bientot</span>
                </div>
                <div className="fsb-coming">
                  <div><strong>Nombre de videos publiees</strong>Volume par semaine, mois et total.</div>
                  <div><strong>Classement des tops clips</strong>Les meilleures videos avec acces direct.</div>
                </div>
              </div>

              <div className="fsb-card fsb-module">
                <div className="fsb-sectionhead">
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="fsb-module-icon fsb-module-icon-amber">🔧</span>
                    <div>
                      <strong>Modules a venir</strong>
                      <div className="fsb-copy">Structure prete pour les prochains outils.</div>
                    </div>
                  </div>
                  <span className="fsb-pill fsb-pill-soft">Structure prete</span>
                </div>
                <div className="fsb-coming">
                  <div><strong>Agenda editorial complet</strong>Reels, clips et multi-plateformes.</div>
                  <div><strong>Suivi automation</strong>Etat des jobs et prochaines publications.</div>
                </div>
              </div>
            </div>

            {/* Stream Control — accès rapide */}
            <div className="fsb-card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#dde8ff", marginBottom: 2 }}>🎮 Stream Control</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Activez vos caméras, gérez le chat et suivez les stats en direct</div>
              </div>
              <Link to="/stream-control" className="fsb-btn fsb-btn-primary" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                Ouvrir →
              </Link>
            </div>

            {/* Overlay Designer — full width */}
            <div className="fsb-card" style={{ padding: 24 }}>
              <OverlayDesignerSection />
            </div>
          </section>
        ) : null}
      </section>

      {modalOpen ? (
        <ExpenseModal
          editing={editing}
          form={form}
          saving={saving}
          error={modalError}
          onClose={() => !saving && setModalOpen(false)}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          onSubmit={onSave}
        />
      ) : null}
    </main>
  );
}
