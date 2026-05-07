import * as React from "react";
import {
  addTikTokSeed,
  cancelRun,
  clearRuns,
  contactTikTokInfluencer,
  deleteRun,
  deleteTikTokInfluencer,
  deleteTikTokSeed,
  getActiveRun,
  getRun,
  getTikTokTemplate,
  addTikTokAffilPattern,
  deleteTikTokAffilPattern,
  autoDismissTikTokCelebrities,
  dismissTikTokCandidate,
  enrichTikTokCandidatesBulk,
  enrichTikTokTopCandidates,
  fullResetTikTokNetwork,
  postCandidateFollows,
  postSeedFollows,
  purgeTikTokFollowGraph,
  importSeedNetworkSignals,
  importTikTokBulk,
  importTikTokNetworkHandle,
  listRuns,
  listSeedScannedVideos,
  listTikTokAffilPatterns,
  listTikTokInfluencers,
  listTikTokMessages,
  listTikTokNetworkCandidates,
  listTikTokSeeds,
  logTikTokReply,
  preflightTikTokHandles,
  refreshTikTokSeed,
  saveTikTokTemplate,
  scanTikTokProfile,
  setTikTokInfluencerStatus,
  startDiscoveryRun,
  type TikTokEmailTemplate,
  type TikTokAffilPattern,
  type TikTokInfluencer,
  type TikTokInfluencerStatus,
  type TikTokNetworkCandidate,
  type TikTokNetworkSignalType,
  type TikTokOutreachMessage,
  type TikTokOutreachRun,
  type TikTokOutreachStats,
  type TikTokSeed,
} from "../../lib/api_tiktok_outreach";

const STATUS_LABEL: Record<TikTokInfluencerStatus, string> = {
  new: "À contacter",
  no_email: "Sans email",
  queued: "En attente",
  contacted: "Contacté",
  replied: "A répondu",
  interested: "Intéressé",
  declined: "Refusé",
  blacklisted: "Blacklist",
};

const STATUS_COLOR: Record<TikTokInfluencerStatus, string> = {
  new: "#22d3ee",
  no_email: "#94a3b8",
  queued: "#a5b4fc",
  contacted: "#f59e0b",
  replied: "#a855f7",
  interested: "#10b981",
  declined: "#f04e4e",
  blacklisted: "#475569",
};

const FILTERS: Array<{ value: TikTokInfluencerStatus | "all"; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "new", label: "À contacter" },
  { value: "contacted", label: "Contactés" },
  { value: "replied", label: "Réponses" },
  { value: "interested", label: "Intéressés" },
  { value: "declined", label: "Refusés" },
  { value: "no_email", label: "Sans email" },
];

const SECTION_CSS = `
.tk{display:flex;flex-direction:column;gap:18px}
.tk-hero{
  display:grid;grid-template-columns:1.4fr 1fr;gap:18px;
}
@media (max-width:980px){.tk-hero{grid-template-columns:1fr}}
.tk-hero-card{
  border:1px solid var(--bd);border-radius:20px;padding:22px;
  background:
    radial-gradient(ellipse 100% 60% at 0% 0%,rgba(255,0,80,.10),transparent 60%),
    radial-gradient(ellipse 100% 60% at 100% 100%,rgba(0,242,234,.10),transparent 60%),
    linear-gradient(160deg,rgba(255,255,255,.028) 0%,transparent 60%),var(--panel);
  box-shadow:0 2px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
}
.tk-hero-title{margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.04em}
.tk-hero-sub{color:var(--muted);font-size:13px;line-height:1.55;margin:0 0 14px}
.tk-form{display:flex;gap:10px;flex-wrap:wrap;align-items:stretch}
.tk-input{
  flex:1;min-width:240px;border-radius:12px;border:1px solid var(--bd);
  background:var(--surface);color:var(--text);font:inherit;font-size:14px;padding:12px 14px;outline:none;
  transition:border-color .15s,box-shadow .15s;
}
.tk-input:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px}
.tk-stat{
  border:1px solid var(--bd);border-radius:14px;background:var(--surface);padding:13px 14px;
  position:relative;overflow:hidden;
}
.tk-stat::before{content:'';position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,#ff0050,#00f2ea);border-radius:14px 14px 0 0}
.tk-stat small{display:block;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:10px;font-weight:800}
.tk-stat strong{display:block;margin-top:8px;font-size:24px;font-weight:800;letter-spacing:-.04em;line-height:1}
.tk-filterbar{display:flex;gap:6px;flex-wrap:wrap;background:var(--panel);border:1px solid var(--bd);border-radius:14px;padding:5px}
.tk-filter{
  border-radius:10px;border:1px solid transparent;font:inherit;font-size:12px;font-weight:700;
  background:transparent;color:var(--muted);cursor:pointer;padding:7px 13px;letter-spacing:.01em;
  transition:color .15s,background .15s;
}
.tk-filter:hover{color:var(--text);background:rgba(255,255,255,.05)}
.tk-filter-active{
  background:linear-gradient(135deg,#ff0050 0%,#a855f7 100%);
  color:#fff !important;box-shadow:0 4px 18px rgba(255,0,80,.32);
}
.tk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.tk-card{
  border:1px solid var(--bd);border-radius:18px;padding:16px;background:var(--panel);
  display:flex;flex-direction:column;gap:12px;transition:border-color .15s,transform .15s;
  position:relative;overflow:hidden;
}
.tk-card:hover{border-color:var(--bd-s);transform:translateY(-2px)}
.tk-card-head{display:flex;gap:12px;align-items:center}
.tk-avatar{
  width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#ff0050,#00f2ea);
  display:grid;place-items:center;font-weight:800;color:#fff;font-size:18px;flex-shrink:0;
  overflow:hidden;
}
.tk-avatar img{width:100%;height:100%;object-fit:cover}
.tk-card-name{font-weight:800;font-size:15px;letter-spacing:-.01em;line-height:1.2}
.tk-card-handle{color:var(--muted);font-size:12px;margin-top:2px;display:block}
.tk-card-handle a{color:inherit;text-decoration:none}
.tk-card-handle a:hover{color:var(--cyan)}
.tk-status-dot{
  display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;
  padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.05);
  border:1px solid rgba(255,255,255,.08);text-transform:uppercase;letter-spacing:.04em;
}
.tk-status-dot::before{content:'';width:7px;height:7px;border-radius:50%;background:currentColor}
.tk-card-stats{
  display:grid;grid-template-columns:repeat(3,1fr);gap:8px;
  padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.025);
  border:1px solid rgba(255,255,255,.04);
}
.tk-card-stat{font-size:11px;color:var(--muted);text-align:center}
.tk-card-stat strong{display:block;color:var(--text);font-size:14px;margin-bottom:2px}
.tk-card-bio{
  color:var(--muted);font-size:12px;line-height:1.5;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
  min-height:54px;
}
.tk-card-email{
  display:flex;gap:8px;align-items:center;padding:9px 12px;border-radius:11px;
  background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.22);
  font-size:12px;font-weight:700;color:#34d399;word-break:break-all;
}
.tk-card-email-empty{
  background:rgba(148,163,184,.06);border-color:rgba(148,163,184,.15);color:var(--muted);
}
.tk-card-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
.tk-card-actions .fsb-btn{flex:1;min-width:90px;padding:8px 12px;font-size:12px}
.tk-empty{
  text-align:center;padding:60px 30px;border:1px dashed var(--bd);border-radius:18px;
  color:var(--muted);background:var(--panel);
}
.tk-empty strong{display:block;color:var(--text);font-size:16px;margin-bottom:6px}
.tk-warn{
  padding:11px 14px;border-radius:12px;
  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.28);
  color:#fbbf24;font-size:12.5px;
}
.tk-modal-back{
  position:fixed;inset:0;background:rgba(4,8,24,.82);backdrop-filter:blur(14px);
  display:grid;place-items:center;padding:16px;z-index:120;
}
.tk-modal{
  width:min(640px,100%);max-height:88vh;overflow:auto;padding:24px;
  border:1px solid var(--bd-s);border-radius:20px;
  background:linear-gradient(160deg,rgba(255,0,80,.06) 0%,transparent 50%),var(--panel);
  box-shadow:0 40px 100px rgba(0,0,0,.65);
}
.tk-modal h3{margin:0 0 6px;font-size:18px;font-weight:800;letter-spacing:-.02em}
.tk-modal-sub{color:var(--muted);font-size:13px;margin:0 0 16px}
.tk-textarea{
  width:100%;box-sizing:border-box;border-radius:11px;border:1px solid var(--bd);
  background:var(--surface);color:var(--text);font:inherit;font-size:13px;padding:12px 14px;
  min-height:180px;resize:vertical;outline:none;
}
.tk-textarea:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;flex-wrap:wrap}
.tk-msg{
  padding:11px 13px;border-radius:11px;border:1px solid var(--bd);background:rgba(255,255,255,.025);
  font-size:12.5px;line-height:1.55;
}
.tk-msg-out{border-color:rgba(99,102,241,.28);background:rgba(99,102,241,.06)}
.tk-msg-in{border-color:rgba(16,185,129,.28);background:rgba(16,185,129,.06)}
.tk-msg-meta{font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
.tk-spin{
  display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.18);
  border-top-color:#fff;border-radius:50%;animation:tk-spin .7s linear infinite;
}
@keyframes tk-spin{to{transform:rotate(360deg)}}

.tk-discovery{
  border:1px solid var(--bd);border-radius:20px;padding:22px;
  background:
    radial-gradient(ellipse 80% 60% at 100% 0%,rgba(168,85,247,.10),transparent 60%),
    radial-gradient(ellipse 80% 60% at 0% 100%,rgba(34,211,238,.08),transparent 60%),
    linear-gradient(160deg,rgba(255,255,255,.028) 0%,transparent 60%),var(--panel);
  box-shadow:0 2px 18px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.05);
}
.tk-disc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:14px}
.tk-disc-field{display:grid;gap:6px}
.tk-disc-field label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:800}
.tk-chips{display:flex;gap:6px;flex-wrap:wrap;padding:8px;border:1px solid var(--bd);background:var(--surface);border-radius:11px;min-height:42px;align-items:center}
.tk-chips input{background:transparent;border:none;outline:none;color:var(--text);font:inherit;font-size:13px;flex:1;min-width:120px;padding:4px}
.tk-chip{
  display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
  background:linear-gradient(135deg,rgba(255,0,80,.18),rgba(168,85,247,.18));
  border:1px solid rgba(168,85,247,.32);font-size:12px;font-weight:700;color:#fff;
}
.tk-chip button{background:transparent;border:none;color:rgba(255,255,255,.7);cursor:pointer;padding:0;font-size:14px;line-height:1}
.tk-chip button:hover{color:#fff}
.tk-disc-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;align-items:center}
.tk-progress{
  margin-top:14px;padding:14px 16px;border-radius:14px;border:1px solid rgba(168,85,247,.28);
  background:rgba(168,85,247,.06);
}
.tk-progress-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;font-weight:700}
.tk-progbar{
  margin-top:10px;height:8px;border-radius:4px;background:rgba(255,255,255,.07);overflow:hidden;
}
.tk-progbar-fill{
  height:100%;background:linear-gradient(90deg,#ff0050,#a855f7,#00f2ea);
  transition:width .4s ease;border-radius:4px;
}
.tk-progress-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.tk-progress-stat{font-size:11px;color:var(--muted);text-align:center}
.tk-progress-stat strong{display:block;color:var(--text);font-size:18px;font-weight:800;margin-bottom:2px}
.tk-runs{display:grid;gap:8px;margin-top:14px}
.tk-run{
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  padding:11px 14px;border-radius:12px;border:1px solid var(--bd);background:rgba(255,255,255,.02);
}
.tk-run-meta{font-size:12px;color:var(--muted)}
.tk-run-status{
  display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;
  padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;
}
.tk-run-status::before{content:'';width:6px;height:6px;border-radius:50%;background:currentColor}
.tk-run-done{background:rgba(16,185,129,.1);color:#34d399;border:1px solid rgba(16,185,129,.22)}
.tk-run-running{background:rgba(99,102,241,.1);color:#a5b4fc;border:1px solid rgba(99,102,241,.22)}
.tk-run-error{background:rgba(240,78,78,.1);color:#fc8181;border:1px solid rgba(240,78,78,.22)}
.tk-run-canceled{background:rgba(148,163,184,.08);color:var(--muted);border:1px solid var(--bd)}
.tk-num-input{
  width:90px;border-radius:10px;border:1px solid var(--bd);background:var(--surface);
  color:var(--text);font:inherit;font-size:13px;padding:8px 10px;outline:none;
}
.tk-num-input:focus{border-color:var(--p);box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.tk-disc-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.tk-disc-row label{font-size:13px;color:var(--text);font-weight:600;display:flex;gap:8px;align-items:center}

.tk-net-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:14px}
.tk-seed-card{
  display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:14px;
  border:1px solid var(--bd);background:rgba(255,255,255,.025);
}
.tk-seed-card-head{display:flex;gap:10px;align-items:center}
.tk-seed-avatar{
  width:38px;height:38px;border-radius:50%;background:rgba(168,85,247,.12);
  border:1px solid var(--bd);object-fit:cover;flex-shrink:0;
}
.tk-seed-handle{font-weight:800;font-size:14px;color:var(--text);line-height:1.2}
.tk-seed-meta{font-size:11px;color:var(--muted);margin-top:2px}
.tk-seed-actions{display:flex;gap:6px;margin-top:auto}
.tk-seed-actions button{font-size:12px;padding:6px 10px}
.tk-cand-table{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px;font-size:13px}
.tk-cand-table th{
  text-align:left;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--bd);
}
.tk-cand-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle}
.tk-cand-handle{font-weight:700}
.tk-cand-score{
  display:inline-flex;align-items:center;justify-content:center;min-width:36px;padding:3px 8px;
  border-radius:8px;font-weight:800;font-size:13px;
  background:linear-gradient(135deg,rgba(255,0,80,.18),rgba(168,85,247,.18));
  border:1px solid rgba(168,85,247,.32);color:#fff;
}
.tk-cand-seeds{font-size:11px;color:var(--muted)}
.tk-cand-types{display:inline-flex;gap:4px;flex-wrap:wrap}
.tk-cand-type{
  font-size:10px;padding:2px 7px;border-radius:999px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
  background:rgba(34,211,238,.10);color:#67e8f9;border:1px solid rgba(34,211,238,.22);
}
.tk-cand-imported{font-size:10px;padding:2px 7px;border-radius:999px;font-weight:800;
  background:rgba(16,185,129,.1);color:#34d399;border:1px solid rgba(16,185,129,.22);
}
`;

function fmtCount(value: number | null): string {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const j = Math.round(h / 24);
  if (j < 30) return `il y a ${j}j`;
  return d.toLocaleDateString("fr-FR");
}

const DEFAULT_HASHTAGS = ["casinofr", "casinofrancais", "casinoenligne", "paris_sportifs", "joueurfrancais"];
const COUNTRY_CHOICES = ["FR", "BE", "CH", "MC", "CA", "LU"];

const DEFAULT_BODY = `Salut {{name}},

Je découvre ton compte TikTok et j'aime beaucoup ce que tu fais.

Je m'occupe de LunaLive, une plateforme française autour du streaming et des casinos en ligne. On cherche des créateurs comme toi pour collaborer sur une landing page dédiée (avec ton lien d'affiliation, tes conditions, et un suivi des perfs).

Si l'idée t'intéresse, réponds simplement à ce mail, je t'envoie tous les détails du deal.

À très vite,
L'équipe LunaLive
https://lunalive.win`;

export function FsbTikTokOutreachSection() {
  const [influencers, setInfluencers] = React.useState<TikTokInfluencer[]>([]);
  const [stats, setStats] = React.useState<TikTokOutreachStats | null>(null);
  const [mailReady, setMailReady] = React.useState<boolean>(true);
  const [filter, setFilter] = React.useState<TikTokInfluencerStatus | "all">("all");
  const [scanInput, setScanInput] = React.useState("");
  const [scanning, setScanning] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [scanFlash, setScanFlash] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [contactTarget, setContactTarget] = React.useState<TikTokInfluencer | null>(null);
  const [contactBody, setContactBody] = React.useState(DEFAULT_BODY);
  const [contactSubject, setContactSubject] = React.useState("Collab LunaLive — landing page casino");
  const [contactSending, setContactSending] = React.useState(false);
  const [contactError, setContactError] = React.useState<string | null>(null);
  const [detailTarget, setDetailTarget] = React.useState<TikTokInfluencer | null>(null);
  const [detailMessages, setDetailMessages] = React.useState<TikTokOutreachMessage[]>([]);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [replyText, setReplyText] = React.useState("");

  // Discovery state
  const [discHashtags, setDiscHashtags] = React.useState<string[]>(DEFAULT_HASHTAGS);
  const [discHashtagInput, setDiscHashtagInput] = React.useState("");
  const [discMinFollowers, setDiscMinFollowers] = React.useState(20000);
  const [discMaxFollowers, setDiscMaxFollowers] = React.useState(500000);
  const [discCountries, setDiscCountries] = React.useState<string[]>(["FR"]);
  const [discRequireEmail, setDiscRequireEmail] = React.useState(true);
  const [discMaxProfiles, setDiscMaxProfiles] = React.useState(100);
  const [discError, setDiscError] = React.useState<string | null>(null);
  const [activeRun, setActiveRun] = React.useState<TikTokOutreachRun | null>(null);
  const [pastRuns, setPastRuns] = React.useState<TikTokOutreachRun[]>([]);
  const [extensionVersion, setExtensionVersion] = React.useState<string | null>(null);
  const FALLBACK_TEMPLATE: TikTokEmailTemplate = {
    subject: "Collab LunaLive — landing page casino",
    body: DEFAULT_BODY,
    replyDomain: "lunalive.win",
  };
  const [template, setTemplate] = React.useState<TikTokEmailTemplate | null>(FALLBACK_TEMPLATE);
  const [templateDraft, setTemplateDraft] = React.useState<TikTokEmailTemplate | null>(FALLBACK_TEMPLATE);
  const [templateApiReady, setTemplateApiReady] = React.useState(false);
  const [templateSaving, setTemplateSaving] = React.useState(false);
  const [templateFlash, setTemplateFlash] = React.useState<string | null>(null);
  // Réseau (seeds) state
  const [seedsCollapsed, setSeedsCollapsed] = React.useState(false);
  const [seeds, setSeeds] = React.useState<TikTokSeed[]>([]);
  const [seedsLoading, setSeedsLoading] = React.useState(false);
  const [seedInput, setSeedInput] = React.useState("");
  const [seedAdding, setSeedAdding] = React.useState(false);
  const [seedError, setSeedError] = React.useState<string | null>(null);
  const [refreshingSeedId, setRefreshingSeedId] = React.useState<string | null>(null);
  const [scanQueue, setScanQueue] = React.useState<string[]>([]); // seed ids
  const [candidates, setCandidates] = React.useState<TikTokNetworkCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = React.useState(false);
  const [hideImportedCandidates, setHideImportedCandidates] = React.useState(true);
  const [affilOnlyCandidates, setAffilOnlyCandidates] = React.useState(false);
  const [candidatesDisplayLimit, setCandidatesDisplayLimit] = React.useState(50);
  const [importingCandidate, setImportingCandidate] = React.useState<string | null>(null);
  const [candidateTier, setCandidateTier] = React.useState<
    "peers" | "high" | "long" | "low" | "unknown"
  >("peers");
  // Scan settings
  const [scanVideoLimit, setScanVideoLimit] = React.useState(5);
  const [scanCommentsPerVideo, setScanCommentsPerVideo] = React.useState(30);
  const [affilPatterns, setAffilPatterns] = React.useState<TikTokAffilPattern[]>([]);
  const [newPatternInput, setNewPatternInput] = React.useState("");
  const [newPatternLabel, setNewPatternLabel] = React.useState("");
  const [addingPattern, setAddingPattern] = React.useState(false);
  const [enriching, setEnriching] = React.useState(false);

  const [enrichProgress, setEnrichProgress] = React.useState<string | null>(null);

  const handleEnrichTop = async () => {
    if (enriching) return;
    setEnriching(true);
    try {
      const r = await enrichTikTokTopCandidates(20);
      window.alert(
        `Enrichissement: ${r.enriched}/${r.total} OK (${r.failed} échecs)`
      );
      await reloadCandidates();
    } catch (err: any) {
      window.alert(`Enrich: ${err?.message || err}`);
    } finally {
      setEnriching(false);
    }
  };

  const handleEnrichAll = async () => {
    if (enriching) return;
    setEnriching(true);
    let totalEnriched = 0;
    let totalFailed = 0;
    let rounds = 0;
    try {
      while (rounds < 50) {
        rounds++;
        setEnrichProgress(
          `Batch ${rounds} · ${totalEnriched} enrichis, ${totalFailed} échecs…`
        );
        const r = await enrichTikTokTopCandidates(50);
        totalEnriched += r.enriched;
        totalFailed += r.failed;
        if (r.total === 0) break;
        await reloadCandidates();
      }
      window.alert(
        `Tout enrichir terminé en ${rounds} batch(s) : ${totalEnriched} OK, ${totalFailed} échecs`
      );
    } catch (err: any) {
      window.alert(`Enrich all: ${err?.message || err}`);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
      await reloadCandidates();
    }
  };

  // Helper: demande à l'extension de dumper la /following d'un handle.
  // Renvoie la liste des handles suivis (vide si erreur).
  const dumpFollowingViaExtension = async (
    handle: string,
    timeoutMs = 150_000
  ): Promise<{ ok: boolean; handles: string[]; error?: string; diag?: any }> => {
    return new Promise((resolve) => {
      const requestId = `df-${Date.now()}-${handle}`;
      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data: any = event.data;
        if (!data || data.source !== "lunalive-tiktok-ext") return;
        if (
          data.type === "DUMP_FOLLOWING_RESULT" &&
          data.requestId === requestId
        ) {
          window.removeEventListener("message", handler);
          resolve({
            ok: !!data.ok,
            handles: data.handles || [],
            error: data.error,
            diag: data.diag,
          });
        }
      };
      window.addEventListener("message", handler);
      window.postMessage(
        {
          source: "lunalive-tiktok-page",
          type: "DUMP_FOLLOWING",
          requestId,
          payload: { handle },
        },
        window.location.origin
      );
      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ ok: false, handles: [], error: "extension_timeout" });
      }, timeoutMs);
    });
  };

  // Sprint 1 — pivot vers le graphe de follows.
  // Pour chaque seed actif : ouvre /user/@seed, ouvre la modale /following,
  // scroll jusqu'au plateau, dump tous les handles, persiste en DB.
  const handleScanAllSeedFollows = async () => {
    if (enriching) return;
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    const activeSeeds = seeds.filter((s) => s.isActive !== false);
    if (!activeSeeds.length) {
      window.alert("Aucun seed actif.");
      return;
    }
    if (
      !window.confirm(
        `Scanner la /following de ${activeSeeds.length} seed(s) ? Compte ~30s/seed (page focus, scroll modale, dump). Total ~${Math.ceil(
          (activeSeeds.length * 30) / 60
        )} min.`
      )
    )
      return;

    setEnriching(true);
    let okCount = 0;
    let totalEdges = 0;
    try {
      for (let i = 0; i < activeSeeds.length; i++) {
        const seed = activeSeeds[i];
        setEnrichProgress(
          `Seed ${i + 1}/${activeSeeds.length} · @${seed.handle} · ${totalEdges} liens…`
        );
        const r = await dumpFollowingViaExtension(seed.handle);
        if (!r.ok) continue;
        try {
          const sent = await postSeedFollows(seed.handle, r.handles);
          okCount++;
          totalEdges += sent.count;
        } catch {}
        // Recharger les candidats au fil de l'eau pour voir le score bouger
        if ((i + 1) % 3 === 0) await reloadCandidates();
      }
      window.alert(
        `Scan /following terminé : ${okCount}/${activeSeeds.length} seeds OK, ${totalEdges} liens stockés`
      );
    } catch (err: any) {
      window.alert(`Scan follows: ${err?.message || err}`);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
      await reloadCandidates();
    }
  };

  // Sprint 2 — mutualité. Pour les top N candidats avec follow_overlap >= 1
  // ET pas encore vérifiés, ouvre LEUR /following et stocke pour calculer
  // mutual_count = combien de nos seeds ce candidat suit en retour.
  const handleScanCandidateMutuality = async (topN = 30) => {
    if (enriching) return;
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    // On prend les candidats avec follow_overlap >= 1 et mutualCount non vérifié
    // (= 0 mais peut signifier "jamais checké"). Pour MVP on prend top N par
    // follow_overlap desc avec mutualCount === 0.
    const targets = candidates
      .filter((c) => c.followOverlap >= 1 && c.mutualCount === 0)
      .slice(0, topN);
    if (!targets.length) {
      window.alert("Aucun candidat avec follow_overlap à vérifier.");
      return;
    }
    if (
      !window.confirm(
        `Vérifier la mutualité de ${targets.length} candidat(s) ? Compte ~30s chacun.`
      )
    )
      return;

    setEnriching(true);
    let okCount = 0;
    let mutualsFound = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        const c = targets[i];
        setEnrichProgress(
          `Mutual ${i + 1}/${targets.length} · @${c.handle} · ${mutualsFound} mutuels…`
        );
        const r = await dumpFollowingViaExtension(c.handle);
        if (!r.ok) continue;
        try {
          await postCandidateFollows(c.handle, r.handles);
          okCount++;
          // Compte mutuel local pour feedback (les seeds sont dans `seeds`)
          const seedSet = new Set(seeds.map((s) => s.handle.toLowerCase()));
          const mutual = r.handles.filter((h) =>
            seedSet.has(h.toLowerCase())
          ).length;
          if (mutual >= 1) mutualsFound++;
        } catch {}
        if ((i + 1) % 5 === 0) await reloadCandidates();
      }
      window.alert(
        `Mutualité : ${okCount}/${targets.length} OK, ${mutualsFound} candidats avec ≥1 mutuel`
      );
    } catch (err: any) {
      window.alert(`Mutual: ${err?.message || err}`);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
      await reloadCandidates();
    }
  };

  // ─── FULL RESET ─────────────────────────────────────────────────────────
  const handleFullReset = async () => {
    if (
      !window.confirm(
        "🚨 RESET COMPLET du réseau de découverte ?\n\n" +
          "→ Vide : signaux network, seed_follows, candidate_follows, candidate_profiles, dismissed, scanned_videos\n" +
          "→ Conserve : tes 11 seeds (cards), DSB influencers, patterns affil\n\n" +
          "Tu repartiras de zéro pour reconstruire le réseau."
      )
    )
      return;
    if (!window.confirm("Vraiment ? Cette action est irréversible.")) return;
    try {
      const r = await fullResetTikTokNetwork();
      const c = r.cleared;
      window.alert(
        `Reset OK :\n` +
          `• ${c.network_links} signaux network\n` +
          `• ${c.seed_follows} seed_follows\n` +
          `• ${c.candidate_follows} candidate_follows\n` +
          `• ${c.candidate_profiles} profils enrichis\n` +
          `• ${c.dismissed} dismissed\n` +
          `• ${c.scanned_videos} scanned_videos`
      );
      await reloadCandidates();
      await reloadSeeds();
    } catch (err: any) {
      window.alert(`Reset: ${err?.message || err}`);
    }
  };

  // ─── TESTS ISOLÉS ───────────────────────────────────────────────────────
  const handleTestFollowingScroll = async () => {
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    const handle = window.prompt(
      "Handle TikTok à tester (ex: lecasinoze) :",
      seeds[0]?.handle || ""
    );
    if (!handle) return;
    setEnriching(true);
    setEnrichProgress(`Test /following @${handle}…`);
    try {
      const r = await dumpFollowingViaExtension(handle);
      const sample = r.handles.slice(0, 10).join(", ");
      // Toujours logger le diag complet en console pour debug
      // eslint-disable-next-line no-console
      console.log("[Test /following diag]", r);
      const diagShort = r.diag
        ? `\n\nDiag (résumé) :\n` +
          (r.diag.preSnap
            ? `• preSnap: followBtns=${r.diag.preSnap.followBtns}, anchors=${r.diag.preSnap.anchors}, hasUserList=${r.diag.preSnap.hasUserListContainer}\n`
            : "") +
          (Array.isArray(r.diag.attempts)
            ? `• ${r.diag.attempts.length} attempt(s)\n` +
              r.diag.attempts
                .map((a: any, i: number) => {
                  const rectFound = a.rectInfo?.found;
                  const last = a.lastCheck;
                  return `  [${i}] rect=${rectFound ? "yes" : "no"} (text="${a.rectInfo?.text?.slice(0, 30) || "-"}") · click=${a.click?.ok ? "ok" : "no"} · lastCheck=${last ? `open=${last.open}, anchors=${last.anchors}, follow=${last.followBtns}` : "null"}`;
                })
                .join("\n")
            : "") +
          `\n(diag complet en console F12)`
        : "";
      let msg: string;
      if (!r.ok) {
        if (r.error === "private_account") {
          msg = `🔒 @${handle} a un COMPTE PRIVÉ\n\nLa /following n'est pas accessible.${diagShort}`;
        } else if (r.error === "modal_not_opened") {
          msg = `❌ La modale Following ne s'est pas ouverte${diagShort}`;
        } else {
          msg = `❌ TEST /following @${handle} ÉCHEC\nErreur : ${r.error}${diagShort}`;
        }
      } else {
        const sa = r.diag?.scrollAnchors;
        const scrollStr = Array.isArray(sa) && sa.length
          ? `\n\nScroll progression : ${sa.length} ticks · final ${sa[sa.length - 1]} anchors\n  ${sa.slice(0, 20).join(" → ")}${sa.length > 20 ? "…" : ""}`
          : "";
        msg =
          `✅ TEST /following @${handle}\n\n` +
          `${r.handles.length} handles capturés\n` +
          `Exemple : ${sample}${r.handles.length > 10 ? "…" : ""}` +
          scrollStr +
          (r.handles.length < 30
            ? "\n⚠️ Peu de résultats — la modale a peut-être stoppé tôt"
            : "\n👍 Volume cohérent");
      }
      window.alert(msg);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
    }
  };

  const handleTestVideoComments = async () => {
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    const url = window.prompt(
      "URL TikTok vidéo (ex: https://www.tiktok.com/@xxx/video/1234567890) :",
      ""
    );
    if (!url) return;
    setEnriching(true);
    setEnrichProgress(`Test commentaires…`);
    try {
      const result = await new Promise<{
        ok: boolean;
        commenters: string[];
        desc?: string;
        error?: string;
        diag?: any;
      }>((resolve) => {
        const requestId = `tvc-${Date.now()}`;
        const handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          const data: any = event.data;
          if (!data || data.source !== "lunalive-tiktok-ext") return;
          if (
            data.type === "TEST_VIDEO_COMMENTS_RESULT" &&
            data.requestId === requestId
          ) {
            window.removeEventListener("message", handler);
            resolve({
              ok: !!data.ok,
              commenters: data.commenters || [],
              desc: data.desc,
              error: data.error,
              diag: data.diag,
            });
          }
        };
        window.addEventListener("message", handler);
        window.postMessage(
          {
            source: "lunalive-tiktok-page",
            type: "TEST_VIDEO_COMMENTS",
            requestId,
            payload: { videoUrl: url },
          },
          window.location.origin
        );
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve({ ok: false, commenters: [], error: "extension_timeout" });
        }, 100_000);
      });
      // eslint-disable-next-line no-console
      console.log("[Test commentaires diag]", result);
      const sample = result.commenters.slice(0, 10).join(", ");
      const tab = result.diag?.tab;
      const scroll = tab?.scroll;
      const tabStr = tab
        ? `\n\nDiag onglet "Commentaires" :\n` +
          `• debugger attaché : ${tab.attached ? "✓" : "✗"}\n` +
          `• onglet trouvé : ${tab.foundTab ? "✓" : "✗"}` +
          (tab.rectInfo ? ` (text="${tab.rectInfo.text || ""}")` : "") +
          `\n` +
          `• clic trusted : ${tab.clicked ? "✓" : "✗"}\n` +
          `• comment-list après clic : ${
            tab.commentListAfter?.hasList
              ? `✓ (${tab.commentListAfter.commentNodes} initial)`
              : "✗"
          }\n` +
          (scroll
            ? `• scroll : ${scroll.ticks} ticks · counts ${
                scroll.counts ? scroll.counts.slice(0, 15).join("→") : "—"
              }${scroll.counts?.length > 15 ? "…" : ""}\n` +
              `• scroller class: ${(scroll.lastTarget || "").slice(0, 40)}\n` +
              `• scrollTop=${scroll.lastScrollTop} / scrollHeight=${scroll.lastScrollHeight}\n`
            : "") +
          `(diag complet en console F12)`
        : "";
      const msg = result.ok
        ? `✅ TEST commentaires\n\n` +
          `${result.commenters.length} commentateurs capturés\n` +
          `Exemple : ${sample}${result.commenters.length > 10 ? "…" : ""}\n` +
          `Description : ${(result.desc || "").slice(0, 120)}…` +
          (result.commenters.length < 10
            ? "\n⚠️ Peu — le scroll a peut-être stoppé tôt"
            : "\n👍 Volume OK") +
          tabStr
        : `❌ TEST commentaires ÉCHEC\nErreur : ${result.error}${tabStr}`;
      window.alert(msg);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
    }
  };

  const handleTestProfileEnrich = async () => {
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    const handle = window.prompt(
      "Handle TikTok à enrichir en test (ex: popcorn) :",
      ""
    );
    if (!handle) return;
    setEnriching(true);
    setEnrichProgress(`Test enrich @${handle}…`);
    try {
      const result = await new Promise<{ ok: boolean; profiles: any[]; error?: string }>(
        (resolve) => {
          const requestId = `tpe-${Date.now()}`;
          const handler = (event: MessageEvent) => {
            if (event.source !== window) return;
            const data: any = event.data;
            if (!data || data.source !== "lunalive-tiktok-ext") return;
            if (
              data.type === "SCRAPE_PROFILES_RESULT" &&
              data.requestId === requestId
            ) {
              window.removeEventListener("message", handler);
              resolve({
                ok: !!data.ok,
                profiles: data.profiles || [],
                error: data.error,
              });
            }
          };
          window.addEventListener("message", handler);
          window.postMessage(
            {
              source: "lunalive-tiktok-page",
              type: "SCRAPE_PROFILES",
              requestId,
              payload: { handles: [handle] },
            },
            window.location.origin
          );
          setTimeout(() => {
            window.removeEventListener("message", handler);
            resolve({ ok: false, profiles: [], error: "extension_timeout" });
          }, 60_000);
        }
      );
      const p = result.profiles[0];
      const msg = p
        ? `✅ TEST enrich @${handle}\n\n` +
          `displayName: ${p.displayName}\n` +
          `followers: ${p.followerCount?.toLocaleString() || "?"}\n` +
          `videos: ${p.videoCount || "?"}\n` +
          `bio: ${(p.bio || "").slice(0, 120)}\n` +
          `bioEmail: ${p.bioEmail || "—"}\n` +
          `verified: ${p.verified ? "✓" : "—"}\n` +
          `region: ${p.region || "—"}\n` +
          `source: ${p.source}`
        : `❌ TEST enrich @${handle} ÉCHEC\n\nErreur : ${result.error}`;
      window.alert(msg);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
    }
  };

  // ─── PIPELINE COMPLÈTE AUTO ─────────────────────────────────────────────
  const handleFullPipeline = async () => {
    if (enriching) return;
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée.");
      return;
    }
    if (
      !window.confirm(
        "🚀 LANCER PIPELINE COMPLÈTE\n\n" +
          "Étapes (séquentiel) :\n" +
          "1. Scanner /following de tous les seeds → graphe initial\n" +
          "2. Enrichir profils des candidats (bio, followers)\n" +
          "3. Vérifier mutualité top 50 candidats\n" +
          "4. Auto-dismiss célébrités/hors-niche\n" +
          "5. Reload final\n\n" +
          `Compte ~${seeds.length * 0.5 + 30} min total. Continuer ?`
      )
    )
      return;

    setEnriching(true);
    try {
      // Étape 1: scan /following de tous les seeds
      setEnrichProgress("Pipeline 1/5 — scan /following seeds…");
      const activeSeeds = seeds.filter((s) => s.isActive !== false);
      let seedOk = 0;
      for (let i = 0; i < activeSeeds.length; i++) {
        const seed = activeSeeds[i];
        setEnrichProgress(
          `1/5 · seed ${i + 1}/${activeSeeds.length} · @${seed.handle}`
        );
        const r = await dumpFollowingViaExtension(seed.handle);
        if (r.ok) {
          try {
            await postSeedFollows(seed.handle, r.handles);
            seedOk++;
          } catch {}
        }
      }
      await reloadCandidates();

      // Étape 2: enrichir profils des candidats actuels
      setEnrichProgress("Pipeline 2/5 — enrichir profils…");
      const toEnrich = candidates
        .filter((c) => c.profile.followerCount == null)
        .map((c) => c.handle);
      let enrichOk = 0;
      const BATCH = 25;
      for (let i = 0; i < toEnrich.length; i += BATCH) {
        const chunk = toEnrich.slice(i, i + BATCH);
        setEnrichProgress(
          `2/5 · enrich ${Math.min(i + BATCH, toEnrich.length)}/${toEnrich.length}`
        );
        const requestId = `pp-enr-${Date.now()}-${i}`;
        const result = await new Promise<{ ok: boolean; profiles: any[] }>(
          (resolve) => {
            const handler = (event: MessageEvent) => {
              if (event.source !== window) return;
              const data: any = event.data;
              if (!data || data.source !== "lunalive-tiktok-ext") return;
              if (
                data.type === "SCRAPE_PROFILES_RESULT" &&
                data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                resolve({ ok: !!data.ok, profiles: data.profiles || [] });
              }
            };
            window.addEventListener("message", handler);
            window.postMessage(
              {
                source: "lunalive-tiktok-page",
                type: "SCRAPE_PROFILES",
                requestId,
                payload: { handles: chunk },
              },
              window.location.origin
            );
            setTimeout(() => {
              window.removeEventListener("message", handler);
              resolve({ ok: false, profiles: [] });
            }, chunk.length * 15_000 + 60_000);
          }
        );
        if (result.ok && result.profiles.length) {
          try {
            const r = await enrichTikTokCandidatesBulk(result.profiles);
            enrichOk += r.upserted;
          } catch {}
        }
      }
      await reloadCandidates();

      // Étape 3: mutualité top 50
      setEnrichProgress("Pipeline 3/5 — mutualité top 50…");
      const fresh = await reloadCandidates();
      void fresh;
      const mutTargets = candidates
        .filter((c) => c.followOverlap >= 1 && c.mutualCount === 0)
        .slice(0, 50);
      let mutOk = 0;
      for (let i = 0; i < mutTargets.length; i++) {
        setEnrichProgress(
          `3/5 · mutual ${i + 1}/${mutTargets.length} · @${mutTargets[i].handle}`
        );
        const r = await dumpFollowingViaExtension(mutTargets[i].handle);
        if (r.ok) {
          try {
            await postCandidateFollows(mutTargets[i].handle, r.handles);
            mutOk++;
          } catch {}
        }
      }
      await reloadCandidates();

      // Étape 4: auto-dismiss célébrités
      setEnrichProgress("Pipeline 4/5 — auto-dismiss célébrités…");
      let dismissed = 0;
      try {
        const r = await autoDismissTikTokCelebrities(false);
        dismissed = r.dismissed;
      } catch {}

      // Étape 5: reload
      setEnrichProgress("Pipeline 5/5 — reload final…");
      await reloadCandidates();

      window.alert(
        `🚀 Pipeline terminée\n\n` +
          `1) Seeds /following : ${seedOk}/${activeSeeds.length}\n` +
          `2) Profils enrichis : ${enrichOk}\n` +
          `3) Mutualité vérifiée : ${mutOk}/${mutTargets.length}\n` +
          `4) Auto-dismissed : ${dismissed}\n\n` +
          `Va voir l'onglet 🟢 Peers — c'est ta liste exploitable.`
      );
    } catch (err: any) {
      window.alert(`Pipeline: ${err?.message || err}`);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
      await reloadCandidates();
    }
  };

  const handlePurgeFollowGraph = async () => {
    if (
      !window.confirm(
        "Purger COMPLÈTEMENT le graphe de follows ?\n\n" +
          "→ supprime tiktok_seed_follows + tiktok_candidate_follows + signaux 'following' dans network_links\n" +
          "→ utile si les anciens scrapes ont capturé des suggestions TikTok au lieu des vrais /following\n" +
          "→ tu devras relancer 📡 Scanner /following seeds après"
      )
    )
      return;
    try {
      const r = await purgeTikTokFollowGraph();
      window.alert(
        `Purge OK : ${r.deletedSeedFollows} seed_follows, ${r.deletedCandidateFollows} candidate_follows, ${r.deletedFollowingLinks} signaux 'following'`
      );
      await reloadCandidates();
    } catch (err: any) {
      window.alert(`Purge: ${err?.message || err}`);
    }
  };

  const handleAutoDismissCelebrities = async () => {
    try {
      const dryRun = await autoDismissTikTokCelebrities(true);
      const sample = dryRun.preview
        .map((p) => `@${p.handle} (${p.reason})`)
        .join("\n");
      const msg = `${dryRun.dismissed} candidat(s) seraient marqués hors-niche sur ${dryRun.candidatesAnalyzed} analysés.\n\nÉchantillon :\n${sample || "(aucun)"}\n\nConfirmer ?`;
      if (!window.confirm(msg)) return;
      const result = await autoDismissTikTokCelebrities(false);
      window.alert(`Auto-dismiss : ${result.dismissed} candidats retirés.`);
      await reloadCandidates();
    } catch (err: any) {
      window.alert(`Auto-dismiss: ${err?.message || err}`);
    }
  };

  // Enrichissement via l'extension (utilise la session connectée du user)
  // → contourne le blocage Cloudflare côté serveur Render
  const handleEnrichViaExtension = async () => {
    if (enriching) return;
    if (!extensionVersion) {
      window.alert("Extension TikTok non détectée. Installe-la d'abord.");
      return;
    }
    const unenriched = candidates
      .filter((c) => c.profile.followerCount == null)
      .map((c) => c.handle);
    if (unenriched.length === 0) {
      window.alert("Tous les candidats sont déjà enrichis.");
      return;
    }
    if (
      !window.confirm(
        `Enrichir ${unenriched.length} candidat(s) via l'extension ? Une page TikTok sera ouverte ~1s par profil (en arrière-plan). Compte ~${Math.ceil(
          (unenriched.length * 4) / 60
        )} min.`
      )
    )
      return;

    setEnriching(true);
    let totalUpserted = 0;
    let totalFailed = 0;
    const BATCH = 25;
    try {
      for (let i = 0; i < unenriched.length; i += BATCH) {
        const chunk = unenriched.slice(i, i + BATCH);
        setEnrichProgress(
          `Ext ${Math.floor(i / BATCH) + 1}/${Math.ceil(
            unenriched.length / BATCH
          )} · ${totalUpserted} OK…`
        );

        const requestId = `enr-${Date.now()}-${i}`;
        const result = await new Promise<{ ok: boolean; profiles: any[]; error?: string }>(
          (resolve) => {
            const handler = (event: MessageEvent) => {
              if (event.source !== window) return;
              const data: any = event.data;
              if (!data || data.source !== "lunalive-tiktok-ext") return;
              if (
                data.type === "SCRAPE_PROFILES_RESULT" &&
                data.requestId === requestId
              ) {
                window.removeEventListener("message", handler);
                resolve({
                  ok: !!data.ok,
                  profiles: data.profiles || [],
                  error: data.error,
                });
              }
            };
            window.addEventListener("message", handler);
            window.postMessage(
              {
                source: "lunalive-tiktok-page",
                type: "SCRAPE_PROFILES",
                requestId,
                payload: { handles: chunk },
              },
              window.location.origin
            );
            setTimeout(() => {
              window.removeEventListener("message", handler);
              resolve({ ok: false, profiles: [], error: "extension_timeout" });
            }, chunk.length * 15_000 + 60_000);
          }
        );

        if (!result.ok || result.profiles.length === 0) {
          totalFailed += chunk.length;
          continue;
        }
        try {
          const r = await enrichTikTokCandidatesBulk(result.profiles);
          totalUpserted += r.upserted;
          totalFailed += chunk.length - r.upserted;
        } catch {
          totalFailed += chunk.length;
        }
        await reloadCandidates();
      }
      window.alert(
        `Enrichissement via extension : ${totalUpserted} OK, ${totalFailed} échecs sur ${unenriched.length}`
      );
    } catch (err: any) {
      window.alert(`Enrich via ext: ${err?.message || err}`);
    } finally {
      setEnrichProgress(null);
      setEnriching(false);
      await reloadCandidates();
    }
  };

  const reloadSeeds = React.useCallback(async () => {
    setSeedsLoading(true);
    try {
      const res = await listTikTokSeeds();
      setSeeds(res.seeds);
    } catch (err: any) {
      setSeedError(`Chargement seeds: ${err?.message || err}`);
    } finally {
      setSeedsLoading(false);
    }
  }, []);

  const reloadCandidates = React.useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const res = await listTikTokNetworkCandidates({
        limit: 500,
        excludeImported: hideImportedCandidates,
        affilOnly: affilOnlyCandidates,
      });
      setCandidates(res.candidates);
    } catch {
      // silencieux : pas critique
    } finally {
      setCandidatesLoading(false);
    }
  }, [hideImportedCandidates, affilOnlyCandidates]);

  const reloadAffilPatterns = React.useCallback(async () => {
    try {
      const r = await listTikTokAffilPatterns();
      setAffilPatterns(r.patterns);
    } catch {
      setAffilPatterns([]);
    }
  }, []);

  React.useEffect(() => {
    reloadSeeds();
    reloadCandidates();
    reloadAffilPatterns();
  }, [reloadSeeds, reloadCandidates, reloadAffilPatterns]);

  const handleAddPattern = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = newPatternInput.trim();
    if (!p || addingPattern) return;
    setAddingPattern(true);
    try {
      await addTikTokAffilPattern(p, newPatternLabel.trim() || undefined);
      setNewPatternInput("");
      setNewPatternLabel("");
      await reloadAffilPatterns();
    } catch (err: any) {
      window.alert(`Pattern: ${err?.message || err}`);
    } finally {
      setAddingPattern(false);
    }
  };

  const handleDeletePattern = async (id: string) => {
    try {
      await deleteTikTokAffilPattern(id);
      await reloadAffilPatterns();
    } catch (err: any) {
      window.alert(`Suppression: ${err?.message || err}`);
    }
  };

  const handleAddSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seedInput.trim() || seedAdding) return;
    setSeedAdding(true);
    setSeedError(null);
    try {
      await addTikTokSeed(seedInput.trim());
      setSeedInput("");
      await reloadSeeds();
    } catch (err: any) {
      const msg = String(err?.message || err);
      setSeedError(msg === "invalid_handle" ? "Handle/URL invalide" : msg);
    } finally {
      setSeedAdding(false);
    }
  };

  const handleRefreshSeed = async (seed: TikTokSeed) => {
    if (refreshingSeedId) return;
    setRefreshingSeedId(seed.id);
    try {
      const res = await refreshTikTokSeed(seed.id);
      await reloadSeeds();
      await reloadCandidates();
      if (!res.added) {
        window.alert(
          `Aucun signal récupéré pour @${seed.handle}.\nTikTok bloque peut-être le scraping. Réessaie ou vérifie le worker.`
        );
      }
    } catch (err: any) {
      window.alert(`Refresh: ${err?.message || err}`);
    } finally {
      setRefreshingSeedId(null);
    }
  };

  // Scan via extension — retourne un résumé pour la queue (sans alert si silent=true)
  const runSeedExtensionScan = async (
    seed: TikTokSeed,
    opts?: { silent?: boolean }
  ): Promise<{ ok: boolean; added?: number; received?: number; error?: string }> => {
    if (!extensionVersion) {
      if (!opts?.silent) {
        window.alert(
          "L'extension LunaLive TikTok Discoverer n'est pas détectée.\nInstalle/active-la et rafraîchis la page."
        );
      }
      return { ok: false, error: "extension_missing" };
    }

    const requestId = `seedNet-${seed.id}-${Date.now()}`;

    // Fetch already-scraped video URLs to skip them
    let excludeVideoUrls: string[] = [];
    try {
      const sv = await listSeedScannedVideos(seed.id);
      excludeVideoUrls = sv.videos.map((v) => v.url);
    } catch {
      // pas grave, on scrape sans skip
    }

    try {
      const result: {
        ok: boolean;
        signals: Array<{
          handle: string;
          type: TikTokNetworkSignalType;
          sourceVideoUrl?: string | null;
        }>;
        videosScraped: number;
        videosSkipped?: number;
        scannedVideoUrls?: string[];
        affilVideosCount?: number;
        error?: string;
        diag?: any;
      } = await new Promise((resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          const data: any = event.data;
          if (!data || data.source !== "lunalive-tiktok-ext") return;
          if (data.type === "SEED_NETWORK_RESULT" && data.requestId === requestId) {
            window.removeEventListener("message", handler);
            resolve({
              ok: !!data.ok,
              signals: data.signals || [],
              videosScraped: data.videosScraped || 0,
              videosSkipped: data.videosSkipped || 0,
              scannedVideoUrls: data.scannedVideoUrls || [],
              affilVideosCount: data.affilVideosCount || 0,
              error: data.error,
              diag: data.diag,
            });
          }
        };
        window.addEventListener("message", handler);
        window.postMessage(
          {
            source: "lunalive-tiktok-page",
            type: "SEED_NETWORK",
            requestId,
            payload: {
              seedHandle: seed.handle,
              videoLimit: scanVideoLimit,
              commentsPerVideo: scanCommentsPerVideo,
              affilPatterns: affilPatterns.map((p) => p.pattern),
              excludeVideoUrls,
            },
          },
          window.location.origin
        );
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve({
            ok: false,
            signals: [],
            videosScraped: 0,
            error: "extension_timeout",
          });
        }, 8 * 60_000);
      });

      if (!result.ok) {
        if (!opts?.silent) {
          window.alert(
            `Extension @${seed.handle}: ${result.error || "no_response"}\n` +
              (result.diag ? JSON.stringify(result.diag, null, 2) : "")
          );
        }
        return { ok: false, error: result.error };
      }

      if (!result.signals.length) {
        if (!opts?.silent) {
          window.alert(
            `Aucun signal capturé sur ${result.videosScraped} vidéos scrapées de @${seed.handle}` +
              (result.videosSkipped
                ? ` (${result.videosSkipped} déjà scannées et skippées)`
                : "") +
              "."
          );
        }
        try {
          await importSeedNetworkSignals(seed.id, [], result.scannedVideoUrls);
        } catch {}
        return { ok: true, added: 0, received: 0 };
      }

      const imp = await importSeedNetworkSignals(
        seed.id,
        result.signals,
        result.scannedVideoUrls
      );
      if (!opts?.silent) {
        window.alert(
          `✅ @${seed.handle}: ${imp.added} signaux importés ` +
            `(${imp.received} reçus, ${result.videosScraped} vidéos scrapées, ` +
            `${result.videosSkipped || 0} skippées, ` +
            `${result.affilVideosCount || 0} avec lien d'affil)`
        );
      }
      return { ok: true, added: imp.added, received: imp.received };
    } catch (err: any) {
      if (!opts?.silent) window.alert(`Refresh extension: ${err?.message || err}`);
      return { ok: false, error: String(err?.message || err) };
    }
  };

  const handleRefreshSeedViaExtension = async (seed: TikTokSeed) => {
    if (refreshingSeedId) {
      // Si un scan tourne déjà : on ajoute en file
      setScanQueue((q) => (q.includes(seed.id) ? q : [...q, seed.id]));
      return;
    }
    setRefreshingSeedId(seed.id);
    try {
      await runSeedExtensionScan(seed);
      await reloadSeeds();
      await reloadCandidates();
    } finally {
      setRefreshingSeedId(null);
    }
  };

  // Queue runner : démarre dès qu'un slot est libre
  React.useEffect(() => {
    if (refreshingSeedId) return;
    if (scanQueue.length === 0) return;
    const [nextId, ...rest] = scanQueue;
    const seed = seeds.find((s) => s.id === nextId);
    if (!seed) {
      setScanQueue(rest);
      return;
    }
    setScanQueue(rest);
    setRefreshingSeedId(nextId);
    (async () => {
      await runSeedExtensionScan(seed, { silent: true });
      await reloadSeeds();
      await reloadCandidates();
      setRefreshingSeedId(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanQueue, refreshingSeedId, seeds]);

  const enqueueAllSeeds = () => {
    if (!extensionVersion) {
      window.alert("Extension non détectée.");
      return;
    }
    const ids = seeds.map((s) => s.id).filter((id) => id !== refreshingSeedId);
    setScanQueue((q) => Array.from(new Set([...q, ...ids])));
  };

  const handleDeleteSeed = async (seed: TikTokSeed) => {
    if (!window.confirm(`Supprimer @${seed.handle} et son réseau ?`)) return;
    try {
      await deleteTikTokSeed(seed.id);
      await reloadSeeds();
      await reloadCandidates();
    } catch (err: any) {
      window.alert(`Suppression: ${err?.message || err}`);
    }
  };

  const handleDismissCandidate = async (handle: string) => {
    if (!window.confirm(`Retirer définitivement @${handle} des candidats ?\nIl ne réapparaîtra plus, même si un seed le redécouvre.`)) return;
    try {
      await dismissTikTokCandidate(handle);
      // optimistic: retire localement avant le reload
      setCandidates((prev) => prev.filter((c) => c.handle !== handle));
      await reloadCandidates();
    } catch (err: any) {
      window.alert(`Dismiss: ${err?.message || err}`);
    }
  };

  const handleImportCandidate = async (handle: string) => {
    if (importingCandidate) return;
    setImportingCandidate(handle);
    try {
      await importTikTokNetworkHandle(handle);
      await reloadCandidates();
      await reload(filter);
    } catch (err: any) {
      window.alert(`Import @${handle}: ${err?.message || err}`);
    } finally {
      setImportingCandidate(null);
    }
  };

  const [localScrape, setLocalScrape] = React.useState<{
    running: boolean;
    events: Array<{ kind: string; source?: string; found?: number; error?: string }>;
    capturedHandles: number;
    alreadyKnown: number;
    profilesScraped: number;
    importedKept: number;
    importedWithEmail: number;
    importedScanned: number;
  } | null>(null);

  const reload = React.useCallback(
    async (which: TikTokInfluencerStatus | "all" = filter) => {
      setLoading(true);
      try {
        const res = await listTikTokInfluencers(which);
        setInfluencers(res.influencers);
        setStats(res.stats);
        setMailReady(res.mailReady);
      } catch (err: any) {
        setScanError(`Chargement: ${err?.message || err}`);
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  React.useEffect(() => {
    reload(filter);
  }, [filter, reload]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanInput.trim() || scanning) return;
    setScanning(true);
    setScanError(null);
    setScanFlash(null);
    try {
      const res = await scanTikTokProfile(scanInput.trim());
      setScanInput("");
      setScanFlash(
        res.influencer.email
          ? `✅ @${res.influencer.handle} ajouté avec email`
          : `⚠️ @${res.influencer.handle} ajouté — aucune email publique trouvée`
      );
      await reload(filter);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const friendly =
        msg === "profile_unreachable"
          ? "Profil introuvable ou bloqué par TikTok"
          : msg === "invalid_handle"
          ? "Handle/URL invalide (ex: @kasinoze ou https://www.tiktok.com/@kasinoze)"
          : msg;
      setScanError(friendly);
    } finally {
      setScanning(false);
    }
  };

  const openContact = (inf: TikTokInfluencer) => {
    setContactTarget(inf);
    setContactBody(template?.body || DEFAULT_BODY);
    setContactSubject(template?.subject || "Collab LunaLive — landing page casino");
    setContactError(null);
  };

  const sendContact = async () => {
    if (!contactTarget || contactSending) return;
    setContactSending(true);
    setContactError(null);
    try {
      await contactTikTokInfluencer(contactTarget.id, {
        subject: contactSubject,
        body: contactBody,
      });
      setContactTarget(null);
      await reload(filter);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const friendly =
        msg === "mail_not_configured"
          ? "Mailer non configuré côté API (Brevo/SMTP manquant)"
          : msg === "no_email"
          ? "Cet influenceur n'a pas d'email enregistré"
          : msg;
      setContactError(friendly);
    } finally {
      setContactSending(false);
    }
  };

  const onChangeStatus = async (inf: TikTokInfluencer, status: TikTokInfluencerStatus) => {
    try {
      await setTikTokInfluencerStatus(inf.id, status);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Statut: ${err?.message || err}`);
    }
  };

  const onDelete = async (inf: TikTokInfluencer) => {
    if (!window.confirm(`Supprimer @${inf.handle} ?`)) return;
    try {
      await deleteTikTokInfluencer(inf.id);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Suppression: ${err?.message || err}`);
    }
  };

  const openDetail = async (inf: TikTokInfluencer) => {
    setDetailTarget(inf);
    setReplyText("");
    setDetailLoading(true);
    setDetailMessages([]);
    try {
      const res = await listTikTokMessages(inf.id);
      setDetailMessages(res.messages);
    } catch {
      // silent
    } finally {
      setDetailLoading(false);
    }
  };

  // ─── Template loading ─────────────────────────────────────────────────
  React.useEffect(() => {
    (async () => {
      try {
        const r = await getTikTokTemplate();
        setTemplate(r.template);
        setTemplateDraft(r.template);
        setTemplateApiReady(true);
      } catch {
        // API endpoint not deployed yet — keep fallback so the editor is visible
        setTemplateApiReady(false);
      }
    })();
  }, []);

  const saveTemplate = async () => {
    if (!templateDraft) return;
    setTemplateSaving(true);
    setTemplateFlash(null);
    try {
      const r = await saveTikTokTemplate(templateDraft);
      setTemplate(r.template);
      setTemplateDraft(r.template);
      setTemplateFlash("✅ Modèle sauvegardé");
      setTimeout(() => setTemplateFlash(null), 3000);
    } catch (err: any) {
      setTemplateFlash(`❌ ${err?.message || err}`);
    } finally {
      setTemplateSaving(false);
    }
  };

  // ─── Extension detection ──────────────────────────────────────────────
  React.useEffect(() => {
    const checkAttr = () => {
      const v = document.documentElement.getAttribute("data-lunalive-tiktok-ext");
      if (v) setExtensionVersion(v);
    };
    checkAttr();
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: any = event.data;
      if (!data || data.source !== "lunalive-tiktok-ext") return;
      if (data.type === "PRESENT" || data.type === "PONG") {
        setExtensionVersion(data.version || "1.0.0");
      }
    };
    window.addEventListener("message", onMsg);
    // Ping in case the extension was loaded before this listener attached
    window.postMessage(
      { source: "lunalive-tiktok-page", type: "PING", requestId: "init" },
      window.location.origin
    );
    const interval = setInterval(checkAttr, 1500);
    setTimeout(() => clearInterval(interval), 6000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(interval);
    };
  }, []);

  // ─── Discovery effects ────────────────────────────────────────────────
  const reloadRuns = React.useCallback(async () => {
    try {
      const res = await listRuns();
      setPastRuns(res.runs);
    } catch {}
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getActiveRun();
        if (!cancelled) setActiveRun(res.run);
      } catch {}
      reloadRuns();
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadRuns]);

  React.useEffect(() => {
    if (!activeRun || activeRun.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const res = await getRun(activeRun.id);
        setActiveRun(res.run);
        if (res.run.status !== "running") {
          await reload(filter);
          await reloadRuns();
        }
      } catch {}
    }, 1500);
    return () => clearInterval(interval);
  }, [activeRun, filter, reload, reloadRuns]);

  const addHashtag = (raw: string) => {
    const cleaned = raw.trim().replace(/^#+/, "").toLowerCase();
    if (!cleaned || !/^[a-z0-9_]{1,40}$/i.test(cleaned)) return;
    if (discHashtags.includes(cleaned)) return;
    setDiscHashtags([...discHashtags, cleaned]);
  };

  const handleHashtagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag(discHashtagInput);
      setDiscHashtagInput("");
    } else if (e.key === "Backspace" && !discHashtagInput && discHashtags.length) {
      setDiscHashtags(discHashtags.slice(0, -1));
    }
  };

  const toggleCountry = (code: string) => {
    setDiscCountries((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
  };

  const launchDiscoveryViaExtension = async () => {
    setLocalScrape({
      running: true,
      events: [],
      capturedHandles: 0,
      alreadyKnown: 0,
      profilesScraped: 0,
      importedKept: 0,
      importedWithEmail: 0,
      importedScanned: 0,
    });
    setDiscError(null);

    const requestId = `disc-${Date.now()}`;
    const allHandles = new Set<string>();

    const onProgress = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: any = event.data;
      if (!data || data.source !== "lunalive-tiktok-ext") return;
      if (data.type === "PROGRESS" && data.event) {
        setLocalScrape((prev) =>
          prev ? { ...prev, events: [...prev.events, data.event] } : prev
        );
        if (data.event.kind === "done" && typeof data.event.found === "number") {
          setLocalScrape((prev) =>
            prev ? { ...prev, capturedHandles: prev.capturedHandles + data.event.found } : prev
          );
        }
      }
    };
    window.addEventListener("message", onProgress);

    const result: { ok: boolean; handles: string[]; error?: string } = await new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.source !== window) return;
        const data: any = event.data;
        if (!data || data.source !== "lunalive-tiktok-ext") return;
        if (data.type === "DISCOVER_RESULT" && data.requestId === requestId) {
          window.removeEventListener("message", handler);
          resolve({ ok: !!data.ok, handles: data.handles || [], error: data.error });
        }
      };
      window.addEventListener("message", handler);
      window.postMessage(
        {
          source: "lunalive-tiktok-page",
          type: "DISCOVER",
          requestId,
          payload: {
            hashtags: discHashtags,
            queries: [],
            limit: discMaxProfiles * 4,
          },
        },
        window.location.origin
      );
      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ ok: false, handles: [], error: "extension_timeout" });
      }, 240_000);
    });

    window.removeEventListener("message", onProgress);

    if (!result.ok) {
      setLocalScrape((prev) => (prev ? { ...prev, running: false } : prev));
      setDiscError(`Extension: ${result.error || "no_response"}`);
      return;
    }

    result.handles.forEach((h) => allHandles.add(h));
    setLocalScrape((prev) => (prev ? { ...prev, capturedHandles: allHandles.size } : prev));

    if (allHandles.size === 0) {
      setLocalScrape((prev) => (prev ? { ...prev, running: false } : prev));
      setDiscError("Aucun créateur capturé sur les pages scannées");
      return;
    }

    // Preflight: split fresh vs already-known to avoid wasted scraping
    const handlesArray = Array.from(allHandles).slice(0, discMaxProfiles);
    let freshHandles: string[] = handlesArray;
    let knownCount = 0;
    try {
      const pre = await preflightTikTokHandles(handlesArray);
      freshHandles = pre.fresh;
      knownCount = pre.known.length;
      setLocalScrape((prev) => (prev ? { ...prev, alreadyKnown: knownCount } : prev));
    } catch {
      // If preflight fails (API not deployed), continue with all handles
    }

    if (freshHandles.length === 0) {
      setLocalScrape((prev) => (prev ? { ...prev, running: false } : prev));
      return;
    }

    // Ask the extension to scrape full profiles in the user's browser
    const profileRequestId = `prof-${Date.now()}`;
    const profilesResult: { ok: boolean; profiles: any[]; error?: string } = await new Promise(
      (resolve) => {
        const handler = (event: MessageEvent) => {
          if (event.source !== window) return;
          const data: any = event.data;
          if (!data || data.source !== "lunalive-tiktok-ext") return;
          if (data.type === "SCRAPE_PROFILES_RESULT" && data.requestId === profileRequestId) {
            window.removeEventListener("message", handler);
            resolve({ ok: !!data.ok, profiles: data.profiles || [], error: data.error });
          }
          if (data.type === "PROGRESS" && data.event) {
            setLocalScrape((prev) =>
              prev
                ? {
                    ...prev,
                    events: [...prev.events, data.event],
                    profilesScraped:
                      data.event.kind === "profile_done"
                        ? prev.profilesScraped + 1
                        : prev.profilesScraped,
                  }
                : prev
            );
          }
        };
        window.addEventListener("message", handler);
        window.postMessage(
          {
            source: "lunalive-tiktok-page",
            type: "SCRAPE_PROFILES",
            requestId: profileRequestId,
            payload: { handles: freshHandles },
          },
          window.location.origin
        );
        // Generous timeout: ~15s per profile (5-try poll + load + throttle) + 90s buffer
        setTimeout(() => {
          window.removeEventListener("message", handler);
          resolve({ ok: false, profiles: [], error: "extension_timeout" });
        }, freshHandles.length * 15_000 + 90_000);
      }
    );

    if (!profilesResult.ok || profilesResult.profiles.length === 0) {
      setLocalScrape((prev) => (prev ? { ...prev, running: false } : prev));
      if (!profilesResult.ok) {
        setDiscError(`Extension scrape profils: ${profilesResult.error || "no_response"}`);
      }
      return;
    }

    // Send pre-scraped profiles to backend (it will filter + upsert without re-scraping)
    const profiles = profilesResult.profiles;
    const chunks: any[][] = [];
    for (let i = 0; i < profiles.length; i += 50) chunks.push(profiles.slice(i, i + 50));

    let totalScanned = 0;
    let totalWithEmail = 0;
    let totalKept = 0;

    for (const chunk of chunks) {
      try {
        const r = await importTikTokBulk({
          profiles: chunk,
          source: `extension:${discHashtags.join(",")}`,
          requireEmail: discRequireEmail,
          minFollowers: discMinFollowers,
          maxFollowers: discMaxFollowers,
          countries: discCountries,
        });
        totalScanned += r.scanned;
        totalWithEmail += r.withEmail;
        totalKept += r.kept;
        setLocalScrape((prev) =>
          prev
            ? {
                ...prev,
                importedScanned: totalScanned,
                importedWithEmail: totalWithEmail,
                importedKept: totalKept,
              }
            : prev
        );
      } catch (err: any) {
        setDiscError(`Import: ${err?.message || err}`);
      }
    }

    setLocalScrape((prev) => (prev ? { ...prev, running: false } : prev));
    await reload(filter);
  };

  const launchDiscovery = async () => {
    if (discHashtags.length === 0) {
      setDiscError("Ajoute au moins un hashtag");
      return;
    }
    if (extensionVersion) {
      // Local scraping via browser extension
      await launchDiscoveryViaExtension();
      return;
    }
    setDiscError(null);
    try {
      const res = await startDiscoveryRun({
        hashtags: discHashtags,
        minFollowers: discMinFollowers,
        maxFollowers: discMaxFollowers,
        countries: discCountries,
        requireEmail: discRequireEmail,
        maxProfiles: discMaxProfiles,
      });
      const run = await getRun(res.runId);
      setActiveRun(run.run);
      await reloadRuns();
    } catch (err: any) {
      const msg = String(err?.message || err);
      setDiscError(
        msg === "run_already_active"
          ? "Une récolte est déjà en cours"
          : msg
      );
    }
  };

  const stopDiscovery = async () => {
    if (!activeRun) return;
    try {
      await cancelRun(activeRun.id);
      const updated = await getRun(activeRun.id);
      setActiveRun(updated.run);
      await reloadRuns();
    } catch (err: any) {
      window.alert(`Annulation: ${err?.message || err}`);
    }
  };

  const submitReply = async (interested: boolean) => {
    if (!detailTarget || !replyText.trim()) return;
    try {
      await logTikTokReply(detailTarget.id, replyText.trim(), interested);
      setDetailTarget(null);
      await reload(filter);
    } catch (err: any) {
      window.alert(`Réponse: ${err?.message || err}`);
    }
  };

  return (
    <section className="tk">
      <style>{SECTION_CSS}</style>

      <div className="tk-hero">
        <div className="tk-hero-card">
          <h2 className="tk-hero-title">🎯 Démarchage TikTok</h2>
          <p className="tk-hero-sub">
            Scanne un profil TikTok par handle ou URL. On extrait automatiquement les infos publiques
            et l'email business si présent dans la bio. Pas d'email visible → on passe au suivant.
          </p>
          <form className="tk-form" onSubmit={handleScan}>
            <input
              className="tk-input"
              placeholder="@kasinoze   ou   https://www.tiktok.com/@kasinoze"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              disabled={scanning}
            />
            <button
              type="submit"
              className="fsb-btn fsb-btn-primary"
              disabled={scanning || !scanInput.trim()}
            >
              {scanning ? <span className="tk-spin" /> : "🔍 Scanner"}
            </button>
          </form>
          {scanError ? (
            <div className="fsb-alert" style={{ marginTop: 12 }}>{scanError}</div>
          ) : null}
          {scanFlash ? (
            <div className="tk-warn" style={{ marginTop: 12 }}>{scanFlash}</div>
          ) : null}
          {!mailReady ? (
            <div className="tk-warn" style={{ marginTop: 12 }}>
              ⚠️ Mailer non configuré côté API (BREVO_API_KEY ou SMTP_*). Le scan + le suivi
              fonctionnent, mais l'envoi d'emails est désactivé.
            </div>
          ) : null}
        </div>

        <div className="tk-hero-card">
          <div className="tk-stats">
            <div className="tk-stat">
              <small>Total</small>
              <strong>{stats?.total ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Avec email</small>
              <strong>{stats?.withEmail ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Contactés</small>
              <strong>{stats?.contacted ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Réponses</small>
              <strong>{stats?.replied ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Intéressés</small>
              <strong style={{ color: "#34d399" }}>{stats?.interested ?? "—"}</strong>
            </div>
            <div className="tk-stat">
              <small>Refus</small>
              <strong style={{ color: "#fc8181" }}>{stats?.declined ?? "—"}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="tk-discovery">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
            cursor: "pointer",
          }}
          onClick={() => setSeedsCollapsed((v) => !v)}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
              {seedsCollapsed ? "▶" : "▼"} 🕸️ Réseau d'influenceurs{" "}
              <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>
                ({seeds.length} seed{seeds.length > 1 ? "s" : ""}, {candidates.length} candidat
                {candidates.length > 1 ? "s" : ""})
              </span>
            </h3>
            {!seedsCollapsed ? (
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
                Ajoute des comptes TikTok d'influenceurs avec qui on travaille déjà. On scanne leur
                activité publique (commentaires + @mentions sur leurs vidéos) et on en déduit les
                comptes susceptibles d'être intéressés. Les vidéos contenant un lien
                d'affiliation LunaLive comptent×10 dans le score.
              </p>
            ) : null}
          </div>
          {scanQueue.length > 0 || refreshingSeedId ? (
            <div
              style={{
                fontSize: 12,
                color: "#a5b4fc",
                background: "rgba(99,102,241,.1)",
                border: "1px solid rgba(99,102,241,.22)",
                padding: "6px 12px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              {refreshingSeedId ? "Scan en cours" : "En attente"}
              {scanQueue.length > 0 ? ` · file: ${scanQueue.length}` : ""}
            </div>
          ) : null}
        </div>

        {seedsCollapsed ? null : (
        <>
        {/* Réglages scan */}
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid var(--bd)",
            borderRadius: 12,
            background: "rgba(255,255,255,.02)",
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
            Vidéos / seed
            <input
              type="number"
              className="tk-num-input"
              min={1}
              max={20}
              value={scanVideoLimit}
              onChange={(e) =>
                setScanVideoLimit(Math.max(1, Math.min(20, Number(e.target.value) || 5)))
              }
              style={{ width: 70 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
            Commentaires / vidéo
            <input
              type="number"
              className="tk-num-input"
              min={5}
              max={150}
              value={scanCommentsPerVideo}
              onChange={(e) =>
                setScanCommentsPerVideo(Math.max(5, Math.min(150, Number(e.target.value) || 30)))
              }
              style={{ width: 70 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "center" }}>
            Affichage
            <input
              type="number"
              className="tk-num-input"
              min={10}
              max={500}
              step={10}
              value={candidatesDisplayLimit}
              onChange={(e) =>
                setCandidatesDisplayLimit(
                  Math.max(10, Math.min(500, Number(e.target.value) || 50))
                )
              }
              style={{ width: 70 }}
            />
          </label>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {affilPatterns.length} pattern{affilPatterns.length > 1 ? "s" : ""} d'affil
          </span>
          {seeds.length > 1 ? (
            <button
              type="button"
              className="fsb-btn"
              onClick={enqueueAllSeeds}
              disabled={!extensionVersion}
              title="Ajoute tous les seeds dans la file de scan"
            >
              ▶ Tout scanner
            </button>
          ) : null}
          <button
            type="button"
            className="fsb-btn"
            onClick={handleEnrichTop}
            disabled={enriching || candidates.length === 0}
            title="Scrape les profils des 20 meilleurs candidats (followers, bio, vérifié)"
          >
            {enriching && !enrichProgress ? <span className="tk-spin" /> : "🔍 Enrichir top 20"}
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={handleEnrichAll}
            disabled={enriching || candidates.length === 0}
            title="Boucle serveur (souvent bloquée par Cloudflare) — préfère le bouton extension"
            style={{ borderColor: "#94a3b8", color: "#94a3b8" }}
          >
            {enriching && enrichProgress?.startsWith("Batch") ? (
              <span style={{ fontSize: 11 }}>{enrichProgress}</span>
            ) : (
              "🚀 Tout enrichir (serveur)"
            )}
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={handleEnrichViaExtension}
            disabled={enriching || candidates.length === 0 || !extensionVersion}
            title={
              extensionVersion
                ? "Enrichit via ton navigateur connecté (fiable, contourne Cloudflare)"
                : "Extension TikTok non détectée"
            }
            style={{ borderColor: "#22d3ee", color: "#22d3ee" }}
          >
            {enriching && enrichProgress?.startsWith("Ext") ? (
              <span style={{ fontSize: 11 }}>{enrichProgress}</span>
            ) : (
              "🧩 Enrichir via extension"
            )}
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={handleScanAllSeedFollows}
            disabled={enriching || seeds.length === 0 || !extensionVersion}
            title="Scanne /following de chaque seed pour calculer follow_overlap (gros boost qualité)"
            style={{ borderColor: "#10b981", color: "#10b981" }}
          >
            {enriching && enrichProgress?.startsWith("Seed") ? (
              <span style={{ fontSize: 11 }}>{enrichProgress}</span>
            ) : (
              "📡 Scanner /following seeds"
            )}
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={() => handleScanCandidateMutuality(30)}
            disabled={enriching || candidates.length === 0 || !extensionVersion}
            title="Vérifie la mutualité du top 30 candidats (anti-célébrité)"
            style={{ borderColor: "#a855f7", color: "#a855f7" }}
          >
            {enriching && enrichProgress?.startsWith("Mutual") ? (
              <span style={{ fontSize: 11 }}>{enrichProgress}</span>
            ) : (
              "🧪 Vérif mutualité top 30"
            )}
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={handleAutoDismissCelebrities}
            disabled={enriching || candidates.length === 0}
            title="Pré-sélectionne les célébrités/hors-niche détectés et les retire en bulk"
            style={{ borderColor: "#f04e4e", color: "#f04e4e" }}
          >
            🧹 Auto-dismiss célébrités
          </button>
          <button
            type="button"
            className="fsb-btn"
            onClick={handlePurgeFollowGraph}
            disabled={enriching}
            title="Vide tiktok_seed_follows et tiktok_candidate_follows (à utiliser si scrape corrompu)"
            style={{ borderColor: "#94a3b8", color: "#94a3b8" }}
          >
            🗑️ Purger graphe follows
          </button>
        </div>

        {/* PANNEAU TESTS + PIPELINE AUTO */}
        <div
          style={{
            marginTop: 12,
            padding: 14,
            border: "1px dashed rgba(168,85,247,.4)",
            borderRadius: 12,
            background: "rgba(168,85,247,.04)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong style={{ color: "#a855f7", fontSize: 14 }}>
              🧪 Tests d'extension &amp; Pipeline auto
            </strong>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>
              Valide chaque brique avant de lancer la pipeline complète
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="fsb-btn"
              onClick={handleTestFollowingScroll}
              disabled={enriching || !extensionVersion}
              title="Ouvre /user/@handle, ouvre la modale Following, scroll, dump les handles"
              style={{ borderColor: "#10b981", color: "#10b981" }}
            >
              🧪 Test scroll /following
            </button>
            <button
              type="button"
              className="fsb-btn"
              onClick={handleTestVideoComments}
              disabled={enriching || !extensionVersion}
              title="Ouvre une vidéo TikTok, scroll le panneau commentaires, dump les commentateurs"
              style={{ borderColor: "#22d3ee", color: "#22d3ee" }}
            >
              🧪 Test scroll commentaires
            </button>
            <button
              type="button"
              className="fsb-btn"
              onClick={handleTestProfileEnrich}
              disabled={enriching || !extensionVersion}
              title="Scrape le profil d'un handle (followers, bio, vérifié, avatar)"
              style={{ borderColor: "#fbbf24", color: "#fbbf24" }}
            >
              🧪 Test enrich profil
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
            <button
              type="button"
              className="fsb-btn"
              onClick={handleFullReset}
              disabled={enriching}
              title="Vide TOUT sauf seeds + DSB influencers + patterns. Action irréversible."
              style={{ borderColor: "#f04e4e", color: "#f04e4e", fontWeight: 800 }}
            >
              🔄 Reset complet réseau
            </button>
            <button
              type="button"
              className="fsb-btn fsb-btn-primary"
              onClick={handleFullPipeline}
              disabled={enriching || seeds.length === 0 || !extensionVersion}
              title="Enchaîne automatiquement scan follows + enrich + mutualité + auto-dismiss"
              style={{
                background: "linear-gradient(135deg,#a855f7,#22d3ee)",
                border: "none",
                fontWeight: 800,
                color: "#0b1020",
              }}
            >
              {enriching && enrichProgress?.startsWith("Pipeline") ? (
                <span style={{ fontSize: 11 }}>{enrichProgress}</span>
              ) : (
                "🚀 Lancer pipeline complète auto"
              )}
            </button>
          </div>
        </div>

        {/* Patterns d'affiliation */}
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid rgba(251,191,36,.22)",
            borderRadius: 12,
            background: "rgba(251,191,36,.04)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: "#fbbf24",
              letterSpacing: ".04em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            💎 Patterns d'affiliation à détecter
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Colle ici tes liens taap.it (ex: <code>taap.it/abc123</code>) ou tout autre fragment
            d'URL à matcher dans les descriptions TikTok. Quand un seed poste une vidéo qui contient
            l'un de ces patterns, ses commentateurs sont taggés <code>affil</code> et leur score
            est boosté ×10.
          </p>
          <form
            onSubmit={handleAddPattern}
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}
          >
            <input
              className="tk-input"
              placeholder="taap.it/xxxxx ou lunalive.win/r/slug"
              value={newPatternInput}
              onChange={(e) => setNewPatternInput(e.target.value)}
              disabled={addingPattern}
              style={{ flex: "2 1 240px" }}
            />
            <input
              className="tk-input"
              placeholder="Label (optionnel) — ex: Stake / pertu"
              value={newPatternLabel}
              onChange={(e) => setNewPatternLabel(e.target.value)}
              disabled={addingPattern}
              style={{ flex: "1 1 160px" }}
            />
            <button
              type="submit"
              className="fsb-btn fsb-btn-primary"
              disabled={addingPattern || !newPatternInput.trim()}
            >
              {addingPattern ? <span className="tk-spin" /> : "➕"}
            </button>
          </form>
          {affilPatterns.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Aucun pattern. Sans pattern, le scan ne taggera aucune vidéo comme "affil".
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {affilPatterns.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(251,191,36,.10)",
                    border: "1px solid rgba(251,191,36,.32)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#fbbf24",
                  }}
                  title={p.label || ""}
                >
                  <span style={{ color: "#fff" }}>{p.pattern}</span>
                  {p.label ? (
                    <span style={{ opacity: 0.7, fontWeight: 500 }}>· {p.label}</span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDeletePattern(p.id)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "rgba(255,255,255,.6)",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <form className="tk-form" onSubmit={handleAddSeed} style={{ marginTop: 14 }}>
          <input
            className="tk-input"
            placeholder="@influenceur   ou   https://www.tiktok.com/@influenceur"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value)}
            disabled={seedAdding}
          />
          <button
            type="submit"
            className="fsb-btn fsb-btn-primary"
            disabled={seedAdding || !seedInput.trim()}
          >
            {seedAdding ? <span className="tk-spin" /> : "➕ Ajouter seed"}
          </button>
        </form>
        {seedError ? <div className="fsb-alert" style={{ marginTop: 10 }}>{seedError}</div> : null}

        {seedsLoading && !seeds.length ? (
          <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>Chargement…</p>
        ) : seeds.length === 0 ? (
          <p style={{ marginTop: 12, color: "var(--muted)", fontSize: 13 }}>
            Aucun seed pour l'instant. Ajoute au moins 2-3 influenceurs pour commencer à voir
            apparaître des candidats avec un score pertinent.
          </p>
        ) : (
          <div className="tk-net-grid">
            {seeds.map((seed) => (
              <div key={seed.id} className="tk-seed-card">
                <div className="tk-seed-card-head">
                  {seed.avatarUrl ? (
                    <img className="tk-seed-avatar" src={seed.avatarUrl} alt="" />
                  ) : (
                    <div className="tk-seed-avatar" />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tk-seed-handle">
                      @{seed.handle}
                      {refreshingSeedId === seed.id ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "#a5b4fc",
                            fontWeight: 700,
                          }}
                        >
                          ▶ scan…
                        </span>
                      ) : scanQueue.includes(seed.id) ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            color: "var(--muted)",
                            fontWeight: 700,
                          }}
                        >
                          📋 #{scanQueue.indexOf(seed.id) + 1}
                        </span>
                      ) : null}
                    </div>
                    <div className="tk-seed-meta">
                      {seed.linksCount} signal{seed.linksCount > 1 ? "s" : ""}
                      {seed.lastNetworkFetchAt
                        ? ` · refresh ${fmtRelative(seed.lastNetworkFetchAt)}`
                        : " · jamais scanné"}
                    </div>
                  </div>
                </div>
                <div className="tk-seed-actions">
                  <button
                    type="button"
                    className="fsb-btn fsb-btn-primary"
                    onClick={() => handleRefreshSeedViaExtension(seed)}
                    disabled={refreshingSeedId === seed.id || scanQueue.includes(seed.id)}
                    title={
                      extensionVersion
                        ? refreshingSeedId
                          ? "Un scan tourne déjà — clic = ajouter en file"
                          : "Scrape via extension (session loggée TikTok)"
                        : "Installe l'extension pour activer cette option"
                    }
                  >
                    {refreshingSeedId === seed.id ? (
                      <span className="tk-spin" />
                    ) : scanQueue.includes(seed.id) ? (
                      "📋 en file"
                    ) : refreshingSeedId ? (
                      "➕ Mettre en file"
                    ) : (
                      "🧩 Scan via ext."
                    )}
                  </button>
                  <button
                    type="button"
                    className="fsb-btn"
                    onClick={() => handleRefreshSeed(seed)}
                    disabled={refreshingSeedId === seed.id}
                    title="Tente le scraping serveur (souvent bloqué par TikTok sans session)"
                  >
                    🌐
                  </button>
                  <a
                    className="fsb-btn"
                    href={`https://www.tiktok.com/@${seed.handle}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ↗
                  </a>
                  <button
                    type="button"
                    className="fsb-btn"
                    onClick={() => handleDeleteSeed(seed)}
                    style={{ color: "#fc8181" }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
            🎯 Candidats détectés{" "}
            <span style={{ color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>
              ({candidates.length})
            </span>
          </h3>
          {(() => {
            const buckets = {
              peers: candidates.filter(
                (c) =>
                  c.nicheVerdict === "peer_confirmed" ||
                  c.nicheVerdict === "peer_likely" ||
                  c.followOverlap >= 2
              ),
              high: candidates.filter(
                (c) => (c.profile.followerCount ?? -1) >= 40000
              ),
              long: candidates.filter((c) => {
                const f = c.profile.followerCount ?? -1;
                return f >= 5000 && f < 40000;
              }),
              low: candidates.filter((c) => {
                const f = c.profile.followerCount ?? -1;
                return f >= 0 && f < 5000;
              }),
              unknown: candidates.filter(
                (c) => c.profile.followerCount == null
              ),
            };
            const tabs: Array<{
              k: "peers" | "high" | "long" | "low" | "unknown";
              label: string;
              color: string;
            }> = [
              { k: "peers", label: `🟢 Peers (${buckets.peers.length})`, color: "#10b981" },
              { k: "high", label: `🔥 Fort potentiel · ≥40K (${buckets.high.length})`, color: "#fbbf24" },
              { k: "long", label: `🌱 Long terme · 5K–40K (${buckets.long.length})`, color: "#22d3ee" },
              { k: "low", label: `💤 Faibles · <5K (${buckets.low.length})`, color: "#94a3b8" },
              { k: "unknown", label: `❓ Non enrichis (${buckets.unknown.length})`, color: "#a5b4fc" },
            ];
            return (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%", marginTop: 4 }}>
                {tabs.map((t) => {
                  const active = candidateTier === t.k;
                  return (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => setCandidateTier(t.k)}
                      className="fsb-btn"
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "5px 10px",
                        borderColor: active ? t.color : undefined,
                        color: active ? t.color : undefined,
                        background: active
                          ? `${t.color}15`
                          : undefined,
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
                color: "var(--muted)",
              }}
            >
              <input
                type="checkbox"
                checked={hideImportedCandidates}
                onChange={(e) => setHideImportedCandidates(e.target.checked)}
              />
              Masquer ceux déjà importés
            </label>
            <label
              style={{
                display: "inline-flex",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
                color: "#fbbf24",
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={affilOnlyCandidates}
                onChange={(e) => setAffilOnlyCandidates(e.target.checked)}
              />
              💎 Affil uniquement
            </label>
          </div>
        </div>

        {candidatesLoading && !candidates.length ? (
          <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>Chargement…</p>
        ) : candidates.length === 0 ? (
          <p style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
            Aucun candidat encore. Lance un "Refresh" sur un ou plusieurs seeds pour commencer.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tk-cand-table">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Handle</th>
                  <th>Seeds</th>
                  <th>Signaux</th>
                  <th style={{ textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {candidates
                  .filter((c) => {
                    if (candidateTier === "peers") {
                      return (
                        c.nicheVerdict === "peer_confirmed" ||
                        c.nicheVerdict === "peer_likely" ||
                        c.followOverlap >= 2
                      );
                    }
                    const f = c.profile.followerCount;
                    if (candidateTier === "unknown") return f == null;
                    if (f == null) return false;
                    if (candidateTier === "high") return f >= 40000;
                    if (candidateTier === "long") return f >= 5000 && f < 40000;
                    return f < 5000;
                  })
                  .slice(0, candidatesDisplayLimit)
                  .map((c) => (
                  <tr
                    key={c.handle}
                    style={
                      c.hasAffil
                        ? {
                            background:
                              "linear-gradient(90deg,rgba(251,191,36,.06),transparent)",
                          }
                        : undefined
                    }
                  >
                    <td>
                      <span
                        className="tk-cand-score"
                        style={
                          c.hasAffil
                            ? {
                                background:
                                  "linear-gradient(135deg,rgba(251,191,36,.32),rgba(245,158,11,.32))",
                                borderColor: "rgba(251,191,36,.5)",
                              }
                            : undefined
                        }
                      >
                        {c.score}
                      </span>
                      {c.hasAffil ? (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            fontWeight: 800,
                            color: "#fbbf24",
                            letterSpacing: ".04em",
                          }}
                        >
                          💎 AFFIL
                        </div>
                      ) : null}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {c.profile.avatarUrl ? (
                          <img
                            src={c.profile.avatarUrl}
                            alt=""
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 14,
                              border: "1px solid var(--bd)",
                              objectFit: "cover",
                            }}
                          />
                        ) : null}
                        <div>
                          <div className="tk-cand-handle">
                            @{c.handle}
                            {c.profile.verified ? (
                              <span style={{ color: "#22d3ee", marginLeft: 4 }}>✓</span>
                            ) : null}
                          </div>
                          {c.profile.followerCount != null ? (
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>
                              {fmtCount(c.profile.followerCount)} followers
                              {c.profile.videoCount != null
                                ? ` · ${fmtCount(c.profile.videoCount)} vidéos`
                                : ""}
                              {c.profile.bioEmail ? " · 📧" : ""}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      {c.influencer ? (
                        <span className="tk-cand-imported" style={{ marginTop: 4, display: "inline-block" }}>
                          déjà DSB · {c.influencer.status}
                        </span>
                      ) : null}
                      <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {c.followOverlap >= 1 ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(16,185,129,.15)",
                              border: "1px solid rgba(16,185,129,.4)",
                              color: "#10b981",
                              fontWeight: 700,
                            }}
                            title={`${c.followOverlap} de nos seeds suivent ce compte`}
                          >
                            🔗 overlap {c.followOverlap}
                          </span>
                        ) : null}
                        {c.mutualCount >= 1 ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(34,211,238,.15)",
                              border: "1px solid rgba(34,211,238,.4)",
                              color: "#22d3ee",
                              fontWeight: 700,
                            }}
                            title={`Suit ${c.mutualCount} de nos seeds en retour`}
                          >
                            ↔ mutual {c.mutualCount}
                          </span>
                        ) : null}
                        {c.nicheVerdict === "celebrity" ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(240,78,78,.15)",
                              border: "1px solid rgba(240,78,78,.4)",
                              color: "#f04e4e",
                              fontWeight: 700,
                            }}
                          >
                            ⭐ célébrité
                          </span>
                        ) : null}
                        {c.nicheVerdict === "off_niche" ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(148,163,184,.15)",
                              border: "1px solid var(--bd)",
                              color: "var(--muted)",
                              fontWeight: 700,
                            }}
                          >
                            🚫 hors-niche
                          </span>
                        ) : null}
                        {c.nicheVerdict === "peer_confirmed" ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(16,185,129,.18)",
                              border: "1px solid rgba(16,185,129,.5)",
                              color: "#10b981",
                              fontWeight: 800,
                            }}
                          >
                            ✓ peer confirmé
                          </span>
                        ) : null}
                        {c.nicheVerdict === "peer_likely" ? (
                          <span
                            style={{
                              fontSize: 10,
                              padding: "2px 7px",
                              borderRadius: 999,
                              background: "rgba(34,211,238,.12)",
                              border: "1px solid rgba(34,211,238,.35)",
                              color: "#22d3ee",
                              fontWeight: 700,
                            }}
                          >
                            🎯 peer probable
                          </span>
                        ) : null}
                      </div>
                      {c.antiFanFactor < 1 ? (
                        <span
                          style={{
                            marginTop: 4,
                            display: "inline-block",
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 999,
                            background: "rgba(148,163,184,.1)",
                            color: "var(--muted)",
                            border: "1px solid var(--bd)",
                            fontWeight: 700,
                          }}
                          title="Heuristique : tous les signaux viennent d'un seul seed avec >3 occurrences. Score divisé par 2.5."
                        >
                          🥱 fan probable
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <div>
                        <strong>{c.seedCount}</strong>
                      </div>
                      <div className="tk-cand-seeds">
                        {c.seedHandles.slice(0, 3).map((h) => `@${h}`).join(", ")}
                        {c.seedHandles.length > 3 ? "…" : ""}
                      </div>
                    </td>
                    <td>
                      <div className="tk-cand-types">
                        {c.signalTypes.map((t) => {
                          const isAffil = t.startsWith("affil_");
                          const isFollow = t === "following";
                          const label =
                            t === "affil_comment"
                              ? "💎 affil-comm"
                              : t === "affil_mention"
                              ? "💎 affil-ment"
                              : t === "following"
                              ? "🔗 follow"
                              : t;
                          return (
                            <span
                              key={t}
                              className="tk-cand-type"
                              style={
                                isAffil
                                  ? {
                                      background: "rgba(251,191,36,.15)",
                                      borderColor: "rgba(251,191,36,.45)",
                                      color: "#fbbf24",
                                    }
                                  : isFollow
                                  ? {
                                      background: "rgba(99,102,241,.18)",
                                      borderColor: "rgba(99,102,241,.45)",
                                      color: "#a5b4fc",
                                    }
                                  : undefined
                              }
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                      <div
                        className="tk-cand-seeds"
                        style={{ marginTop: 2 }}
                        title={
                          c.sourceVideos.length > 0
                            ? `Vidéos sources :\n${c.sourceVideos.slice(0, 5).join("\n")}`
                            : undefined
                        }
                      >
                        {c.signalSum} apparition{c.signalSum > 1 ? "s" : ""}
                        {c.sourceVideos.length > 0
                          ? ` · ${c.sourceVideos.length} vidéo${
                              c.sourceVideos.length > 1 ? "s" : ""
                            } 🎬`
                          : ""}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <a
                        className="fsb-btn"
                        href={`https://www.tiktok.com/@${c.handle}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ marginRight: 6 }}
                      >
                        ↗
                      </a>
                      {c.influencer ? null : (
                        <button
                          type="button"
                          className="fsb-btn fsb-btn-primary"
                          onClick={() => handleImportCandidate(c.handle)}
                          disabled={importingCandidate === c.handle}
                        >
                          {importingCandidate === c.handle ? (
                            <span className="tk-spin" />
                          ) : (
                            "📥 Importer"
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        className="fsb-btn"
                        onClick={() => handleDismissCandidate(c.handle)}
                        title="Retirer définitivement de la liste (il ne reviendra plus)"
                        style={{
                          marginLeft: 6,
                          color: "#f04e4e",
                          borderColor: "rgba(240,78,78,.4)",
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </>
        )}
      </div>

      <div className="tk-discovery">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
              🤖 Récolte automatique
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Scanne des hashtags TikTok, filtre par critères (FR uniquement par défaut) et ajoute
              les profils correspondants à la liste.
            </p>
          </div>
          {extensionVersion ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(16,185,129,.12)",
                border: "1px solid rgba(16,185,129,.32)",
                color: "#34d399",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".02em",
              }}
              title={`Extension v${extensionVersion} active — la récolte tournera dans ton navigateur`}
            >
              🟢 Extension active (v{extensionVersion}) — scrape local
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "rgba(245,158,11,.1)",
                border: "1px solid rgba(245,158,11,.28)",
                color: "#fbbf24",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: ".02em",
              }}
              title="Sans extension, le serveur scrape (souvent bloqué par TikTok)"
            >
              ⚠ Extension non installée — scrape serveur (instable)
            </div>
          )}
        </div>

        <div className="tk-disc-grid">
          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Hashtags TikTok (sans #)</label>
            <div className="tk-chips">
              {discHashtags.map((h) => (
                <span key={h} className="tk-chip">
                  #{h}
                  <button onClick={() => setDiscHashtags(discHashtags.filter((x) => x !== h))}>
                    ×
                  </button>
                </span>
              ))}
              <input
                placeholder={discHashtags.length ? "Ajouter..." : "casinofr, casinoenligne..."}
                value={discHashtagInput}
                onChange={(e) => setDiscHashtagInput(e.target.value)}
                onKeyDown={handleHashtagKey}
                onBlur={() => {
                  if (discHashtagInput.trim()) {
                    addHashtag(discHashtagInput);
                    setDiscHashtagInput("");
                  }
                }}
              />
            </div>
          </div>

          <div className="tk-disc-field">
            <label>Followers min</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              value={discMinFollowers}
              onChange={(e) => setDiscMinFollowers(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="tk-disc-field">
            <label>Followers max</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              value={discMaxFollowers}
              onChange={(e) => setDiscMaxFollowers(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className="tk-disc-field">
            <label>Profils max par run</label>
            <input
              type="number"
              className="tk-num-input"
              style={{ width: "100%" }}
              min={1}
              max={1000}
              value={discMaxProfiles}
              onChange={(e) =>
                setDiscMaxProfiles(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))
              }
            />
          </div>

          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Pays (TikTok region)</label>
            <div className="tk-disc-row">
              {COUNTRY_CHOICES.map((code) => (
                <label key={code}>
                  <input
                    type="checkbox"
                    checked={discCountries.includes(code)}
                    onChange={() => toggleCountry(code)}
                  />
                  {code}
                </label>
              ))}
            </div>
          </div>

          <div className="tk-disc-field" style={{ gridColumn: "1 / -1" }}>
            <label>Options</label>
            <div className="tk-disc-row">
              <label>
                <input
                  type="checkbox"
                  checked={discRequireEmail}
                  onChange={(e) => setDiscRequireEmail(e.target.checked)}
                />
                Ne garder que les profils avec email
              </label>
            </div>
          </div>
        </div>

        <div className="tk-disc-actions">
          <button
            className="fsb-btn fsb-btn-primary"
            onClick={launchDiscovery}
            disabled={!!activeRun && activeRun.status === "running"}
          >
            {activeRun?.status === "running" ? <span className="tk-spin" /> : "🚀 Lancer la récolte"}
          </button>
          {activeRun?.status === "running" ? (
            <button className="fsb-btn" onClick={stopDiscovery}>
              ⏹ Arrêter
            </button>
          ) : null}
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            ~{Math.ceil((discMaxProfiles * 0.7 + discHashtags.length * 0.9) / 6) * 10}s estimés
          </span>
        </div>

        {discError ? <div className="fsb-alert" style={{ marginTop: 12 }}>{discError}</div> : null}

        {!extensionVersion ? (
          <div
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 12,
              background: "rgba(255,255,255,.025)",
              border: "1px solid var(--bd)",
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
              <strong style={{ color: "var(--text)" }}>Installe l'extension</strong> pour que la récolte tourne dans ton navigateur (TikTok bloque le serveur).
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href="/lunalive-tiktok-discoverer.zip"
                download
                className="fsb-btn fsb-btn-primary"
                style={{ textDecoration: "none" }}
              >
                ⬇️ Télécharger le .zip
              </a>
              <a
                href="/extension"
                target="_blank"
                rel="noreferrer"
                className="fsb-btn"
                style={{ textDecoration: "none" }}
              >
                📖 Guide d'install
              </a>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(255,255,255,.02)",
              border: "1px solid var(--bd)",
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              justifyContent: "space-between",
              fontSize: 12,
            }}
          >
            <span style={{ color: "var(--muted)" }}>
              Partage l'extension à un coéquipier — il aura le même setup en 1 minute.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <a
                href="/lunalive-tiktok-discoverer.zip"
                download
                className="fsb-btn"
                style={{ padding: "6px 12px", fontSize: 12, textDecoration: "none" }}
              >
                ⬇️ .zip
              </a>
              <button
                className="fsb-btn"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={() => {
                  const url = `${window.location.origin}/extension`;
                  navigator.clipboard?.writeText(url).catch(() => {});
                  window.alert(`Lien copié : ${url}`);
                }}
              >
                🔗 Copier le lien
              </button>
            </div>
          </div>
        )}

        {localScrape ? (
          <div className="tk-progress" style={{ marginTop: 12 }}>
            <div className="tk-progress-head">
              <div>
                <span
                  className={`tk-run-status ${localScrape.running ? "tk-run-running" : "tk-run-done"}`}
                  style={{ marginRight: 8 }}
                >
                  {localScrape.running ? "Scrape navigateur en cours" : "Scrape navigateur terminé"}
                </span>
              </div>
            </div>
            <div className="tk-progress-stats" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
              <div className="tk-progress-stat">
                <strong>{localScrape.capturedHandles}</strong>capturés
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#94a3b8" }}>{localScrape.alreadyKnown}</strong>déjà connus
              </div>
              <div className="tk-progress-stat">
                <strong>{localScrape.profilesScraped}</strong>profils scrapés
              </div>
              <div className="tk-progress-stat">
                <strong>{localScrape.importedScanned}</strong>traités
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#34d399" }}>{localScrape.importedWithEmail}</strong>avec email
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#34d399" }}>{localScrape.importedKept}</strong>ajoutés
              </div>
            </div>
            {localScrape.events.length > 0 ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                  📋 Détails par hashtag ({localScrape.events.length})
                </summary>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,.25)",
                    borderRadius: 10,
                    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    maxHeight: 220,
                    overflow: "auto",
                    border: "1px solid var(--bd)",
                  }}
                >
                  {localScrape.events.map((event, i) => (
                    <div
                      key={i}
                      style={{
                        color:
                          event.kind === "error"
                            ? "#fc8181"
                            : event.kind === "done" && event.found
                            ? "#34d399"
                            : "var(--muted)",
                      }}
                    >
                      {event.source} → {event.kind}
                      {event.found != null ? ` · ${event.found} trouvés` : ""}
                      {event.error ? ` · ${event.error}` : ""}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {activeRun ? (
          <div className="tk-progress">
            <div className="tk-progress-head">
              <div>
                <span
                  className={`tk-run-status tk-run-${activeRun.status}`}
                  style={{ marginRight: 8 }}
                >
                  {activeRun.status === "running"
                    ? "En cours"
                    : activeRun.status === "done"
                    ? "Terminé"
                    : activeRun.status === "error"
                    ? "Erreur"
                    : "Annulé"}
                </span>
                {activeRun.message || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {fmtRelative(activeRun.startedAt)}
              </div>
            </div>
            <div className="tk-progbar">
              <div
                className="tk-progbar-fill"
                style={{
                  width: `${
                    activeRun.candidatesCount
                      ? Math.min(
                          100,
                          (activeRun.scannedCount /
                            Math.max(
                              1,
                              Math.min(
                                activeRun.criteria?.maxProfiles || 30,
                                activeRun.candidatesCount
                              )
                            )) *
                            100
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <div className="tk-progress-stats">
              <div className="tk-progress-stat">
                <strong>{activeRun.candidatesCount}</strong>candidats
              </div>
              <div className="tk-progress-stat">
                <strong>{activeRun.scannedCount}</strong>scannés
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#34d399" }}>{activeRun.keptCount}</strong>gardés
              </div>
              <div className="tk-progress-stat">
                <strong style={{ color: "#fc8181" }}>{activeRun.droppedCount}</strong>rejetés
              </div>
            </div>

            {activeRun.log && activeRun.log.length > 0 ? (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                  📋 Voir le log diagnostic ({activeRun.log.length})
                </summary>
                <div
                  style={{
                    marginTop: 8,
                    padding: "10px 12px",
                    background: "rgba(0,0,0,.25)",
                    borderRadius: 10,
                    fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    maxHeight: 280,
                    overflow: "auto",
                    border: "1px solid var(--bd)",
                  }}
                >
                  {activeRun.log.map((entry, i) => (
                    <div key={i} style={{ color: entry.reason.includes("blocked") || entry.reason.includes("unreachable") ? "#fc8181" : entry.reason.includes("kept") ? "#34d399" : "var(--muted)" }}>
                      {entry.tag ? `#${entry.tag} ` : ""}
                      {entry.query ? `?${entry.query} ` : ""}
                      {entry.handle ? `@${entry.handle} ` : ""}
                      → {entry.reason}
                      {entry.followers != null ? ` · ${entry.followers} followers` : ""}
                      {entry.country ? ` · ${entry.country}` : ""}
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}

        {pastRuns.length > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>
                Historique des runs
              </div>
              <button
                className="fsb-btn"
                style={{ padding: "6px 12px", fontSize: 12 }}
                onClick={async () => {
                  if (!window.confirm("Effacer tout l'historique des runs ? (les runs en cours sont préservés)")) return;
                  try {
                    await clearRuns();
                    await reloadRuns();
                  } catch (err: any) {
                    window.alert(`Erreur: ${err?.message || err}`);
                  }
                }}
              >
                🗑 Tout effacer
              </button>
            </div>
            <div className="tk-runs">
              {pastRuns
                .filter((r) => !activeRun || r.id !== activeRun.id)
                .map((run) => (
                  <div key={run.id} className="tk-run">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {(run.criteria?.hashtags || []).map((h) => `#${h}`).join(" · ") || "—"}
                      </div>
                      <div className="tk-run-meta">
                        {fmtRelative(run.startedAt)} · {run.keptCount} gardé(s) /{" "}
                        {run.scannedCount} scanné(s) · {run.candidatesCount} candidat(s)
                      </div>
                    </div>
                    <span className={`tk-run-status tk-run-${run.status}`}>
                      {run.status === "done"
                        ? "Terminé"
                        : run.status === "running"
                        ? "En cours"
                        : run.status === "error"
                        ? "Erreur"
                        : "Annulé"}
                    </span>
                    {run.status !== "running" ? (
                      <button
                        className="fsb-btn"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        title="Supprimer ce run"
                        onClick={async () => {
                          try {
                            await deleteRun(run.id);
                            await reloadRuns();
                          } catch (err: any) {
                            window.alert(`Erreur: ${err?.message || err}`);
                          }
                        }}
                      >
                        🗑
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
          </>
        ) : null}
      </div>

      {templateDraft ? (
        <div className="tk-discovery">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-.02em" }}>
              ✉️ Modèle de mail
            </h3>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              — utilisé par défaut quand tu cliques "Contacter"
            </span>
            {!templateApiReady ? (
              <span
                style={{
                  marginLeft: "auto",
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(245,158,11,.1)",
                  border: "1px solid rgba(245,158,11,.28)",
                  color: "#fbbf24",
                  fontSize: 11,
                  fontWeight: 800,
                }}
                title="L'API n'a pas encore redéployé — tu peux quand même éditer, sauvegarde dans 1-2 min"
              >
                ⏳ API en cours de déploiement
              </span>
            ) : null}
          </div>
          <div>
            <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
              Variables disponibles : <code style={{ color: "#fbbf24", background: "rgba(255,255,255,.06)", padding: "1px 6px", borderRadius: 5 }}>{"{{name}}"}</code>{" "}
              (display name ou @handle) ·{" "}
              <code style={{ color: "#fbbf24", background: "rgba(255,255,255,.06)", padding: "1px 6px", borderRadius: 5 }}>{"{{handle}}"}</code>
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    fontWeight: 800,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Sujet
                </label>
                <input
                  className="tk-input"
                  value={templateDraft.subject}
                  onChange={(e) =>
                    setTemplateDraft({ ...templateDraft, subject: e.target.value })
                  }
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    fontWeight: 800,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Corps du mail
                </label>
                <textarea
                  className="tk-textarea"
                  style={{ minHeight: 220 }}
                  value={templateDraft.body}
                  onChange={(e) => setTemplateDraft({ ...templateDraft, body: e.target.value })}
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                    fontWeight: 800,
                    display: "block",
                    marginBottom: 6,
                  }}
                >
                  Domaine pour les réponses (Reply-To)
                </label>
                <input
                  className="tk-input"
                  value={templateDraft.replyDomain}
                  onChange={(e) =>
                    setTemplateDraft({ ...templateDraft, replyDomain: e.target.value })
                  }
                />
                <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 11.5, lineHeight: 1.5 }}>
                  Les mails sortants auront un Reply-To <code>replies+tk{"{id}"}@{templateDraft.replyDomain}</code>.
                  Configure Brevo Inbound Parsing sur ce domaine pour capter les réponses
                  automatiquement (webhook : <code>POST /api/inbound/tiktok-reply?secret=...</code>).
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button
                className="fsb-btn fsb-btn-primary"
                onClick={saveTemplate}
                disabled={
                  templateSaving ||
                  Boolean(
                    template &&
                      template.subject === templateDraft.subject &&
                      template.body === templateDraft.body &&
                      template.replyDomain === templateDraft.replyDomain
                  )
                }
              >
                {templateSaving ? <span className="tk-spin" /> : "💾 Sauvegarder"}
              </button>
              <button
                className="fsb-btn"
                onClick={() => template && setTemplateDraft(template)}
                disabled={!template || templateSaving}
              >
                Annuler les modifs
              </button>
              {templateFlash ? (
                <span style={{ fontSize: 12.5, color: templateFlash.startsWith("✅") ? "#34d399" : "#fc8181" }}>
                  {templateFlash}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="tk-filterbar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`tk-filter ${filter === f.value ? "tk-filter-active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="tk-empty">
          <span className="tk-spin" /> Chargement…
        </div>
      ) : influencers.length === 0 ? (
        <div className="tk-empty">
          <strong>Aucun influenceur dans cette vue</strong>
          Scanne un premier profil pour démarrer.
        </div>
      ) : (
        <div className="tk-grid">
          {influencers.map((inf) => {
            const initials = (inf.displayName || inf.handle || "?").slice(0, 2).toUpperCase();
            const status = inf.status as TikTokInfluencerStatus;
            return (
              <div key={inf.id} className="tk-card">
                <div className="tk-card-head">
                  <div className="tk-avatar">
                    {inf.avatarUrl ? <img src={inf.avatarUrl} alt={inf.handle} /> : initials}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tk-card-name" title={inf.displayName || inf.handle}>
                      {inf.displayName || `@${inf.handle}`}
                      {inf.verified ? " ✓" : ""}
                    </div>
                    <span className="tk-card-handle">
                      <a href={inf.profileUrl} target="_blank" rel="noreferrer">
                        @{inf.handle}
                      </a>
                      {inf.country ? ` · ${inf.country}` : ""}
                    </span>
                  </div>
                  <span
                    className="tk-status-dot"
                    style={{ color: STATUS_COLOR[status] }}
                    title={STATUS_LABEL[status]}
                  >
                    {STATUS_LABEL[status]}
                  </span>
                </div>

                <div className="tk-card-stats">
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.followerCount)}</strong>followers
                  </div>
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.heartCount)}</strong>likes
                  </div>
                  <div className="tk-card-stat">
                    <strong>{fmtCount(inf.videoCount)}</strong>vidéos
                  </div>
                </div>

                <div className="tk-card-bio">{inf.bio || "Pas de bio publique."}</div>

                <div className={`tk-card-email ${inf.email ? "" : "tk-card-email-empty"}`}>
                  {inf.email ? `📧 ${inf.email}` : "✗ Aucun email public"}
                </div>

                {inf.lastEmailSentAt ? (
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>
                    Dernier envoi: {fmtRelative(inf.lastEmailSentAt)}
                  </div>
                ) : null}

                <div className="tk-card-actions">
                  {inf.email && (status === "new" || status === "queued") ? (
                    <button
                      className="fsb-btn fsb-btn-primary"
                      onClick={() => openContact(inf)}
                      disabled={!mailReady}
                    >
                      📤 Contacter
                    </button>
                  ) : null}
                  {status === "contacted" ? (
                    <button className="fsb-btn" onClick={() => openDetail(inf)}>
                      💬 Voir / Réponse
                    </button>
                  ) : null}
                  {(status === "replied" || status === "interested" || status === "declined") ? (
                    <button className="fsb-btn" onClick={() => openDetail(inf)}>
                      💬 Historique
                    </button>
                  ) : null}
                  {status !== "blacklisted" ? (
                    <button
                      className="fsb-btn"
                      onClick={() => onChangeStatus(inf, "blacklisted")}
                      title="Blacklister"
                    >
                      🚫
                    </button>
                  ) : (
                    <button
                      className="fsb-btn"
                      onClick={() => onChangeStatus(inf, "new")}
                    >
                      Réactiver
                    </button>
                  )}
                  <button className="fsb-btn" onClick={() => onDelete(inf)} title="Supprimer">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {contactTarget ? (
        <div className="tk-modal-back" onClick={() => !contactSending && setContactTarget(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Contacter @{contactTarget.handle}</h3>
            <p className="tk-modal-sub">
              Envoi à <strong>{contactTarget.email}</strong>. Variables disponibles : {"{{name}}"}, {"{{handle}}"}.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label className="fsb-field" style={{ display: "block" }}>
                  <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>
                    Sujet
                  </span>
                  <input
                    className="tk-input"
                    style={{ marginTop: 6 }}
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted)", fontWeight: 800 }}>
                    Corps du mail
                  </span>
                  <textarea
                    className="tk-textarea"
                    style={{ marginTop: 6 }}
                    value={contactBody}
                    onChange={(e) => setContactBody(e.target.value)}
                  />
                </label>
              </div>
            </div>
            {contactError ? <div className="fsb-alert" style={{ marginTop: 12 }}>{contactError}</div> : null}
            <div className="tk-modal-actions">
              <button
                className="fsb-btn"
                onClick={() => setContactTarget(null)}
                disabled={contactSending}
              >
                Annuler
              </button>
              <button
                className="fsb-btn fsb-btn-primary"
                onClick={sendContact}
                disabled={contactSending}
              >
                {contactSending ? <span className="tk-spin" /> : "📤 Envoyer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detailTarget ? (
        <div className="tk-modal-back" onClick={() => setDetailTarget(null)}>
          <div className="tk-modal" onClick={(e) => e.stopPropagation()}>
            <h3>@{detailTarget.handle}</h3>
            <p className="tk-modal-sub">
              {detailTarget.email || "Pas d'email"} · Statut : {STATUS_LABEL[detailTarget.status]}
            </p>

            <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
              {detailLoading ? (
                <div className="tk-msg"><span className="tk-spin" /> Chargement…</div>
              ) : detailMessages.length === 0 ? (
                <div className="tk-msg">Aucun message échangé.</div>
              ) : (
                detailMessages.map((msg) => (
                  <div key={msg.id} className={`tk-msg ${msg.direction === "out" ? "tk-msg-out" : "tk-msg-in"}`}>
                    <div className="tk-msg-meta">
                      {msg.direction === "out" ? "→ Envoyé" : "← Reçu"} · {fmtRelative(msg.sentAt)}
                      {msg.subject ? ` · ${msg.subject}` : ""}
                      {!msg.success ? " · échec" : ""}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.body}</div>
                    {msg.errorMessage ? (
                      <div style={{ color: "#fc8181", marginTop: 6 }}>{msg.errorMessage}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <h4 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, letterSpacing: "-.01em" }}>
              Logger une réponse manuellement
            </h4>
            <textarea
              className="tk-textarea"
              style={{ minHeight: 100 }}
              placeholder="Colle ici la réponse reçue par mail…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <div className="tk-modal-actions">
              <button className="fsb-btn" onClick={() => setDetailTarget(null)}>
                Fermer
              </button>
              <button
                className="fsb-btn"
                onClick={() => submitReply(false)}
                disabled={!replyText.trim()}
              >
                Pas intéressé
              </button>
              <button
                className="fsb-btn fsb-btn-primary"
                onClick={() => submitReply(true)}
                disabled={!replyText.trim()}
              >
                ✓ Intéressé
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
