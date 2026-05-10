import * as React from "react";
import {
  createAgencyAssignment,
  createAgencyCasino,
  createAgencyDeal,
  createAgencyStreamer,
  createAgencySnapshot,
  deleteAgencyAssignment,
  deleteAgencyCasino,
  deleteAgencyDeal,
  deleteAgencySnapshot,
  deleteAgencyStreamer,
  getAgencySnapshots,
  getFsbAgencyDashboard,
  previewAgencyBonus,
  resetAgencyStreamerAccess,
  updateAgencyAssignment,
  updateAgencyCasino,
  updateAgencyDeal,
  updateAgencySnapshot,
  updateAgencyStats,
  updateAgencyStreamer,
  type AgencyAssignment,
  type AgencyDashboardResponse,
  type AgencyDeal,
  type AgencyGeneratedAccess,
  type AgencyPerSnapshotAgg,
  type AgencyPreviewBonusResponse,
  type AgencySnapshot,
  type AgencySnapshotInput,
  type AgencySnapshotsListResponse,
  type AgencyStreamer,
} from "../../lib/api_agency";

// ─── Helpers ────────────────────────────────────────────────────────────────

function currentMonthKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}`;
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

function eur(value: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function pct(value: number | null | undefined) {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}%`;
}

function num(value: number | null | undefined) {
  if (value == null) return "-";
  return Number(value).toLocaleString("fr-FR");
}


function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(date);
}

function toNumberOrNull(value: string) {
  const text = value.trim();
  if (!text) return null;
  const next = Number(text.replace(",", "."));
  return Number.isFinite(next) ? next : null;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ─── Form state types ────────────────────────────────────────────────────────

type TabKey = "overview" | "affilies" | "gestion" | "config";

type CasinoFormState = {
  id: number | null;
  name: string;
  notes: string;
};

type DealFormState = {
  id: number | null;
  casinoId: string;
  name: string;
  cpaAmount: string;
  cpaAgencyCut: string;
  ersPercent: string;
  ersAgencyPercent: string;
  notes: string;
};

type StreamerFormState = {
  id: number | null;
  displayName: string;
  notes: string;
  publicNote: string;
  initialDealId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialPaymentDate: string;
  initialLinksText: string;
  initialAssignmentNotes: string;
};

type AssignmentFormState = {
  id: number | null;
  agencyStreamerId: string;
  dealId: string;
  startDate: string;
  endDate: string;
  paymentDate: string;
  paymentFrequency: "monthly" | "biweekly";
  linksText: string;
  notes: string;
};

const EMPTY_CASINO_FORM: CasinoFormState = { id: null, name: "", notes: "" };
const EMPTY_DEAL_FORM: DealFormState = {
  id: null, casinoId: "", name: "",
  cpaAmount: "", cpaAgencyCut: "", ersPercent: "", ersAgencyPercent: "", notes: "",
};
const EMPTY_STREAMER_FORM: StreamerFormState = {
  id: null, displayName: "", notes: "", publicNote: "",
  initialDealId: "", initialStartDate: "", initialEndDate: "",
  initialPaymentDate: "", initialLinksText: "", initialAssignmentNotes: "",
};
const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  id: null, agencyStreamerId: "", dealId: "",
  startDate: "", endDate: "", paymentDate: "", paymentFrequency: "monthly", linksText: "", notes: "",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FsbAgencySection() {
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const [data, setData] = React.useState<AgencyDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedAccess, setGeneratedAccess] = React.useState<AgencyGeneratedAccess | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabKey>("overview");
  const [gestionStep, setGestionStep] = React.useState<"streamer" | "assignment">("streamer");
  const [expandedStatsId, setExpandedStatsId] = React.useState<number | null>(null);
  // "snapshots" = nouveau panneau saisie, "legacy" = ancien formulaire mensuel
  const [statsMode, setStatsMode] = React.useState<"snapshots" | "legacy">("snapshots");

  const [casinoForm, setCasinoForm] = React.useState<CasinoFormState>(EMPTY_CASINO_FORM);
  const [dealForm, setDealForm] = React.useState<DealFormState>(EMPTY_DEAL_FORM);
  const [streamerForm, setStreamerForm] = React.useState<StreamerFormState>(EMPTY_STREAMER_FORM);
  const [assignmentForm, setAssignmentForm] = React.useState<AssignmentFormState>(EMPTY_ASSIGNMENT_FORM);

  const [statsAssignmentId, setStatsAssignmentId] = React.useState("");
  const [statsSignups, setStatsSignups] = React.useState("");
  const [statsDepositCount, setStatsDepositCount] = React.useState("");
  const [statsFtdCount, setStatsFtdCount] = React.useState("");
  const [statsFtdFullBenef, setStatsFtdFullBenef] = React.useState("");
  const [enableFullBenef, setEnableFullBenef] = React.useState(false);
  const [statsDeposits, setStatsDeposits] = React.useState("");
  const [statsRsValue, setStatsRsValue] = React.useState("");
  const [showCpaToStreamer, setShowCpaToStreamer] = React.useState(true);
  const [showRsToStreamer, setShowRsToStreamer] = React.useState(true);
  const [streamerSearch, setStreamerSearch] = React.useState("");
  const [streamerSort, setStreamerSort] = React.useState("name");
  const [dealSort, setDealSort] = React.useState("casino-name");

  const selectedStatsAssignment = React.useMemo(
    () => data?.assignments.find((item) => String(item.id) === statsAssignmentId) || null,
    [data?.assignments, statsAssignmentId]
  );

  const filteredStreamers = React.useMemo(() => {
    const search = normalizeText(streamerSearch);
    const items = [...(data?.streamers || [])];
    const filtered = !search
      ? items
      : items.filter((s) =>
          [s.displayName, s.accessUsername, s.accessCode, s.notes,
            ...s.assignments.map((a) => `${a.deal.casinoName} ${a.deal.name}`)]
            .map((v) => normalizeText(v))
            .some((v) => v.includes(search))
        );
    filtered.sort((l, r) => {
      if (streamerSort === "updated") return String(r.updatedAt || "").localeCompare(String(l.updatedAt || ""));
      if (streamerSort === "assignments") {
        const diff = r.assignments.length - l.assignments.length;
        if (diff !== 0) return diff;
      }
      if (streamerSort === "active") {
        const ra = r.assignments.filter((a) => a.activeDuringMonth).length;
        const la = l.assignments.filter((a) => a.activeDuringMonth).length;
        if (ra !== la) return ra - la;
      }
      return normalizeText(l.displayName).localeCompare(normalizeText(r.displayName), "fr");
    });
    return filtered;
  }, [data?.streamers, streamerSearch, streamerSort]);

  const sortedDeals = React.useMemo(() => {
    const items = [...(data?.deals || [])];
    items.sort((l, r) => {
      if (dealSort === "updated") return String(r.updatedAt || "").localeCompare(String(l.updatedAt || ""));
      if (dealSort === "cpa") {
        const diff = Number(r.cpaAmount || 0) - Number(l.cpaAmount || 0);
        if (diff !== 0) return diff;
      }
      if (dealSort === "rs") {
        const diff = Number(r.ersPercent || 0) - Number(l.ersPercent || 0);
        if (diff !== 0) return diff;
      }
      const cc = normalizeText(l.casinoName).localeCompare(normalizeText(r.casinoName), "fr");
      if (cc !== 0) return cc;
      return normalizeText(l.name).localeCompare(normalizeText(r.name), "fr");
    });
    return items;
  }, [data?.deals, dealSort]);

  const overviewMetrics = React.useMemo(() => {
    const assignments = data?.assignments || [];
    const active = assignments.filter((a) => a.activeDuringMonth);
    const byStreamer = new Map<number, { name: string; agency: number; streamer: number; gross: number; ftd: number; signups: number }>();
    for (const a of assignments) {
      const key = a.agencyStreamerId;
      const prev = byStreamer.get(key) || { name: a.streamerDisplayName || "—", agency: 0, streamer: 0, gross: 0, ftd: 0, signups: 0 };
      prev.agency += Number(a.payouts.agencyTotal || 0);
      prev.streamer += Number(a.payouts.streamerTotal || 0);
      prev.gross += Number(a.payouts.grossTotal || 0);
      prev.ftd += Number(a.stats.ftdCount || 0);
      prev.signups += Number(a.stats.signups || 0);
      byStreamer.set(key, prev);
    }
    const byCasino = new Map<number, { name: string; amount: number }>();
    for (const a of assignments) {
      const key = a.deal.casinoId;
      const prev = byCasino.get(key) || { name: a.deal.casinoName, amount: 0 };
      prev.amount += Number(a.payouts.grossTotal || 0);
      byCasino.set(key, prev);
    }
    const topStreamers = [...byStreamer.values()].sort((l, r) => r.gross - l.gross).slice(0, 8);
    const topCasinos = [...byCasino.values()].filter((c) => c.amount > 0).sort((l, r) => r.amount - l.amount).slice(0, 6);
    const totalSignups = assignments.reduce((s, a) => s + Number(a.stats.signups || 0), 0);
    const totalFtd = assignments.reduce((s, a) => s + Number(a.stats.ftdCount || 0), 0);
    const totalDeposits = assignments.reduce((s, a) => s + Number(a.stats.totalDeposits || 0), 0);
    const withStats = assignments.filter((a) => a.stats.signups != null || a.stats.ftdCount != null).length;
    return { active, topStreamers, topCasinos, totalSignups, totalFtd, totalDeposits, withStats };
  }, [data?.assignments]);

  const load = React.useCallback(async (targetMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getFsbAgencyDashboard(targetMonth);
      setData(response);
      setMonthKey(response.monthKey);
    } catch (err: any) {
      setError(String(err?.message || "Chargement agence impossible."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(monthKey); }, [load, monthKey]);

  React.useEffect(() => {
    if (!data?.assignments.length) { setStatsAssignmentId(""); return; }
    if (!statsAssignmentId || !data.assignments.some((a) => String(a.id) === statsAssignmentId)) {
      setStatsAssignmentId(String(data.assignments[0].id));
    }
  }, [data?.assignments, statsAssignmentId]);

  React.useEffect(() => {
    if (!selectedStatsAssignment) {
      setStatsSignups(""); setStatsDepositCount(""); setStatsFtdCount("");
      setStatsFtdFullBenef(""); setEnableFullBenef(false);
      setStatsDeposits(""); setStatsRsValue(""); setShowCpaToStreamer(true); setShowRsToStreamer(true);
      return;
    }
    setStatsSignups(selectedStatsAssignment.stats.signups == null ? "" : String(selectedStatsAssignment.stats.signups));
    setStatsDepositCount(selectedStatsAssignment.stats.depositCount == null ? "" : String(selectedStatsAssignment.stats.depositCount));
    setStatsFtdCount(selectedStatsAssignment.stats.ftdCount == null ? "" : String(selectedStatsAssignment.stats.ftdCount));
    const fb = selectedStatsAssignment.stats.ftdFullBenef;
    setStatsFtdFullBenef(fb == null ? "" : String(fb));
    setEnableFullBenef(fb != null && fb > 0);
    setStatsDeposits(selectedStatsAssignment.stats.totalDeposits == null ? "" : String(selectedStatsAssignment.stats.totalDeposits));
    setStatsRsValue(selectedStatsAssignment.stats.rsValue == null ? "" : String(selectedStatsAssignment.stats.rsValue));
    setShowCpaToStreamer(Boolean(selectedStatsAssignment.stats.showCpaToStreamer));
    setShowRsToStreamer(Boolean(selectedStatsAssignment.stats.showRsToStreamer));
  }, [selectedStatsAssignment]);

  // ─── Reset helpers ───────────────────────────────────────────────────────

  function resetCasinoForm() { setCasinoForm(EMPTY_CASINO_FORM); }
  function resetDealForm() { setDealForm(EMPTY_DEAL_FORM); }
  function resetStreamerForm() { setStreamerForm(EMPTY_STREAMER_FORM); }
  function resetAssignmentForm() { setAssignmentForm(EMPTY_ASSIGNMENT_FORM); }

  function applyResponse(response: AgencyDashboardResponse) {
    setData(response);
    setMonthKey(response.monthKey);
    setGeneratedAccess(response.generatedAccess ?? null);
  }

  async function runMutation(label: string, action: () => Promise<AgencyDashboardResponse>) {
    setSaving(label);
    setError(null);
    try {
      const response = await action();
      applyResponse(response);
      return response;
    } catch (err: any) {
      setError(String(err?.message || "Action impossible."));
      return null;
    } finally {
      setSaving(null);
    }
  }

  // ─── Edit helpers ─────────────────────────────────────────────────────────

  function startEditCasino(id: number) {
    const casino = data?.casinos.find((c) => c.id === id);
    if (!casino) return;
    setCasinoForm({ id: casino.id, name: casino.name, notes: casino.notes || "" });
    setActiveTab("config");
  }

  function startEditDeal(id: number) {
    const deal = data?.deals.find((d) => d.id === id);
    if (!deal) return;
    setDealForm({
      id: deal.id, casinoId: String(deal.casinoId), name: deal.name,
      cpaAmount: deal.cpaAmount == null ? "" : String(deal.cpaAmount),
      cpaAgencyCut: deal.cpaAgencyCut == null ? "" : String(deal.cpaAgencyCut),
      ersPercent: deal.ersPercent == null ? "" : String(deal.ersPercent),
      ersAgencyPercent: deal.ersAgencyPercent == null ? "" : String(deal.ersAgencyPercent),
      notes: deal.notes || "",
    });
    setActiveTab("config");
  }

  function startEditStreamer(streamer: AgencyStreamer) {
    setStreamerForm({
      id: streamer.id, displayName: streamer.displayName,
      notes: streamer.notes || "", publicNote: streamer.publicNote || "",
      initialDealId: "", initialStartDate: "", initialEndDate: "",
      initialPaymentDate: "", initialLinksText: "", initialAssignmentNotes: "",
    });
    setActiveTab("gestion");
    setGestionStep("streamer");
  }

  function startEditAssignment(assignment: AgencyAssignment) {
    setAssignmentForm({
      id: assignment.id,
      agencyStreamerId: String(assignment.agencyStreamerId),
      dealId: String(assignment.dealId),
      startDate: assignment.startDate || "",
      endDate: assignment.endDate || "",
      paymentDate: assignment.paymentDate || "",
      paymentFrequency: assignment.paymentFrequency || "monthly",
      linksText: assignment.linksText || "",
      notes: assignment.notes || "",
    });
    setActiveTab("gestion");
    setGestionStep("assignment");
  }

  function toggleStatsPanel(id: number) {
    const next = expandedStatsId === id ? null : id;
    setExpandedStatsId(next);
    if (next !== null) setStatsAssignmentId(String(id));
  }

  // ─── Form submit handlers ─────────────────────────────────────────────────

  async function saveCasino(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: casinoForm.name.trim(), notes: casinoForm.notes.trim() || null };
    const response = await runMutation("casino", () =>
      casinoForm.id ? updateAgencyCasino(casinoForm.id, payload, monthKey) : createAgencyCasino(payload, monthKey)
    );
    if (response) resetCasinoForm();
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();
    const casinoId = Number(dealForm.casinoId || 0);
    if (!casinoId) { setError("Choisis un casino."); return; }
    const payload = {
      casinoId, name: dealForm.name.trim(),
      cpaAmount: toNumberOrNull(dealForm.cpaAmount),
      cpaAgencyCut: toNumberOrNull(dealForm.cpaAgencyCut),
      ersPercent: toNumberOrNull(dealForm.ersPercent),
      ersAgencyPercent: toNumberOrNull(dealForm.ersAgencyPercent),
      notes: dealForm.notes.trim() || null,
    };
    const response = await runMutation("deal", () =>
      dealForm.id ? updateAgencyDeal(dealForm.id, payload, monthKey) : createAgencyDeal(payload, monthKey)
    );
    if (response) resetDealForm();
  }

  async function saveStreamer(e: React.FormEvent) {
    e.preventDefault();
    const response = await runMutation("streamer", () => {
      if (streamerForm.id) {
        return updateAgencyStreamer(streamerForm.id, {
          displayName: streamerForm.displayName.trim(),
          notes: streamerForm.notes.trim() || null,
          publicNote: streamerForm.publicNote.trim() || null,
        }, monthKey);
      }
      return createAgencyStreamer({
        displayName: streamerForm.displayName.trim(),
        notes: streamerForm.notes.trim() || null,
        publicNote: streamerForm.publicNote.trim() || null,
        initialDealId: streamerForm.initialDealId ? Number(streamerForm.initialDealId) : null,
        initialStartDate: streamerForm.initialStartDate || null,
        initialEndDate: streamerForm.initialEndDate || null,
        initialPaymentDate: streamerForm.initialPaymentDate || null,
        initialLinksText: streamerForm.initialLinksText.trim() || null,
        initialAssignmentNotes: streamerForm.initialAssignmentNotes.trim() || null,
      }, monthKey);
    });
    if (response) resetStreamerForm();
  }

  async function saveAssignment(e: React.FormEvent) {
    e.preventDefault();
    const dealId = Number(assignmentForm.dealId || 0);
    const agencyStreamerId = Number(assignmentForm.agencyStreamerId || 0);
    if (!dealId) { setError("Choisis un deal."); return; }
    if (!assignmentForm.id && !agencyStreamerId) { setError("Choisis un streamer."); return; }
    const payload = {
      dealId,
      startDate: assignmentForm.startDate || null,
      endDate: assignmentForm.endDate || null,
      paymentDate: assignmentForm.paymentDate || null,
      paymentFrequency: assignmentForm.paymentFrequency || "monthly" as "monthly" | "biweekly",
      linksText: assignmentForm.linksText.trim() || null,
      notes: assignmentForm.notes.trim() || null,
    };
    const response = await runMutation("assignment", () =>
      assignmentForm.id
        ? updateAgencyAssignment(assignmentForm.id, payload, monthKey)
        : createAgencyAssignment({ agencyStreamerId, ...payload }, monthKey)
    );
    if (response) resetAssignmentForm();
  }

  async function saveStats(e: React.FormEvent) {
    e.preventDefault();
    if (!statsAssignmentId) return;
    const response = await runMutation("stats", () =>
      updateAgencyStats(Number(statsAssignmentId), {
        monthKey,
        signups: toNumberOrNull(statsSignups),
        depositCount: toNumberOrNull(statsDepositCount),
        ftdCount: toNumberOrNull(statsFtdCount),
        ftdFullBenef: enableFullBenef ? toNumberOrNull(statsFtdFullBenef) : null,
        totalDeposits: toNumberOrNull(statsDeposits),
        rsValue: toNumberOrNull(statsRsValue),
        showCpaToStreamer,
        showRsToStreamer,
      }, monthKey)
    );
    if (response) setExpandedStatsId(null);
  }

  // ─── Delete handlers ──────────────────────────────────────────────────────

  async function handleDeleteCasino(id: number) {
    if (!window.confirm("Supprimer ce casino ?")) return;
    const response = await runMutation("delete-casino", () => deleteAgencyCasino(id, monthKey));
    if (response && casinoForm.id === id) resetCasinoForm();
  }

  async function handleDeleteDeal(id: number) {
    if (!window.confirm("Supprimer ce deal ?")) return;
    const response = await runMutation("delete-deal", () => deleteAgencyDeal(id, monthKey));
    if (response && dealForm.id === id) resetDealForm();
  }

  async function handleDeleteStreamer(id: number) {
    if (!window.confirm("Supprimer ce streamer et ses assignations ?")) return;
    const response = await runMutation("delete-streamer", () => deleteAgencyStreamer(id, monthKey));
    if (response && streamerForm.id === id) resetStreamerForm();
  }

  async function handleDeleteAssignment(id: number) {
    if (!window.confirm("Supprimer cette assignation ?")) return;
    const response = await runMutation("delete-assignment", () => deleteAgencyAssignment(id, monthKey));
    if (response && assignmentForm.id === id) resetAssignmentForm();
  }

  async function handleResetAccess(streamerId: number) {
    await runMutation("reset-access", () => resetAgencyStreamerAccess(streamerId, monthKey));
  }

  function getConsultationPath(streamer: Pick<AgencyStreamer, "accessUsername">) {
    return `/agency${streamer.accessUsername ? `?username=${encodeURIComponent(streamer.accessUsername)}` : ""}`;
  }

  function toAbsoluteUrl(path: string) {
    return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  }

  function getPreviewPath(streamer: Pick<AgencyStreamer, "id" | "accessUsername">) {
    const params = new URLSearchParams();
    params.set("preview", String(streamer.id));
    if (streamer.accessUsername) params.set("username", streamer.accessUsername);
    return `/agency?${params.toString()}`;
  }

  const loginUrl = generatedAccess && typeof window !== "undefined"
    ? `${window.location.origin}${generatedAccess.loginPath}?username=${encodeURIComponent(generatedAccess.username)}`
    : generatedAccess?.loginPath || null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Header & Month nav ────────────────────────────────────────────── */}
      <section className="fsb-card">
        <div className="fsb-sectionhead">
          <div>
            <h2 className="fsb-sectiontitle">Agence</h2>
            <div className="fsb-muted">Gestion des affilies, deals CPA / RS et stats mensuelles.</div>
          </div>
          <div className="fsb-actions">
            <button className="fsb-btn" type="button" onClick={() => setMonthKey(addMonths(monthKey, -1))}>‹ Mois préc.</button>
            <span className="fsb-pill" style={{ fontWeight: 800, minWidth: 130, textAlign: "center" }}>{monthLabel(monthKey)}</span>
            <button className="fsb-btn" type="button" onClick={() => setMonthKey(addMonths(monthKey, 1))}>Mois suiv. ›</button>
            <button
              className="fsb-btn"
              type="button"
              onClick={() => setMonthKey(currentMonthKey())}
              disabled={monthKey === currentMonthKey()}
            >
              Ce mois
            </button>
            <button className="fsb-btn" type="button" onClick={() => void load(monthKey)} disabled={loading}>
              {loading ? "..." : "↻"}
            </button>
          </div>
        </div>

        {/* History month pills */}
        {data?.historyMonths?.length ? (
          <div className="fsb-pills" style={{ marginTop: 12 }}>
            {data.historyMonths.slice(0, 10).map((item) => (
              <button
                key={item}
                type="button"
                className={`fsb-navbtn ${item === monthKey ? "fsb-navbtn-active" : ""}`}
                onClick={() => setMonthKey(item)}
              >
                {monthLabel(item)}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <div className="fsb-alert" style={{ marginTop: 12 }}>{error}</div> : null}

        {/* Summary stats */}
        <div className="fsb-stats" style={{ marginTop: 16 }}>
          <div className="fsb-stat">
            <small>Affiliés</small>
            <strong>{data?.summary.streamers ?? 0}</strong>
            <span>Streamers</span>
          </div>
          <div className="fsb-stat">
            <small>Deals actifs</small>
            <strong>{data?.summary.activeAssignments ?? 0}</strong>
            <span>Sur {monthLabel(monthKey)}</span>
          </div>
          <div className="fsb-stat">
            <small>Net affiliés</small>
            <strong>{eur(data?.summary.streamerEarnings ?? 0)}</strong>
            <span>À régler</span>
          </div>
          <div className="fsb-stat">
            <small>Marge agence</small>
            <strong>{eur(data?.summary.agencyEarnings ?? 0)}</strong>
            <span>Interne</span>
          </div>
          <div className="fsb-stat">
            <small>Casinos</small>
            <strong>{data?.summary.casinos ?? 0}</strong>
            <span>Partenaires</span>
          </div>
          <div className="fsb-stat">
            <small>Deals</small>
            <strong>{data?.summary.deals ?? 0}</strong>
            <span>Configurés</span>
          </div>
        </div>
      </section>

      {/* ── Access banner ─────────────────────────────────────────────────── */}
      {generatedAccess ? (
        <section className="fsb-card" style={{ marginTop: 14, background: "rgba(120,231,180,.06)", borderColor: "rgba(120,231,180,.2)" }}>
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0, color: "#8cf5c8" }}>Accès streamer généré</h3>
              <div className="fsb-muted">Transmets ces informations au streamer.</div>
            </div>
            <button className="fsb-btn" type="button" onClick={() => setGeneratedAccess(null)}>Fermer</button>
          </div>
          <div className="fsb-grid" style={{ marginTop: 12 }}>
            <div className="fsb-field">
              <label>Username</label>
              <input className="fsb-input" value={generatedAccess.username} readOnly />
            </div>
            <div className="fsb-field">
              <label>Code d'accès</label>
              <input className="fsb-input" value={generatedAccess.password} readOnly />
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Lien de connexion</label>
              <input className="fsb-input" value={loginUrl || generatedAccess.loginPath} readOnly />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Tab navigation ────────────────────────────────────────────────── */}
      <div className="fsb-tabs" style={{ marginTop: 18 }}>
        <button type="button" className={`fsb-tab ${activeTab === "overview" ? "fsb-tab-active" : ""}`} onClick={() => setActiveTab("overview")}>
          Vue d'ensemble
        </button>
        <button type="button" className={`fsb-tab ${activeTab === "affilies" ? "fsb-tab-active" : ""}`} onClick={() => setActiveTab("affilies")}>
          Affiliés{data ? ` (${data.summary.streamers})` : ""}
        </button>
        <button type="button" className={`fsb-tab ${activeTab === "gestion" ? "fsb-tab-active" : ""}`} onClick={() => setActiveTab("gestion")}>
          Gestion
        </button>
        <button type="button" className={`fsb-tab ${activeTab === "config" ? "fsb-tab-active" : ""}`} onClick={() => setActiveTab("config")}>
          Config
        </button>
      </div>

      <div className="fsb-tab-content">

        {/* ════════════════════════════════════════════════════════════════
            TAB: VUE D'ENSEMBLE — dashboard analytique
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" ? (
          <div style={{ display: "grid", gap: 14 }}>
            {/* Hero KPIs */}
            <div className="fsb-kpi-grid">
              <div className="fsb-kpi fsb-kpi-good">
                <small>Marge agence</small>
                <strong className="fsb-kpi-val fsb-kpi-val-pos">{eur(data?.summary.agencyEarnings ?? 0)}</strong>
                <div className="fsb-kpi-sub">
                  Revenu interne sur {monthLabel(monthKey)} · {data?.summary.activeAssignments ?? 0} deal{(data?.summary.activeAssignments ?? 0) > 1 ? "s" : ""} actif{(data?.summary.activeAssignments ?? 0) > 1 ? "s" : ""}
                </div>
              </div>
              <div className="fsb-kpi fsb-kpi-warn">
                <small>À reverser aux affiliés</small>
                <strong className="fsb-kpi-val">{eur(data?.summary.streamerEarnings ?? 0)}</strong>
                <div className="fsb-kpi-sub">Net affiliés — basé sur les stats saisies ce mois</div>
              </div>
            </div>

            {/* Mini stats operationnel */}
            <section className="fsb-card">
              <div className="fsb-muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
                Activité mesurée sur {monthLabel(monthKey)}
              </div>
              <div className="fsb-mini-stats">
                <div className="fsb-mini-stat"><small>Affiliés</small><strong>{data?.summary.streamers ?? 0}</strong></div>
                <div className="fsb-mini-stat"><small>Deals actifs</small><strong>{data?.summary.activeAssignments ?? 0}</strong></div>
                <div className="fsb-mini-stat"><small>Signups cumulés</small><strong>{num(overviewMetrics.totalSignups)}</strong></div>
                <div className="fsb-mini-stat"><small>FTD cumulés</small><strong>{num(overviewMetrics.totalFtd)}</strong></div>
                <div className="fsb-mini-stat"><small>Volume dépôts</small><strong>{eur(overviewMetrics.totalDeposits)}</strong></div>
                <div className="fsb-mini-stat"><small>Stats saisies</small><strong>{overviewMetrics.withStats}<span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}> / {data?.assignments.length ?? 0}</span></strong></div>
                <div className="fsb-mini-stat"><small>Casinos partenaires</small><strong>{data?.summary.casinos ?? 0}</strong></div>
                <div className="fsb-mini-stat"><small>Deals configurés</small><strong>{data?.summary.deals ?? 0}</strong></div>
              </div>
            </section>

            <div className="fsb-panel-split">
              {/* Top performers */}
              <section className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Top affiliés — volume brut</h3>
                    <div className="fsb-muted" style={{ fontSize: 12 }}>CPA brut + RS généré ce mois</div>
                  </div>
                </div>
                {overviewMetrics.topStreamers.length === 0 ? (
                  <div className="fsb-emptyblock" style={{ marginTop: 14 }}>Aucune donnée — saisir des stats depuis l'onglet Affiliés.</div>
                ) : (
                  <div className="fsb-barlist">
                    {(() => {
                      const max = overviewMetrics.topStreamers[0].gross || 1;
                      return overviewMetrics.topStreamers.map((s, i) => (
                        <div key={i} className="fsb-barlist-row">
                          <div className="fsb-barlist-name">
                            {s.name}
                            <small>{num(s.ftd)} FTD · {num(s.signups)} signups</small>
                          </div>
                          <div className="fsb-barlist-track">
                            <div className="fsb-barlist-bar" style={{ width: `${(s.gross / max) * 100}%` }} />
                          </div>
                          <div className="fsb-barlist-val">{eur(s.gross)}</div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </section>

              {/* Répartition par casino */}
              <section className="fsb-card">
                <div className="fsb-sectionhead">
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>Répartition par casino</h3>
                    <div className="fsb-muted" style={{ fontSize: 12 }}>Volume brut par partenaire</div>
                  </div>
                </div>
                {overviewMetrics.topCasinos.length === 0 ? (
                  <div className="fsb-emptyblock" style={{ marginTop: 14 }}>Aucune donnée.</div>
                ) : (
                  <>
                    {(() => {
                      const total = overviewMetrics.topCasinos.reduce((s, c) => s + c.amount, 0);
                      const palette = ["#6366f1", "#22d3ee", "#10b981", "#f59e0b", "#a855f7", "#f04e4e"];
                      return (
                        <>
                          <div className="fsb-stackbar" style={{ marginTop: 14 }}>
                            {overviewMetrics.topCasinos.map((c, i) => (
                              <div
                                key={i}
                                className="fsb-stackbar-seg"
                                style={{ width: `${total > 0 ? (c.amount / total) * 100 : 0}%`, background: palette[i % palette.length] }}
                                title={`${c.name} — ${eur(c.amount)}`}
                              />
                            ))}
                          </div>
                          <div className="fsb-legend">
                            {overviewMetrics.topCasinos.map((c, i) => (
                              <span key={i} className="fsb-legend-item">
                                <span className="fsb-legend-dot" style={{ background: palette[i % palette.length] }} />
                                <strong>{c.name}</strong>
                                <small>· {eur(c.amount)} ({total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%)</small>
                              </span>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
              </section>
            </div>

            {/* Actifs vs inactifs */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0, fontSize: 16 }}>Actifs ce mois</h3>
                  <div className="fsb-muted" style={{ fontSize: 12 }}>Deals dont la plage d'activité couvre {monthLabel(monthKey)}</div>
                </div>
                <button className="fsb-btn" type="button" onClick={() => setActiveTab("affilies")}>Voir les affiliés →</button>
              </div>
              {overviewMetrics.active.length === 0 ? (
                <div className="fsb-emptyblock" style={{ marginTop: 14 }}>Aucun deal actif sur ce mois.</div>
              ) : (
                <div className="fsb-tablewrap" style={{ marginTop: 14 }}>
                  <table className="fsb-table">
                    <thead>
                      <tr><th>Affilié</th><th>Deal</th><th>FTD</th><th>Net affilié</th><th>Marge agence</th><th>Màj stats</th></tr>
                    </thead>
                    <tbody>
                      {overviewMetrics.active.map((a) => (
                        <tr key={a.id}>
                          <td><strong>{a.streamerDisplayName}</strong></td>
                          <td><strong>{a.deal.casinoName}</strong><div className="fsb-sub">{a.deal.name}</div></td>
                          <td><strong>{num(a.stats.ftdCount)}</strong></td>
                          <td><strong style={{ color: "#6ee7b7" }}>{eur(a.payouts.streamerTotal)}</strong></td>
                          <td><strong>{eur(a.payouts.agencyTotal)}</strong></td>
                          <td><div className="fsb-sub">{dateTime(a.stats.updatedAt || a.updatedAt)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}


        {/* ════════════════════════════════════════════════════════════════
            TAB: AFFILIÉS — cartes streamers + stats inline
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "affilies" ? (
          <div style={{ display: "grid", gap: 14 }}>

            {/* Search + sort bar */}
            <div className="fsb-sectionhead" style={{ padding: 0 }}>
              <div className="fsb-actions">
                <input
                  className="fsb-input"
                  style={{ width: 220 }}
                  value={streamerSearch}
                  onChange={(e) => setStreamerSearch(e.target.value)}
                  placeholder="Rechercher un affilié..."
                />
                <select className="fsb-select" style={{ width: "auto" }} value={streamerSort} onChange={(e) => setStreamerSort(e.target.value)}>
                  <option value="name">Trier : nom</option>
                  <option value="updated">Trier : Maj récente</option>
                  <option value="active">Trier : actifs ce mois</option>
                  <option value="assignments">Trier : nb deals</option>
                </select>
              </div>
              <button className="fsb-btn fsb-btn-primary" type="button" onClick={() => { resetStreamerForm(); setActiveTab("gestion"); setGestionStep("streamer"); }}>
                + Ajouter un affilié
              </button>
            </div>

            {loading && !data ? (
              <div className="fsb-emptyblock">Chargement...</div>
            ) : filteredStreamers.length === 0 ? (
              <div className="fsb-emptyblock">
                {streamerSearch ? "Aucun affilié ne correspond à la recherche." : "Aucun affilié. Créez-en un dans Gestion."}
              </div>
            ) : (
              filteredStreamers.map((streamer) => {
                const activeAssignments = streamer.assignments.filter((a) => a.activeDuringMonth);
                const consultationPath = getConsultationPath(streamer);
                const previewPath = getPreviewPath(streamer);

                // Find the full assignment data (with payouts) from data.assignments
                const fullAssignments = (data?.assignments || []).filter(
                  (a) => a.agencyStreamerId === streamer.id
                );

                return (
                  <section key={streamer.id} className="fsb-card" style={{ padding: 0, overflow: "hidden" }}>
                    {/* Streamer header */}
                    <div style={{ padding: "14px 18px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <div
                          style={{
                            width: 38, height: 38, borderRadius: "50%",
                            background: "linear-gradient(135deg,rgba(255,178,107,.3),rgba(113,213,210,.2))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 800, fontSize: 16, flexShrink: 0,
                          }}
                        >
                          {streamer.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 16 }}>{streamer.displayName}</div>
                          <div className="fsb-muted" style={{ fontSize: 12 }}>
                            {streamer.accessUsername
                              ? <><span style={{ color: "#8cf5c8" }}>●</span> {streamer.accessUsername}</>
                              : <span style={{ color: "rgba(255,150,100,.7)" }}>Pas d'accès configuré</span>}
                            {" · "}
                            {activeAssignments.length} deal{activeAssignments.length !== 1 ? "s" : ""} actif{activeAssignments.length !== 1 ? "s" : ""} ce mois
                          </div>
                        </div>
                      </div>
                      <div className="fsb-inline" style={{ flexWrap: "wrap" }}>
                        <a className="fsb-jump" href={previewPath} target="_blank" rel="noreferrer">Preview</a>
                        <a className="fsb-jump" href={consultationPath} target="_blank" rel="noreferrer">Portail</a>
                        <button className="fsb-btn" type="button" onClick={() => void navigator.clipboard?.writeText(toAbsoluteUrl(consultationPath))}>Copier lien</button>
                        <button className="fsb-btn" type="button" onClick={() => startEditStreamer(streamer)}>Modifier</button>
                        <button className="fsb-btn" type="button" onClick={() => void handleResetAccess(streamer.id)} disabled={saving === "reset-access"}>Reset code</button>
                        <button className="fsb-btn" type="button" style={{ color: "rgba(255,120,100,.8)" }} onClick={() => void handleDeleteStreamer(streamer.id)}>Supp.</button>
                      </div>
                    </div>

                    {/* Notes internes */}
                    {streamer.notes ? (
                      <div style={{ padding: "8px 18px", background: "rgba(255,255,255,.02)", fontSize: 12, color: "rgba(214,225,242,.6)", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                        {streamer.notes}
                      </div>
                    ) : null}

                    {/* Assignments list */}
                    {fullAssignments.length === 0 ? (
                      <div style={{ padding: "14px 18px" }}>
                        <div className="fsb-muted" style={{ fontSize: 13 }}>Aucune assignation. <button className="fsb-jump" type="button" onClick={() => { resetAssignmentForm(); setAssignmentForm((p) => ({ ...p, agencyStreamerId: String(streamer.id) })); setActiveTab("gestion"); setGestionStep("assignment"); }}>Ajouter un deal →</button></div>
                      </div>
                    ) : (
                      fullAssignments.map((assignment) => {
                        const isExpanded = expandedStatsId === assignment.id;
                        const hasStats = assignment.stats.signups != null || assignment.stats.ftdCount != null;
                        return (
                          <div key={assignment.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                            {/* Assignment row */}
                            <div style={{ padding: "12px 18px", display: "grid", gap: 10, gridTemplateColumns: "1fr auto" }}>
                              <div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>{assignment.deal.casinoName}</span>
                                  <span className="fsb-muted" style={{ fontSize: 13 }}>— {assignment.deal.name}</span>
                                  {assignment.activeDuringMonth
                                    ? <span className="fsb-badge fsb-badge-green">Actif</span>
                                    : <span className="fsb-badge">Hors plage</span>}
                                </div>
                                {/* Stats grid */}
                                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                                  <StatChip label="Inscrits" value={num(assignment.stats.signups)} />
                                  <StatChip label="FTD" value={num(assignment.stats.ftdCount)} />
                                  {assignment.stats.ftdFullBenef != null && assignment.stats.ftdFullBenef > 0 && (
                                    <StatChip label="Full bénef" value={`+${assignment.stats.ftdFullBenef}`} />
                                  )}
                                  <StatChip label="Dépôts" value={num(assignment.stats.depositCount)} />
                                  <StatChip label="Volume" value={assignment.stats.totalDeposits == null ? "-" : eur(assignment.stats.totalDeposits)} />
                                  <StatChip label="Net affilié" value={eur(assignment.payouts.streamerTotal)} accent />
                                  <StatChip label="Marge agence" value={eur(assignment.payouts.agencyTotal)} />
                                  {hasStats && (
                                    <span className="fsb-muted" style={{ fontSize: 11, alignSelf: "center" }}>
                                      Màj {dateTime(assignment.stats.updatedAt || assignment.updatedAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="fsb-inline" style={{ alignSelf: "flex-start", flexDirection: "column", gap: 6 }}>
                                <button
                                  className={`fsb-btn ${isExpanded ? "fsb-btn-primary" : ""}`}
                                  type="button"
                                  onClick={() => toggleStatsPanel(assignment.id)}
                                  style={{ whiteSpace: "nowrap" }}
                                >
                                  {isExpanded ? "✕ Fermer" : "Saisir stats"}
                                </button>
                                <button className="fsb-btn" type="button" style={{ fontSize: 11 }} onClick={() => startEditAssignment(assignment)}>
                                  Modifier deal
                                </button>
                                <button className="fsb-btn" type="button" style={{ fontSize: 11, color: "rgba(255,120,100,.8)" }} onClick={() => void handleDeleteAssignment(assignment.id)}>
                                  Supprimer
                                </button>
                              </div>
                            </div>

                            {/* ── Stats panel (snapshots + legacy) ── */}
                            {isExpanded && (
                              <div style={{ margin: "0 18px 14px", background: "rgba(255,178,107,.04)", border: "1px solid rgba(255,178,107,.15)", borderRadius: 14, overflow: "hidden" }}>
                                {/* Mode tabs */}
                                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.07)", background: "rgba(0,0,0,.12)" }}>
                                  <button
                                    type="button"
                                    onClick={() => setStatsMode("snapshots")}
                                    style={{
                                      padding: "9px 18px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                                      background: statsMode === "snapshots" ? "rgba(255,178,107,.15)" : "transparent",
                                      color: statsMode === "snapshots" ? "rgba(255,178,107,1)" : "rgba(214,225,242,.5)",
                                      borderBottom: statsMode === "snapshots" ? "2px solid rgba(255,178,107,.8)" : "2px solid transparent",
                                    }}
                                  >
                                    Saisies v2
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setStatsMode("legacy")}
                                    style={{
                                      padding: "9px 18px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
                                      background: statsMode === "legacy" ? "rgba(255,255,255,.05)" : "transparent",
                                      color: statsMode === "legacy" ? "rgba(214,225,242,.8)" : "rgba(214,225,242,.4)",
                                      borderBottom: statsMode === "legacy" ? "2px solid rgba(214,225,242,.4)" : "2px solid transparent",
                                    }}
                                  >
                                    Mode legacy
                                  </button>
                                  <div style={{ flex: 1 }} />
                                  <button
                                    type="button"
                                    onClick={() => setExpandedStatsId(null)}
                                    style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer", background: "transparent", color: "rgba(214,225,242,.4)" }}
                                  >
                                    ✕
                                  </button>
                                </div>

                                {/* ── Snapshot panel ── */}
                                {statsMode === "snapshots" && (
                                  <SnapshotPanel
                                    assignment={assignment}
                                    monthKey={monthKey}
                                    onRefresh={() => void load(monthKey)}
                                  />
                                )}

                                {/* ── Legacy form ── */}
                                {statsMode === "legacy" && (
                                  <div style={{ padding: 16 }}>
                                    <div className="fsb-muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 12 }}>
                                      Stats legacy — {assignment.deal.casinoName} / {assignment.deal.name} — {monthLabel(monthKey)}
                                    </div>
                                    <form onSubmit={saveStats}>
                                      <div className="fsb-grid">
                                        <div className="fsb-field">
                                          <label>Inscrits</label>
                                          <input className="fsb-input" type="number" min="0" step="1" value={statsSignups} onChange={(e) => setStatsSignups(e.target.value)} />
                                        </div>
                                        <div className="fsb-field">
                                          <label>FTD total</label>
                                          <input className="fsb-input" type="number" min="0" step="1" value={statsFtdCount} onChange={(e) => setStatsFtdCount(e.target.value)} />
                                        </div>
                                        <div className="fsb-field">
                                          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <input
                                              type="checkbox"
                                              checked={enableFullBenef}
                                              onChange={(e) => {
                                                setEnableFullBenef(e.target.checked);
                                                if (!e.target.checked) setStatsFtdFullBenef("");
                                              }}
                                            />
                                            Full bénef (FTD agence)
                                          </label>
                                          {enableFullBenef && (
                                            <>
                                              <input
                                                className="fsb-input"
                                                type="number"
                                                min="0"
                                                step="1"
                                                max={statsFtdCount || undefined}
                                                value={statsFtdFullBenef}
                                                onChange={(e) => setStatsFtdFullBenef(e.target.value)}
                                                placeholder="Nb FTD full bénef"
                                              />
                                              {statsFtdCount && statsFtdFullBenef && (
                                                <div className="fsb-hint" style={{ marginTop: 4 }}>
                                                  Affilié voit : {Math.max(Number(statsFtdCount) - Number(statsFtdFullBenef), 0)} FTD · Agence full bénef : {statsFtdFullBenef}
                                                </div>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        <div className="fsb-field">
                                          <label>Nb dépôts</label>
                                          <input className="fsb-input" type="number" min="0" step="1" value={statsDepositCount} onChange={(e) => setStatsDepositCount(e.target.value)} />
                                        </div>
                                        <div className="fsb-field">
                                          <label>Volume dépôts (€)</label>
                                          <input className="fsb-input" type="number" min="0" step="0.01" value={statsDeposits} onChange={(e) => setStatsDeposits(e.target.value)} />
                                        </div>
                                        <div className="fsb-field">
                                          <label>RS net affilié (€)</label>
                                          <input className="fsb-input" type="number" step="0.01" value={statsRsValue} onChange={(e) => setStatsRsValue(e.target.value)} />
                                        </div>
                                        <div className="fsb-field" style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "flex-end" }}>
                                          <label className="fsb-check">
                                            <input type="checkbox" checked={!showCpaToStreamer} onChange={(e) => setShowCpaToStreamer(!e.target.checked)} />
                                            Masquer CPA au streamer
                                          </label>
                                          <label className="fsb-check">
                                            <input type="checkbox" checked={!showRsToStreamer} onChange={(e) => setShowRsToStreamer(!e.target.checked)} />
                                            Masquer RS au streamer
                                          </label>
                                        </div>
                                      </div>
                                      {/* Computed preview */}
                                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0", fontSize: 13 }}>
                                        <StatChip label="CPA calculé" value={eur(Number(statsFtdCount || 0) * Number(assignment.deal.cpaAmount || 0) * (1 - Number(assignment.deal.cpaAgencyCut || 0) / Number(assignment.deal.cpaAmount || 1)))} />
                                        <StatChip label="CPA total brut" value={eur(Number(statsFtdCount || 0) * Number(assignment.deal.cpaAmount || 0))} />
                                        <StatChip label="RS affilié" value={statsRsValue ? eur(Number(statsRsValue)) : "-"} accent />
                                      </div>
                                      <div className="fsb-modal-actions" style={{ marginTop: 8, paddingTop: 0 }}>
                                        <button className="fsb-btn" type="button" onClick={() => setExpandedStatsId(null)}>Annuler</button>
                                        <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "stats"}>
                                          {saving === "stats" ? "Enregistrement..." : "Valider les stats"}
                                        </button>
                                      </div>
                                    </form>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Add assignment CTA */}
                    <div style={{ padding: "10px 18px" }}>
                      <button
                        className="fsb-jump"
                        type="button"
                        onClick={() => {
                          resetAssignmentForm();
                          setAssignmentForm((p) => ({ ...p, agencyStreamerId: String(streamer.id) }));
                          setActiveTab("gestion");
                          setGestionStep("assignment");
                        }}
                        style={{ fontSize: 12 }}
                      >
                        + Ajouter un deal à {streamer.displayName}
                      </button>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════
            TAB: GESTION — formulaires streamer + assignation
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "gestion" ? (
          <>
            {/* Stepper */}
            <div className="fsb-step-nav">
              <button
                type="button"
                className={`fsb-step ${gestionStep === "streamer" ? "fsb-step-active" : ""}`}
                onClick={() => setGestionStep("streamer")}
              >
                <span className="fsb-step-num">1</span>
                {streamerForm.id ? "Modifier affilié" : "Profil affilié"}
              </button>
              <button
                type="button"
                className={`fsb-step ${gestionStep === "assignment" ? "fsb-step-active" : ""}`}
                onClick={() => setGestionStep("assignment")}
              >
                <span className="fsb-step-num">2</span>
                {assignmentForm.id ? "Modifier assignation" : "Assignation deal"}
              </button>
              <div style={{ flex: 1 }} />
              <button className="fsb-btn" type="button" onClick={() => setActiveTab("affilies")}>← Retour aux affiliés</button>
            </div>

            {gestionStep === "streamer" ? (
            <>
            {/* ─── Streamer form ─────────────────────────────────────── */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>
                    {streamerForm.id ? `Modifier : ${streamerForm.displayName}` : "Ajouter un affilié"}
                  </h3>
                  <div className="fsb-muted">
                    {streamerForm.id
                      ? "Modification du profil. Gérer les deals via le formulaire Assignation ci-dessous."
                      : "Création de la fiche avec accès dédié généré automatiquement."}
                  </div>
                </div>
                {streamerForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetStreamerForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveStreamer}>
                <div className="fsb-grid">
                  <div className="fsb-field fsb-field-full">
                    <label>Nom affiché</label>
                    <input
                      className="fsb-input"
                      value={streamerForm.displayName}
                      onChange={(e) => setStreamerForm((p) => ({ ...p, displayName: e.target.value }))}
                      required
                    />
                  </div>
                  {!streamerForm.id ? (
                    <>
                      <div className="fsb-field fsb-field-full" style={{ borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 14, marginTop: 4 }}>
                        <label>Deal initial (optionnel)</label>
                        <select
                          className="fsb-select"
                          value={streamerForm.initialDealId}
                          onChange={(e) => setStreamerForm((p) => ({ ...p, initialDealId: e.target.value }))}
                        >
                          <option value="">Aucun pour l'instant</option>
                          {(data?.deals || []).map((deal) => (
                            <option key={deal.id} value={String(deal.id)}>
                              {deal.casinoName} — {deal.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {streamerForm.initialDealId ? (
                        <>
                          <div className="fsb-field">
                            <label>Date début</label>
                            <input className="fsb-input" type="date" value={streamerForm.initialStartDate} onChange={(e) => setStreamerForm((p) => ({ ...p, initialStartDate: e.target.value }))} />
                          </div>
                          <div className="fsb-field">
                            <label>Date fin</label>
                            <input className="fsb-input" type="date" value={streamerForm.initialEndDate} onChange={(e) => setStreamerForm((p) => ({ ...p, initialEndDate: e.target.value }))} />
                          </div>
                          <div className="fsb-field">
                            <label>Jour paiement mensuel</label>
                            <input className="fsb-input" type="date" value={streamerForm.initialPaymentDate} onChange={(e) => setStreamerForm((p) => ({ ...p, initialPaymentDate: e.target.value }))} />
                          </div>
                          <div className="fsb-field">
                            <label>Notes assignation</label>
                            <input className="fsb-input" value={streamerForm.initialAssignmentNotes} onChange={(e) => setStreamerForm((p) => ({ ...p, initialAssignmentNotes: e.target.value }))} />
                          </div>
                          <div className="fsb-field fsb-field-full">
                            <label>Liens utiles</label>
                            <textarea className="fsb-textarea" value={streamerForm.initialLinksText} onChange={(e) => setStreamerForm((p) => ({ ...p, initialLinksText: e.target.value }))} />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <div className="fsb-field fsb-field-full">
                    <label>Notes internes (non visibles par l'affilié)</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={streamerForm.notes} onChange={(e) => setStreamerForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Note publique (visible par l'affilié sur son portail)</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={streamerForm.publicNote} onChange={(e) => setStreamerForm((p) => ({ ...p, publicNote: e.target.value }))} />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "streamer"}>
                    {saving === "streamer" ? "Enregistrement..." : streamerForm.id ? "Mettre à jour" : "Créer l'affilié"}
                  </button>
                </div>
              </form>
            </section>

            </>
            ) : null}

            {gestionStep === "assignment" ? (
            <>
            {/* ─── Assignment form ───────────────────────────────────── */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>
                    {assignmentForm.id ? "Modifier l'assignation" : "Ajouter une assignation"}
                  </h3>
                  <div className="fsb-muted">Attribuer un deal casino à un affilié avec ses conditions.</div>
                </div>
                {assignmentForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetAssignmentForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveAssignment}>
                <div className="fsb-grid">
                  {!assignmentForm.id ? (
                    <div className="fsb-field">
                      <label>Affilié</label>
                      <select
                        className="fsb-select"
                        value={assignmentForm.agencyStreamerId}
                        onChange={(e) => setAssignmentForm((p) => ({ ...p, agencyStreamerId: e.target.value }))}
                        required
                      >
                        <option value="">Choisir un affilié</option>
                        {(data?.streamers || []).map((s) => (
                          <option key={s.id} value={String(s.id)}>{s.displayName}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="fsb-field">
                    <label>Deal</label>
                    <select
                      className="fsb-select"
                      value={assignmentForm.dealId}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, dealId: e.target.value }))}
                      required
                    >
                      <option value="">Choisir un deal</option>
                      {(data?.deals || []).map((deal) => (
                        <option key={deal.id} value={String(deal.id)}>
                          {deal.casinoName} — {deal.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Date début</label>
                    <input className="fsb-input" type="date" value={assignmentForm.startDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Date fin</label>
                    <input className="fsb-input" type="date" value={assignmentForm.endDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Fréquence de paiement</label>
                    <select className="fsb-select" value={assignmentForm.paymentFrequency} onChange={(e) => setAssignmentForm((p) => ({ ...p, paymentFrequency: e.target.value as "monthly" | "biweekly" }))}>
                      <option value="monthly">Mensuel</option>
                      <option value="biweekly">Bimensuel</option>
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Jour de paiement (référence)</label>
                    <input className="fsb-input" type="date" value={assignmentForm.paymentDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, paymentDate: e.target.value }))} />
                    <div className="fsb-hint">Ex : activité avril + paiement le 15 → frais au 15 mai.</div>
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Liens utiles (un par ligne)</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={assignmentForm.linksText} onChange={(e) => setAssignmentForm((p) => ({ ...p, linksText: e.target.value }))} />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Notes internes</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={assignmentForm.notes} onChange={(e) => setAssignmentForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "assignment"}>
                    {saving === "assignment" ? "Enregistrement..." : assignmentForm.id ? "Mettre à jour" : "Créer l'assignation"}
                  </button>
                </div>
              </form>
            </section>

            </>
            ) : null}

            {/* ─── Streamers list (always visible in gestion) ──────── */}
            <section className="fsb-card" style={{ marginTop: 14 }}>
              <div className="fsb-sectionhead">
                <h3 style={{ margin: 0 }}>Tous les affiliés ({filteredStreamers.length})</h3>
              </div>
              <div className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr>
                      <th>Affilié</th>
                      <th>Accès</th>
                      <th>Deals</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStreamers.map((streamer) => {
                      const consultationPath = getConsultationPath(streamer);
                      return (
                        <tr key={streamer.id}>
                          <td>
                            <strong>{streamer.displayName}</strong>
                            <div className="fsb-sub">{streamer.notes || "Aucune note"}</div>
                          </td>
                          <td>
                            <strong>{streamer.accessUsername || "-"}</strong>
                            <div className="fsb-sub">Code : {streamer.accessCode || "—"}</div>
                            <div className="fsb-sub" style={{ wordBreak: "break-all", maxWidth: 260 }}>{toAbsoluteUrl(consultationPath)}</div>
                          </td>
                          <td>
                            <strong>{streamer.assignments.length} deals</strong>
                            <div className="fsb-sub">{streamer.assignments.filter((a) => a.activeDuringMonth).length} actifs sur {monthLabel(monthKey)}</div>
                          </td>
                          <td>
                            <div className="fsb-inline">
                              <button type="button" onClick={() => startEditStreamer(streamer)}>Modifier</button>
                              <button type="button" onClick={() => void handleResetAccess(streamer.id)}>Reset code</button>
                              <button type="button" onClick={() => void handleDeleteStreamer(streamer.id)}>Supprimer</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!filteredStreamers.length ? (
                      <tr><td colSpan={4}><div className="fsb-sub">Aucun affilié.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════
            TAB: CONFIG — casinos & deals
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "config" ? (
          <div className="fsb-panel-split">
            {/* ─── Casino form + table ───────────────────────────────── */}
            <section className="fsb-card" style={{ margin: 0 }}>
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>{casinoForm.id ? `Modifier : ${casinoForm.name}` : "Ajouter un casino"}</h3>
                  <div className="fsb-muted">Partenaires casino, base de référence pour les deals.</div>
                </div>
                {casinoForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetCasinoForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveCasino}>
                <div className="fsb-grid">
                  <div className="fsb-field">
                    <label>Nom du casino</label>
                    <input className="fsb-input" value={casinoForm.name} onChange={(e) => setCasinoForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="fsb-field">
                    <label>Notes</label>
                    <input className="fsb-input" value={casinoForm.notes} onChange={(e) => setCasinoForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "casino"}>
                    {saving === "casino" ? "Enregistrement..." : casinoForm.id ? "Mettre à jour" : "Créer"}
                  </button>
                </div>
              </form>
              <div className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr><th>Casino</th><th>Notes</th><th>Màj</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {(data?.casinos || []).map((casino) => (
                      <tr key={casino.id}>
                        <td><strong>{casino.name}</strong></td>
                        <td>{casino.notes || "-"}</td>
                        <td><div className="fsb-sub">{dateTime(casino.updatedAt)}</div></td>
                        <td>
                          <div className="fsb-inline">
                            <button type="button" onClick={() => startEditCasino(casino.id)}>Modifier</button>
                            <button type="button" onClick={() => void handleDeleteCasino(casino.id)}>Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!(data?.casinos || []).length ? (
                      <tr><td colSpan={4}><div className="fsb-sub">Aucun casino.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ─── Deal form + table ─────────────────────────────────── */}
            <section className="fsb-card" style={{ margin: 0 }}>
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>{dealForm.id ? `Modifier : ${dealForm.name}` : "Ajouter un deal"}</h3>
                  <div className="fsb-muted">Règles CPA et RS, marge agence incluse.</div>
                </div>
                {dealForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetDealForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveDeal}>
                <div className="fsb-grid">
                  <div className="fsb-field">
                    <label>Casino</label>
                    <select className="fsb-select" value={dealForm.casinoId} onChange={(e) => setDealForm((p) => ({ ...p, casinoId: e.target.value }))} required>
                      <option value="">Choisir un casino</option>
                      {(data?.casinos || []).map((casino) => (
                        <option key={casino.id} value={String(casino.id)}>{casino.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Nom du deal</label>
                    <input className="fsb-input" value={dealForm.name} onChange={(e) => setDealForm((p) => ({ ...p, name: e.target.value }))} required />
                  </div>
                  <div className="fsb-field">
                    <label>CPA total / FTD (€)</label>
                    <input className="fsb-input" type="number" min="0" step="0.01" value={dealForm.cpaAmount} onChange={(e) => setDealForm((p) => ({ ...p, cpaAmount: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Part agence / FTD (€)</label>
                    <input className="fsb-input" type="number" min="0" step="0.01" value={dealForm.cpaAgencyCut} onChange={(e) => setDealForm((p) => ({ ...p, cpaAgencyCut: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>RS total %</label>
                    <input className="fsb-input" type="number" min="0" max="100" step="0.01" value={dealForm.ersPercent} onChange={(e) => setDealForm((p) => ({ ...p, ersPercent: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Part agence RS %</label>
                    <input className="fsb-input" type="number" min="0" max="100" step="0.01" value={dealForm.ersAgencyPercent} onChange={(e) => setDealForm((p) => ({ ...p, ersAgencyPercent: e.target.value }))} />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Notes</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={dealForm.notes} onChange={(e) => setDealForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "deal"}>
                    {saving === "deal" ? "Enregistrement..." : dealForm.id ? "Mettre à jour" : "Créer le deal"}
                  </button>
                </div>
              </form>

              <div className="fsb-tablewrap">
                <div className="fsb-sectionhead" style={{ padding: "14px 16px 0" }}>
                  <div className="fsb-muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>
                    {sortedDeals.length} deal{sortedDeals.length > 1 ? "s" : ""}
                  </div>
                  <select className="fsb-select" style={{ width: "auto" }} value={dealSort} onChange={(e) => setDealSort(e.target.value)}>
                    <option value="casino-name">Trier : casino puis nom</option>
                    <option value="updated">Trier : Maj récente</option>
                    <option value="cpa">Trier : CPA desc</option>
                    <option value="rs">Trier : RS desc</option>
                  </select>
                </div>
                <table className="fsb-table">
                  <thead>
                    <tr><th>Deal</th><th>CPA</th><th>RS</th><th>Màj</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {sortedDeals.map((deal: AgencyDeal) => (
                      <tr key={deal.id}>
                        <td>
                          <strong>{deal.name}</strong>
                          <div className="fsb-sub">{deal.casinoName}</div>
                        </td>
                        <td>
                          <strong>{deal.cpaAmount == null ? "-" : eur(deal.cpaAmount)}</strong>
                          <div className="fsb-sub">Agence {deal.cpaAgencyCut == null ? "-" : eur(deal.cpaAgencyCut)}</div>
                        </td>
                        <td>
                          <strong>{pct(deal.ersPercent)}</strong>
                          <div className="fsb-sub">Agence {pct(deal.ersAgencyPercent)}</div>
                        </td>
                        <td><div className="fsb-sub">{dateTime(deal.updatedAt)}</div></td>
                        <td>
                          <div className="fsb-inline">
                            <button type="button" onClick={() => startEditDeal(deal.id)}>Modifier</button>
                            <button type="button" onClick={() => void handleDeleteDeal(deal.id)}>Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!sortedDeals.length ? (
                      <tr><td colSpan={5}><div className="fsb-sub">Aucun deal.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}

      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(214,225,242,.55)", fontWeight: 800 }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 14, color: accent ? "rgba(255,178,107,1)" : undefined }}>{value}</span>
    </span>
  );
}

// ─── SnapshotPanel ────────────────────────────────────────────────────────────

type SnapshotPeriod = "week" | "month" | "all";

type SnapshotFormState = {
  capturedAt: string;
  signups: string;
  ftdCount: string;
  ftdSumDep: string;
  totalDeposits: string;
  rsAmount: string;
  bonusAmount: string;
  manualCpaSplit: string;
  manualRsSplit: string;
  note: string;
  showManualOverride: boolean;
};

const EMPTY_SNAPSHOT_FORM: SnapshotFormState = {
  capturedAt: "",
  signups: "",
  ftdCount: "",
  ftdSumDep: "",
  totalDeposits: "",
  rsAmount: "",
  bonusAmount: "0",
  manualCpaSplit: "",
  manualRsSplit: "",
  note: "",
  showManualOverride: false,
};

function nowLocalDatetime() {
  const d = new Date();
  // Format: YYYY-MM-DDTHH:mm (compatible datetime-local input)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function snapshotFormToInput(form: SnapshotFormState): AgencySnapshotInput {
  return {
    capturedAt: form.capturedAt ? new Date(form.capturedAt).toISOString() : null,
    signups: toSnapshotNum(form.signups),
    ftdCount: toSnapshotNum(form.ftdCount),
    ftdSumDep: toSnapshotNum(form.ftdSumDep),
    totalDeposits: toSnapshotNum(form.totalDeposits),
    rsAmount: toSnapshotNum(form.rsAmount),
    bonusAmount: toSnapshotNum(form.bonusAmount) ?? 0,
    manualCpaSplit: toSnapshotNum(form.manualCpaSplit),
    manualRsSplit: toSnapshotNum(form.manualRsSplit),
    note: form.note.trim() || null,
  };
}

function toSnapshotNum(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function snapshotFromSnapshot(snap: AgencySnapshot): SnapshotFormState {
  const pad = (n: number) => String(n).padStart(2, "0");
  function toLocalDatetime(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return {
    capturedAt: toLocalDatetime(snap.capturedAt),
    signups: snap.signups == null ? "" : String(snap.signups),
    ftdCount: snap.ftdCount == null ? "" : String(snap.ftdCount),
    ftdSumDep: snap.ftdSumDep == null ? "" : String(snap.ftdSumDep),
    totalDeposits: snap.totalDeposits == null ? "" : String(snap.totalDeposits),
    rsAmount: snap.rsAmount == null ? "" : String(snap.rsAmount),
    bonusAmount: String(snap.bonusAmount ?? 0),
    manualCpaSplit: snap.bonusCpaSplit ? String(snap.bonusCpaSplit) : "",
    manualRsSplit: snap.bonusRsSplit ? String(snap.bonusRsSplit) : "",
    note: snap.note || "",
    showManualOverride: false,
  };
}

function SnapshotPanel({
  assignment,
  monthKey,
  onRefresh,
}: {
  assignment: AgencyAssignment;
  monthKey: string;
  onRefresh: () => void;
}) {
  const [period, setPeriod] = React.useState<SnapshotPeriod>("month");
  const [listData, setListData] = React.useState<AgencySnapshotsListResponse | null>(null);
  const [listLoading, setListLoading] = React.useState(false);
  const [listError, setListError] = React.useState<string | null>(null);

  // Form modal state: null = closed, "new" = new snapshot, number = editing snapshotId
  const [formMode, setFormMode] = React.useState<null | "new" | number>(null);
  const [form, setForm] = React.useState<SnapshotFormState>(EMPTY_SNAPSHOT_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [formSaving, setFormSaving] = React.useState(false);

  // Live preview
  const [preview, setPreview] = React.useState<AgencyPreviewBonusResponse | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const loadSnapshots = React.useCallback(async (p: SnapshotPeriod) => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await getAgencySnapshots(assignment.id, { period: p, date: monthKey + "-15" });
      setListData(res);
    } catch (err: unknown) {
      setListError(String((err as { message?: string })?.message || "Chargement impossible."));
    } finally {
      setListLoading(false);
    }
  }, [assignment.id, monthKey]);

  React.useEffect(() => { void loadSnapshots(period); }, [loadSnapshots, period]);

  // Debounced preview
  React.useEffect(() => {
    if (formMode === null) { setPreview(null); return; }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      try {
        const input = snapshotFormToInput(form);
        const res = await previewAgencyBonus(assignment.id, input);
        setPreview(res);
        setPreviewError(null);
      } catch {
        setPreviewError("Prévisualisation indisponible.");
        setPreview(null);
      }
    }, 400);
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, assignment.id, formMode]);

  function openNewForm() {
    setForm({ ...EMPTY_SNAPSHOT_FORM, capturedAt: nowLocalDatetime() });
    setFormMode("new");
    setFormError(null);
    setPreview(null);
  }

  function openEditForm(snap: AgencySnapshot) {
    setForm(snapshotFromSnapshot(snap));
    setFormMode(snap.id);
    setFormError(null);
    setPreview(null);
  }

  function closeForm() {
    setFormMode(null);
    setFormError(null);
    setPreview(null);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      const input = snapshotFormToInput(form);
      if (formMode === "new") {
        await createAgencySnapshot(assignment.id, input);
      } else if (typeof formMode === "number") {
        await updateAgencySnapshot(formMode, input);
      }
      closeForm();
      await loadSnapshots(period);
      onRefresh();
    } catch (err: unknown) {
      setFormError(String((err as { message?: string })?.message || "Erreur lors de la sauvegarde."));
    } finally {
      setFormSaving(false);
    }
  }

  function confirmDelete(snapshotId: number) {
    setDeletingId(snapshotId);
  }

  async function executeDelete() {
    if (deletingId == null) return;
    setDeleteLoading(true);
    try {
      await deleteAgencySnapshot(deletingId);
      setDeletingId(null);
      await loadSnapshots(period);
      onRefresh();
    } catch (err: unknown) {
      setListError(String((err as { message?: string })?.message || "Suppression impossible."));
    } finally {
      setDeleteLoading(false);
    }
  }

  const deal = assignment.deal;
  const agg = listData?.aggregate ?? null;
  const snapshots = listData?.snapshots ?? [];

  // Find per-snapshot agg by id for bonus display
  const aggBySnap = React.useMemo(() => {
    const map = new Map<number, AgencyPerSnapshotAgg>();
    for (const s of agg?.perSnapshot ?? []) map.set(s.snapshotId, s);
    return map;
  }, [agg]);

  const hasBonusInForm = (toSnapshotNum(form.bonusAmount) ?? 0) !== 0;

  return (
    <div style={{ padding: 16 }}>
      {/* ── Deal reminder header ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14, padding: "10px 14px", background: "rgba(255,255,255,.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)" }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{deal.casinoName}</div>
        <div className="fsb-muted" style={{ fontSize: 12 }}>— {deal.name}</div>
        {deal.cpaAmount != null && (
          <span className="fsb-badge" style={{ fontSize: 11 }}>
            CPA {eur(deal.cpaAmount)}/FTD
            {deal.cpaAgencyCut != null ? ` (affilié ${eur(deal.cpaAmount - deal.cpaAgencyCut)})` : ""}
          </span>
        )}
        {deal.ersPercent != null && (
          <span className="fsb-badge" style={{ fontSize: 11 }}>
            RS {pct(deal.ersPercent)}
            {deal.ersAgencyPercent != null ? ` (affilié ${pct(deal.ersPercent - deal.ersAgencyPercent)})` : ""}
          </span>
        )}
      </div>

      {/* ── Period selector ── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        {(["week", "month", "all"] as SnapshotPeriod[]).map((p) => (
          <button
            key={p}
            type="button"
            className={`fsb-navbtn ${period === p ? "fsb-navbtn-active" : ""}`}
            onClick={() => { setPeriod(p); }}
            style={{ fontSize: 11 }}
          >
            {p === "week" ? "Cette semaine" : p === "month" ? "Ce mois" : "Tout"}
          </button>
        ))}
        <button
          type="button"
          className="fsb-btn"
          onClick={() => void loadSnapshots(period)}
          style={{ marginLeft: "auto", fontSize: 11 }}
          disabled={listLoading}
        >
          {listLoading ? "..." : "↻ Actualiser"}
        </button>
        <button type="button" className="fsb-btn fsb-btn-primary" style={{ fontSize: 11 }} onClick={openNewForm}>
          + Nouvelle saisie
        </button>
      </div>

      {listError ? <div className="fsb-alert" style={{ marginBottom: 12 }}>{listError}</div> : null}

      {/* ── Period aggregate ── */}
      {agg != null && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "rgba(99,102,241,.07)", border: "1px solid rgba(99,102,241,.2)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(167,139,250,.8)", marginBottom: 10 }}>
            Agrégat période — {snapshots.length} saisie{snapshots.length !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <StatChip label="Signups" value={num(agg.adjustedTotals.signups)} />
            <StatChip label="FTD (ajusté)" value={num(agg.adjustedTotals.ftd)} />
            <StatChip label="Volume dépôts" value={eur(agg.adjustedTotals.totalDeposits)} />
            <StatChip label="Affilié CPA" value={eur(agg.adjustedTotals.cpaEarnings)} accent />
            <StatChip label="Affilié RS" value={eur(agg.adjustedTotals.rsEarnings)} accent />
            <StatChip label="Total affilié" value={eur(agg.adjustedTotals.totalEarnings)} accent />
            <StatChip label="Marge agence" value={eur(agg.agencyTotals.total)} />
            {agg.agencyTotals.bonusTotal !== 0 && (
              <StatChip label="Bonus total" value={eur(agg.agencyTotals.bonusTotal)} />
            )}
          </div>
        </div>
      )}

      {/* ── Snapshot form modal (inline) ── */}
      {formMode !== null && (
        <div style={{ marginBottom: 16, padding: 16, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,178,107,.25)", borderRadius: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 14 }}>
            {formMode === "new" ? "Nouvelle saisie" : "Modifier la saisie"}
          </div>

          <form onSubmit={(e) => { void submitForm(e); }}>
            <div className="fsb-grid">
              {/* Date/heure */}
              <div className="fsb-field">
                <label>Date et heure de capture</label>
                <input
                  className="fsb-input"
                  type="datetime-local"
                  value={form.capturedAt}
                  onChange={(e) => setForm((p) => ({ ...p, capturedAt: e.target.value }))}
                />
              </div>

              {/* Signups */}
              <div className="fsb-field">
                <label>Inscrits</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.signups}
                  onChange={(e) => setForm((p) => ({ ...p, signups: e.target.value }))}
                  placeholder="0"
                />
              </div>

              {/* FTD count */}
              <div className="fsb-field">
                <label>FTD (total cumulatif)</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="1"
                  value={form.ftdCount}
                  onChange={(e) => setForm((p) => ({ ...p, ftdCount: e.target.value }))}
                  placeholder="0"
                />
              </div>

              {/* FTD sum dep */}
              <div className="fsb-field">
                <label>Somme dépôts FTD (€)</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.ftdSumDep}
                  onChange={(e) => setForm((p) => ({ ...p, ftdSumDep: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              {/* Total deposits */}
              <div className="fsb-field">
                <label>Volume total dépôts (€)</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.totalDeposits}
                  onChange={(e) => setForm((p) => ({ ...p, totalDeposits: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              {/* RS amount */}
              <div className="fsb-field">
                <label>Montant RS brut (€)</label>
                <input
                  className="fsb-input"
                  type="number"
                  step="0.01"
                  value={form.rsAmount}
                  onChange={(e) => setForm((p) => ({ ...p, rsAmount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              {/* Note */}
              <div className="fsb-field fsb-field-full">
                <label>Note (optionnelle)</label>
                <input
                  className="fsb-input"
                  value={form.note}
                  onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Ex : données du rapport PDF semaine 2"
                />
              </div>
            </div>

            {/* Bonus section */}
            <div style={{
              marginTop: 14, padding: 14, borderRadius: 10,
              background: hasBonusInForm ? "rgba(251,191,36,.08)" : "rgba(255,255,255,.03)",
              border: hasBonusInForm ? "1px solid rgba(251,191,36,.3)" : "1px solid rgba(255,255,255,.06)",
              transition: "all .2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 12, color: hasBonusInForm ? "rgba(251,191,36,.9)" : "rgba(214,225,242,.6)" }}>
                  Petit bonus ?
                </span>
                <span style={{ fontSize: 11, color: "rgba(214,225,242,.4)" }}>
                  (positif = agence prend plus · négatif = agence donne plus à l'affilié)
                </span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div className="fsb-field" style={{ flex: 1, margin: 0 }}>
                  <label style={{ fontSize: 11 }}>Bonus €</label>
                  <input
                    className="fsb-input"
                    type="number"
                    step="0.01"
                    value={form.bonusAmount}
                    onChange={(e) => setForm((p) => ({ ...p, bonusAmount: e.target.value }))}
                    style={{ borderColor: hasBonusInForm ? "rgba(251,191,36,.4)" : undefined }}
                  />
                </div>
                <button
                  type="button"
                  className="fsb-btn"
                  style={{ fontSize: 11, marginBottom: 0 }}
                  onClick={() => setForm((p) => ({ ...p, showManualOverride: !p.showManualOverride }))}
                >
                  {form.showManualOverride ? "Masquer répartition manuelle" : "Répartition manuelle"}
                </button>
              </div>
              {form.showManualOverride && (
                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <div className="fsb-field" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Split CPA (€)</label>
                    <input
                      className="fsb-input"
                      type="number"
                      step="0.01"
                      value={form.manualCpaSplit}
                      onChange={(e) => setForm((p) => ({ ...p, manualCpaSplit: e.target.value }))}
                      placeholder="Auto"
                    />
                  </div>
                  <div className="fsb-field" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: 11 }}>Split RS (€)</label>
                    <input
                      className="fsb-input"
                      type="number"
                      step="0.01"
                      value={form.manualRsSplit}
                      onChange={(e) => setForm((p) => ({ ...p, manualRsSplit: e.target.value }))}
                      placeholder="Auto"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Live preview */}
            {preview != null && (
              <div style={{ marginTop: 14, padding: 12, background: "rgba(16,185,129,.07)", border: "1px solid rgba(16,185,129,.2)", borderRadius: 10, fontSize: 13 }}>
                <div style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(110,231,183,.7)", marginBottom: 8 }}>
                  Prévisualisation calculs
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <StatChip
                    label="Affilié CPA"
                    value={(() => {
                      const ftd = toSnapshotNum(form.ftdCount) ?? 0;
                      const ftdAdj = Math.max(0, ftd - (preview.bonusSplit.ftdRemoved ?? 0));
                      const cpaUnit = preview.deal.cpaStreamerUnit;
                      return eur(ftdAdj * cpaUnit);
                    })()}
                    accent
                  />
                  <StatChip
                    label="Affilié RS"
                    value={eur((toSnapshotNum(form.rsAmount) ?? 0) * (preview.deal.rsStreamerPct / 100))}
                    accent
                  />
                  <StatChip
                    label="Total affilié"
                    value={(() => {
                      const ftd = toSnapshotNum(form.ftdCount) ?? 0;
                      const ftdAdj = Math.max(0, ftd - (preview.bonusSplit.ftdRemoved ?? 0));
                      const cpa = ftdAdj * preview.deal.cpaStreamerUnit;
                      const rs = (toSnapshotNum(form.rsAmount) ?? 0) * (preview.deal.rsStreamerPct / 100);
                      return eur(cpa + rs);
                    })()}
                    accent
                  />
                  {hasBonusInForm && (
                    <StatChip label="Ajustement bonus" value={eur(toSnapshotNum(form.bonusAmount) ?? 0)} />
                  )}
                </div>
                {(preview.bonusSplit.error) ? (
                  <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,150,100,.8)" }}>{preview.bonusSplit.error}</div>
                ) : null}
              </div>
            )}
            {previewError ? (
              <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,150,100,.7)" }}>{previewError}</div>
            ) : null}

            {formError ? <div className="fsb-alert" style={{ marginTop: 12 }}>{formError}</div> : null}

            <div className="fsb-modal-actions" style={{ marginTop: 14, paddingTop: 0 }}>
              <button type="button" className="fsb-btn" onClick={closeForm}>Annuler</button>
              <button type="submit" className="fsb-btn fsb-btn-primary" disabled={formSaving}>
                {formSaving ? "Enregistrement..." : formMode === "new" ? "Créer la saisie" : "Mettre à jour"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Confirm delete modal ── */}
      {deletingId != null && (
        <div style={{ marginBottom: 14, padding: 14, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: "rgba(252,165,165,.9)" }}>
            Supprimer cette saisie ?
          </div>
          <div className="fsb-muted" style={{ fontSize: 12, marginBottom: 12 }}>
            Cette action est irréversible. Le calcul des totaux sera recalculé sans cette saisie.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="fsb-btn" onClick={() => setDeletingId(null)} disabled={deleteLoading}>Annuler</button>
            <button
              type="button"
              className="fsb-btn"
              style={{ color: "rgba(252,165,165,.9)", borderColor: "rgba(239,68,68,.4)" }}
              onClick={() => void executeDelete()}
              disabled={deleteLoading}
            >
              {deleteLoading ? "Suppression..." : "Supprimer définitivement"}
            </button>
          </div>
        </div>
      )}

      {/* ── Snapshot list ── */}
      {listLoading && snapshots.length === 0 ? (
        <div className="fsb-emptyblock">Chargement...</div>
      ) : snapshots.length === 0 && !listLoading ? (
        <div className="fsb-emptyblock" style={{ padding: "18px 0" }}>
          Aucune saisie sur cette période. Cliquez sur « + Nouvelle saisie » pour commencer.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {snapshots.map((snap) => {
            const snapAgg = aggBySnap.get(snap.id);
            const hasBonus = snap.bonusAmount !== 0;
            return (
              <div
                key={snap.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "10px 14px",
                  background: "rgba(255,255,255,.03)",
                  border: "1px solid rgba(255,255,255,.06)",
                  borderRadius: 10,
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(214,225,242,.8)" }}>
                      {dateTime(snap.capturedAt)}
                    </span>
                    {hasBonus && (
                      <span
                        className="fsb-badge"
                        style={{
                          fontSize: 10,
                          background: snap.bonusAmount > 0 ? "rgba(239,68,68,.15)" : "rgba(16,185,129,.15)",
                          color: snap.bonusAmount > 0 ? "rgba(252,165,165,.9)" : "rgba(110,231,183,.9)",
                          borderColor: snap.bonusAmount > 0 ? "rgba(239,68,68,.3)" : "rgba(16,185,129,.3)",
                        }}
                      >
                        bonus {snap.bonusAmount > 0 ? "+" : ""}{eur(snap.bonusAmount)}
                      </span>
                    )}
                    {snap.note ? (
                      <span className="fsb-muted" style={{ fontSize: 11, fontStyle: "italic" }}>{snap.note}</span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
                    <StatChip label="Inscrits" value={snap.signups == null ? "-" : num(snap.signups)} />
                    <StatChip label="FTD" value={snap.ftdCount == null ? "-" : num(snap.ftdCount)} />
                    <StatChip label="Volume" value={snap.totalDeposits == null ? "-" : eur(snap.totalDeposits)} />
                    <StatChip label="RS" value={snap.rsAmount == null ? "-" : eur(snap.rsAmount)} />
                    {snapAgg != null && (
                      <>
                        <StatChip label="Delta FTD" value={num(snapAgg.rawDelta.ftd)} />
                        {hasBonus && <StatChip label="FTD ajusté" value={num(snapAgg.adjustedDelta.ftd)} />}
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, alignSelf: "flex-start" }}>
                  <button
                    type="button"
                    className="fsb-btn"
                    style={{ fontSize: 11 }}
                    onClick={() => openEditForm(snap)}
                    disabled={formMode !== null}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="fsb-btn"
                    style={{ fontSize: 11, color: "rgba(255,120,100,.8)" }}
                    onClick={() => confirmDelete(snap.id)}
                    disabled={deletingId != null}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
