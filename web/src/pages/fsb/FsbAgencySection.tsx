import * as React from "react";
import {
  createAgencyAssignment,
  createAgencyCasino,
  createAgencyDeal,
  createAgencyStreamer,
  deleteAgencyAssignment,
  deleteAgencyCasino,
  deleteAgencyDeal,
  deleteAgencyStreamer,
  getFsbAgencyDashboard,
  resetAgencyStreamerAccess,
  updateAgencyAssignment,
  updateAgencyCasino,
  updateAgencyDeal,
  updateAgencyStats,
  updateAgencyStreamer,
  type AgencyAssignment,
  type AgencyDashboardResponse,
  type AgencyDeal,
  type AgencyGeneratedAccess,
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

function dateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
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

type TabKey = "overview" | "streamers" | "assignments" | "config";

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

  const [casinoForm, setCasinoForm] = React.useState<CasinoFormState>(EMPTY_CASINO_FORM);
  const [dealForm, setDealForm] = React.useState<DealFormState>(EMPTY_DEAL_FORM);
  const [streamerForm, setStreamerForm] = React.useState<StreamerFormState>(EMPTY_STREAMER_FORM);
  const [assignmentForm, setAssignmentForm] = React.useState<AssignmentFormState>(EMPTY_ASSIGNMENT_FORM);

  const [statsAssignmentId, setStatsAssignmentId] = React.useState("");
  const [statsSignups, setStatsSignups] = React.useState("");
  const [statsDepositCount, setStatsDepositCount] = React.useState("");
  const [statsFtdCount, setStatsFtdCount] = React.useState("");
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
      setStatsDeposits(""); setStatsRsValue(""); setShowCpaToStreamer(true); setShowRsToStreamer(true);
      return;
    }
    setStatsSignups(selectedStatsAssignment.stats.signups == null ? "" : String(selectedStatsAssignment.stats.signups));
    setStatsDepositCount(selectedStatsAssignment.stats.depositCount == null ? "" : String(selectedStatsAssignment.stats.depositCount));
    setStatsFtdCount(selectedStatsAssignment.stats.ftdCount == null ? "" : String(selectedStatsAssignment.stats.ftdCount));
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
    setActiveTab("streamers");
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
    setActiveTab("assignments");
  }

  function startStatsAssignment(id: number) {
    setStatsAssignmentId(String(id));
    setActiveTab("assignments");
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
    await runMutation("stats", () =>
      updateAgencyStats(Number(statsAssignmentId), {
        monthKey,
        signups: toNumberOrNull(statsSignups),
        depositCount: toNumberOrNull(statsDepositCount),
        ftdCount: toNumberOrNull(statsFtdCount),
        totalDeposits: toNumberOrNull(statsDeposits),
        rsValue: toNumberOrNull(statsRsValue),
        showCpaToStreamer,
        showRsToStreamer,
      }, monthKey)
    );
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
      {/* ── Header & Summary ─────────────────────────────────────────────── */}
      <section className="fsb-card">
        <div className="fsb-sectionhead">
          <div>
            <h2 className="fsb-sectiontitle">Agence</h2>
            <div className="fsb-muted">Multi-deals, historique mensuel, acces streamer dedie et stats mensuelles CPA / RS.</div>
          </div>
          <div className="fsb-actions">
            <button className="fsb-btn" type="button" onClick={() => setMonthKey(addMonths(monthKey, -1))}>
              Mois precedent
            </button>
            <span className="fsb-pill">{monthLabel(monthKey)}</span>
            <button className="fsb-btn" type="button" onClick={() => setMonthKey(addMonths(monthKey, 1))}>
              Mois suivant
            </button>
            <button className="fsb-btn" type="button" onClick={() => void load(monthKey)}>
              {loading ? "Actualisation..." : "Rafraichir"}
            </button>
          </div>
        </div>

        {data?.historyMonths?.length ? (
          <div className="fsb-pills" style={{ marginTop: 14 }}>
            {data.historyMonths.slice(0, 8).map((item) => (
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

        {error ? <div className="fsb-alert">{error}</div> : null}

        <div className="fsb-stats">
          <div className="fsb-stat">
            <small>Casinos</small>
            <strong>{data?.summary.casinos ?? 0}</strong>
            <span>Partenaires</span>
          </div>
          <div className="fsb-stat">
            <small>Deals</small>
            <strong>{data?.summary.deals ?? 0}</strong>
            <span>Offres actives</span>
          </div>
          <div className="fsb-stat">
            <small>Streamers</small>
            <strong>{data?.summary.streamers ?? 0}</strong>
            <span>Fiches agence</span>
          </div>
          <div className="fsb-stat">
            <small>Assignations actives</small>
            <strong>{data?.summary.activeAssignments ?? 0}</strong>
            <span>Sur {monthLabel(monthKey)}</span>
          </div>
          <div className="fsb-stat">
            <small>Net streamers</small>
            <strong>{eur(data?.summary.streamerEarnings ?? 0)}</strong>
            <span>Total du mois</span>
          </div>
          <div className="fsb-stat">
            <small>Marge agence</small>
            <strong>{eur(data?.summary.agencyEarnings ?? 0)}</strong>
            <span>Interne uniquement</span>
          </div>
        </div>
      </section>

      {/* ── Access banner ────────────────────────────────────────────────── */}
      {generatedAccess ? (
        <section className="fsb-card" style={{ marginTop: 18 }}>
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Acces streamer genere</h3>
              <div className="fsb-muted">Transmets ces informations au streamer.</div>
            </div>
            <button className="fsb-btn" type="button" onClick={() => setGeneratedAccess(null)}>Fermer</button>
          </div>
          <div className="fsb-grid" style={{ marginTop: 14 }}>
            <div className="fsb-field">
              <label>Username</label>
              <input className="fsb-input" value={generatedAccess.username} readOnly />
            </div>
            <div className="fsb-field">
              <label>Code d acces</label>
              <input className="fsb-input" value={generatedAccess.password} readOnly />
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Lien de consultation (a envoyer au streamer)</label>
              <input className="fsb-input" value={loginUrl || generatedAccess.loginPath} readOnly />
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <div className="fsb-tabs">
        {(["overview", "streamers", "assignments", "config"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`fsb-tab ${activeTab === tab ? "fsb-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "overview" && "Vue d'ensemble"}
            {tab === "streamers" && `Streamers${data ? ` (${data.summary.streamers})` : ""}`}
            {tab === "assignments" && `Assignations${data ? ` (${data.summary.assignments})` : ""}`}
            {tab === "config" && "Configuration"}
          </button>
        ))}
      </div>

      <div className="fsb-tab-content">

        {/* ════════════════════════════════════════════════════════════════
            TAB: VUE D'ENSEMBLE
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "overview" ? (
          <section className="fsb-card">
            <div className="fsb-sectionhead">
              <div>
                <h3 style={{ margin: 0 }}>Toutes les assignations</h3>
                <div className="fsb-muted">Vue globale du mois. Cliquez sur Modifier ou Stats pour agir sur une ligne.</div>
              </div>
            </div>
            {(data?.assignments || []).length === 0 ? (
              <div className="fsb-emptyblock" style={{ marginTop: 18 }}>
                Aucune assignation pour ce mois.
              </div>
            ) : (
              <div className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr>
                      <th>Streamer / Deal</th>
                      <th>Periode & Paiement</th>
                      <th>Stats {monthLabel(monthKey)}</th>
                      <th>Net affi</th>
                      <th>Marge agence</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.assignments || []).map((assignment) => (
                      <tr key={assignment.id}>
                        <td>
                          <strong>{assignment.streamerDisplayName}</strong>
                          <div className="fsb-sub">{assignment.deal.casinoName} — {assignment.deal.name}</div>
                          {assignment.activeDuringMonth ? (
                            <span className="fsb-badge fsb-badge-green" style={{ marginTop: 6 }}>Actif ce mois</span>
                          ) : (
                            <span className="fsb-badge" style={{ marginTop: 6 }}>Hors plage</span>
                          )}
                        </td>
                        <td>
                          <strong>Du {dateOnly(assignment.startDate)}</strong>
                          <div className="fsb-sub">
                            {assignment.endDate ? `Au ${dateOnly(assignment.endDate)}` : "Sans date de fin"}
                          </div>
                          <div className="fsb-sub">
                            Paie le {assignment.paymentDate ? dateOnly(assignment.paymentDate) : "-"} du mois suivant
                            {" · "}{assignment.paymentFrequency === "biweekly" ? "Bimensuel" : "Mensuel"}
                          </div>
                        </td>
                        <td>
                          <strong>Inscrits {num(assignment.stats.signups)}</strong>
                          <div className="fsb-sub">
                            Depots {num(assignment.stats.depositCount)} | FTD {num(assignment.stats.ftdCount)}
                          </div>
                          <div className="fsb-sub">
                            Volume {assignment.stats.totalDeposits == null ? "-" : eur(assignment.stats.totalDeposits)}
                          </div>
                          <div className="fsb-sub">Maj {dateTime(assignment.stats.updatedAt || assignment.updatedAt)}</div>
                        </td>
                        <td>
                          <strong>{eur(assignment.payouts.streamerTotal)}</strong>
                          <div className="fsb-sub">
                            CPA {eur(assignment.payouts.streamerCpa)} | RS {eur(assignment.payouts.streamerErs)}
                          </div>
                        </td>
                        <td>
                          <strong>{eur(assignment.payouts.agencyTotal)}</strong>
                          <div className="fsb-sub">
                            CPA {eur(assignment.payouts.agencyCpa)} | RS {eur(assignment.payouts.agencyErs)}
                          </div>
                        </td>
                        <td>
                          <div className="fsb-inline">
                            <button type="button" onClick={() => startEditAssignment(assignment)}>Modifier</button>
                            <button type="button" onClick={() => startStatsAssignment(assignment.id)}>Stats</button>
                            <button type="button" onClick={() => void handleDeleteAssignment(assignment.id)}>Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════
            TAB: STREAMERS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "streamers" ? (
          <>
            {/* ─── Form streamer ─────────────────────────────────────── */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>
                    {streamerForm.id ? `Modifier : ${streamerForm.displayName}` : "Ajouter un streamer"}
                  </h3>
                  <div className="fsb-muted">
                    {streamerForm.id
                      ? "Modification du profil agence. Pour les assignations, allez dans l'onglet Assignations."
                      : "Creation de la fiche agence avec acces streamer dedie genere automatiquement."}
                  </div>
                </div>
                {streamerForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetStreamerForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveStreamer}>
                <div className="fsb-grid">
                  <div className="fsb-field fsb-field-full">
                    <label>Nom affiche</label>
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
                            <label>Date debut</label>
                            <input
                              className="fsb-input"
                              type="date"
                              value={streamerForm.initialStartDate}
                              onChange={(e) => setStreamerForm((p) => ({ ...p, initialStartDate: e.target.value }))}
                            />
                          </div>
                          <div className="fsb-field">
                            <label>Date fin</label>
                            <input
                              className="fsb-input"
                              type="date"
                              value={streamerForm.initialEndDate}
                              onChange={(e) => setStreamerForm((p) => ({ ...p, initialEndDate: e.target.value }))}
                            />
                          </div>
                          <div className="fsb-field">
                            <label>Jour de paiement mensuel</label>
                            <input
                              className="fsb-input"
                              type="date"
                              value={streamerForm.initialPaymentDate}
                              onChange={(e) => setStreamerForm((p) => ({ ...p, initialPaymentDate: e.target.value }))}
                            />
                            <div className="fsb-hint">
                              Ex : si debut en avril et paiement le 15, le premier frais apparait le 15 mai.
                            </div>
                          </div>
                          <div className="fsb-field">
                            <label>Notes assignation</label>
                            <input
                              className="fsb-input"
                              value={streamerForm.initialAssignmentNotes}
                              onChange={(e) => setStreamerForm((p) => ({ ...p, initialAssignmentNotes: e.target.value }))}
                            />
                          </div>
                          <div className="fsb-field fsb-field-full">
                            <label>Liens utiles</label>
                            <textarea
                              className="fsb-textarea"
                              value={streamerForm.initialLinksText}
                              onChange={(e) => setStreamerForm((p) => ({ ...p, initialLinksText: e.target.value }))}
                            />
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  <div className="fsb-field fsb-field-full">
                    <label>Notes internes (non visibles par le streamer)</label>
                    <textarea
                      className="fsb-textarea"
                      style={{ minHeight: 80 }}
                      value={streamerForm.notes}
                      onChange={(e) => setStreamerForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Note publique (visible par le streamer sur son portail)</label>
                    <textarea
                      className="fsb-textarea"
                      style={{ minHeight: 80 }}
                      value={streamerForm.publicNote}
                      onChange={(e) => setStreamerForm((p) => ({ ...p, publicNote: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "streamer"}>
                    {saving === "streamer" ? "Enregistrement..." : streamerForm.id ? "Mettre a jour" : "Creer le streamer"}
                  </button>
                </div>
              </form>
            </section>

            {/* ─── Streamers table ───────────────────────────────────── */}
            <section className="fsb-card" style={{ marginTop: 18 }}>
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>Streamers agences ({filteredStreamers.length})</h3>
                  <div className="fsb-muted">Acces, liens de consultation et preview affi.</div>
                </div>
                <div className="fsb-actions">
                  <input
                    className="fsb-input"
                    style={{ width: 200 }}
                    value={streamerSearch}
                    onChange={(e) => setStreamerSearch(e.target.value)}
                    placeholder="Rechercher..."
                  />
                  <select className="fsb-select" style={{ width: "auto" }} value={streamerSort} onChange={(e) => setStreamerSort(e.target.value)}>
                    <option value="name">Trier : nom</option>
                    <option value="updated">Trier : maj recente</option>
                    <option value="active">Trier : actifs ce mois</option>
                    <option value="assignments">Trier : nb deals</option>
                  </select>
                </div>
              </div>
              <div className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr>
                      <th>Streamer</th>
                      <th>Acces</th>
                      <th>Liens</th>
                      <th>Deals</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStreamers.map((streamer) => {
                      const consultationPath = getConsultationPath(streamer);
                      const previewPath = getPreviewPath(streamer);
                      return (
                        <tr key={streamer.id}>
                          <td>
                            <strong>{streamer.displayName}</strong>
                            <div className="fsb-sub">{streamer.notes || "Aucune note"}</div>
                          </td>
                          <td>
                            <strong>{streamer.accessUsername || "-"}</strong>
                            <div className="fsb-sub">Code : {streamer.accessCode || "Faire Reset code"}</div>
                            <div className="fsb-sub">Maj {dateTime(streamer.updatedAt)}</div>
                          </td>
                          <td>
                            <div className="fsb-inline">
                              <a className="fsb-jump" href={consultationPath} target="_blank" rel="noreferrer">Page affi</a>
                              <a className="fsb-jump" href={previewPath} target="_blank" rel="noreferrer">Preview</a>
                            </div>
                            <div className="fsb-sub" style={{ wordBreak: "break-all", marginTop: 6 }}>
                              {toAbsoluteUrl(consultationPath)}
                            </div>
                          </td>
                          <td>
                            <strong>{streamer.assignments.length} deals</strong>
                            <div className="fsb-sub">
                              {streamer.assignments.filter((a) => a.activeDuringMonth).length} actifs sur {monthLabel(monthKey)}
                            </div>
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
                      <tr><td colSpan={5}><div className="fsb-sub">Aucun streamer ne correspond.</div></td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════
            TAB: ASSIGNATIONS
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "assignments" ? (
          <>
            {/* ─── Assignment form ───────────────────────────────────── */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>
                    {assignmentForm.id ? "Modifier l'assignation" : "Ajouter une assignation"}
                  </h3>
                  <div className="fsb-muted">
                    Un streamer peut cumuler plusieurs deals avec ses dates et liens propres.
                  </div>
                </div>
                {assignmentForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetAssignmentForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveAssignment}>
                <div className="fsb-grid">
                  {!assignmentForm.id ? (
                    <div className="fsb-field">
                      <label>Streamer</label>
                      <select
                        className="fsb-select"
                        value={assignmentForm.agencyStreamerId}
                        onChange={(e) => setAssignmentForm((p) => ({ ...p, agencyStreamerId: e.target.value }))}
                        required
                      >
                        <option value="">Choisir un streamer</option>
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
                    <label>Date debut</label>
                    <input
                      className="fsb-input"
                      type="date"
                      value={assignmentForm.startDate}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field">
                    <label>Date fin</label>
                    <input
                      className="fsb-input"
                      type="date"
                      value={assignmentForm.endDate}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, endDate: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field">
                    <label>Frequence de paiement</label>
                    <select
                      className="fsb-select"
                      value={assignmentForm.paymentFrequency}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, paymentFrequency: e.target.value as "monthly" | "biweekly" }))}
                    >
                      <option value="monthly">Mensuel</option>
                      <option value="biweekly">Bimensuel (toutes les 2 semaines)</option>
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Jour de paiement (date de reference)</label>
                    <input
                      className="fsb-input"
                      type="date"
                      value={assignmentForm.paymentDate}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, paymentDate: e.target.value }))}
                    />
                    <div className="fsb-hint">
                      Le frais est genere le mois suivant la periode. Ex : activite avril + paiement le 15 → frais date au 15 mai.
                    </div>
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Liens utiles (un par ligne)</label>
                    <textarea
                      className="fsb-textarea"
                      style={{ minHeight: 80 }}
                      value={assignmentForm.linksText}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, linksText: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Notes internes</label>
                    <textarea
                      className="fsb-textarea"
                      style={{ minHeight: 80 }}
                      value={assignmentForm.notes}
                      onChange={(e) => setAssignmentForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "assignment"}>
                    {saving === "assignment" ? "Enregistrement..." : assignmentForm.id ? "Mettre a jour" : "Creer l'assignation"}
                  </button>
                </div>
              </form>
            </section>

            {/* ─── Stats form ────────────────────────────────────────── */}
            <section className="fsb-card" style={{ marginTop: 18 }}>
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>Stats du mois — {monthLabel(monthKey)}</h3>
                  <div className="fsb-muted">Valeurs vides = mois non renseigne. Sauvegarde auto des frais apres validation.</div>
                </div>
              </div>
              <form onSubmit={saveStats}>
                <div className="fsb-grid">
                  <div className="fsb-field fsb-field-full">
                    <label>Assignation</label>
                    <select
                      className="fsb-select"
                      value={statsAssignmentId}
                      onChange={(e) => setStatsAssignmentId(e.target.value)}
                      required
                    >
                      <option value="">Choisir une assignation</option>
                      {(data?.assignments || []).map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.streamerDisplayName} — {a.deal.casinoName} — {a.deal.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Inscrits</label>
                    <input className="fsb-input" type="number" min="0" step="1" value={statsSignups} onChange={(e) => setStatsSignups(e.target.value)} />
                  </div>
                  <div className="fsb-field">
                    <label>Nombre de depots</label>
                    <input className="fsb-input" type="number" min="0" step="1" value={statsDepositCount} onChange={(e) => setStatsDepositCount(e.target.value)} />
                  </div>
                  <div className="fsb-field">
                    <label>FTD (base CPA)</label>
                    <input className="fsb-input" type="number" min="0" step="1" value={statsFtdCount} onChange={(e) => setStatsFtdCount(e.target.value)} />
                  </div>
                  <div className="fsb-field">
                    <label>Depot total (€)</label>
                    <input className="fsb-input" type="number" min="0" step="0.01" value={statsDeposits} onChange={(e) => setStatsDeposits(e.target.value)} />
                  </div>
                  <div className="fsb-field">
                    <label>RS net streamer (€)</label>
                    <input className="fsb-input" type="number" step="0.01" value={statsRsValue} onChange={(e) => setStatsRsValue(e.target.value)} />
                  </div>
                  <div className="fsb-field" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <label style={{ marginBottom: 0 }}>Visibilite streamer</label>
                    <label className="fsb-check">
                      <input type="checkbox" checked={!showCpaToStreamer} onChange={(e) => setShowCpaToStreamer(!e.target.checked)} />
                      Masquer le CPA au streamer
                    </label>
                    <label className="fsb-check">
                      <input type="checkbox" checked={!showRsToStreamer} onChange={(e) => setShowRsToStreamer(!e.target.checked)} />
                      Masquer le RS au streamer
                    </label>
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "stats" || !statsAssignmentId}>
                    {saving === "stats" ? "Enregistrement..." : "Valider les stats"}
                  </button>
                </div>
              </form>

              {/* ─── Preview ─────────────────────────────────────────── */}
              {selectedStatsAssignment ? (
                <div style={{ marginTop: 18, borderTop: "1px solid rgba(255,255,255,.06)", paddingTop: 18 }}>
                  <div className="fsb-muted" style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                    Apercu — {selectedStatsAssignment.streamerDisplayName} / {selectedStatsAssignment.deal.casinoName}
                  </div>
                  <div className="fsb-list">
                    <div className="fsb-listitem">
                      <div className="fsb-listmain">
                        <strong>Periode</strong>
                        <div className="fsb-listmeta">
                          {dateOnly(selectedStatsAssignment.startDate)}
                          {selectedStatsAssignment.endDate ? ` — ${dateOnly(selectedStatsAssignment.endDate)}` : " sans fin"}
                          {selectedStatsAssignment.paymentDate ? ` | paie le ${dateOnly(selectedStatsAssignment.paymentDate)} du mois suivant` : ""}
                        </div>
                      </div>
                      <span className={`fsb-tag ${selectedStatsAssignment.activeDuringMonth ? "fsb-tag-paid" : ""}`}>
                        {selectedStatsAssignment.activeDuringMonth ? "Actif ce mois" : "Hors plage"}
                      </span>
                    </div>
                    <div className="fsb-listitem">
                      <div className="fsb-listmain">
                        <strong>Net affi</strong>
                        <div className="fsb-listmeta">
                          FTD {num(selectedStatsAssignment.stats.ftdCount)} | CPA {eur(selectedStatsAssignment.payouts.streamerCpa)} | RS {eur(selectedStatsAssignment.payouts.streamerErs)}
                        </div>
                      </div>
                      <span className="fsb-tag">{eur(selectedStatsAssignment.payouts.streamerTotal)}</span>
                    </div>
                    <div className="fsb-listitem">
                      <div className="fsb-listmain">
                        <strong>Marge agence</strong>
                        <div className="fsb-listmeta">
                          CPA {eur(selectedStatsAssignment.payouts.agencyCpa)} | RS {eur(selectedStatsAssignment.payouts.agencyErs)}
                        </div>
                      </div>
                      <span className="fsb-tag">{eur(selectedStatsAssignment.payouts.agencyTotal)}</span>
                    </div>
                    <div className="fsb-listitem">
                      <div className="fsb-listmain">
                        <strong>Total genere</strong>
                        <div className="fsb-listmeta">
                          Brut {eur(selectedStatsAssignment.payouts.grossCpa)} | A regler {eur(selectedStatsAssignment.payouts.streamerTotal)}
                        </div>
                      </div>
                      <span className="fsb-tag">{eur(selectedStatsAssignment.payouts.grossTotal)}</span>
                    </div>
                    <div className="fsb-listitem">
                      <div className="fsb-listmain">
                        <strong>Donnees saisies</strong>
                        <div className="fsb-listmeta">
                          Inscrits {num(selectedStatsAssignment.stats.signups)} | Depots {num(selectedStatsAssignment.stats.depositCount)} |
                          FTD {num(selectedStatsAssignment.stats.ftdCount)} | Volume {eur(selectedStatsAssignment.stats.totalDeposits)}
                        </div>
                      </div>
                      <span className="fsb-tag">Maj {dateTime(selectedStatsAssignment.stats.updatedAt || selectedStatsAssignment.updatedAt)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="fsb-emptyblock" style={{ marginTop: 16 }}>
                  Selectionnez une assignation pour voir l'apercu.
                </div>
              )}
            </section>
          </>
        ) : null}

        {/* ════════════════════════════════════════════════════════════════
            TAB: CONFIGURATION
        ════════════════════════════════════════════════════════════════ */}
        {activeTab === "config" ? (
          <>
            {/* ─── Casino form + table ───────────────────────────────── */}
            <section className="fsb-card">
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>{casinoForm.id ? `Modifier : ${casinoForm.name}` : "Ajouter un casino"}</h3>
                  <div className="fsb-muted">Base de reference pour les deals.</div>
                </div>
                {casinoForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetCasinoForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveCasino}>
                <div className="fsb-grid">
                  <div className="fsb-field">
                    <label>Nom du casino</label>
                    <input
                      className="fsb-input"
                      value={casinoForm.name}
                      onChange={(e) => setCasinoForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="fsb-field">
                    <label>Notes</label>
                    <input
                      className="fsb-input"
                      value={casinoForm.notes}
                      onChange={(e) => setCasinoForm((p) => ({ ...p, notes: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "casino"}>
                    {saving === "casino" ? "Enregistrement..." : casinoForm.id ? "Mettre a jour" : "Creer"}
                  </button>
                </div>
              </form>

              <div className="fsb-tablewrap">
                <table className="fsb-table">
                  <thead>
                    <tr><th>Casino</th><th>Notes</th><th>Maj</th><th>Actions</th></tr>
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
            <section className="fsb-card" style={{ marginTop: 18 }}>
              <div className="fsb-sectionhead">
                <div>
                  <h3 style={{ margin: 0 }}>{dealForm.id ? `Modifier : ${dealForm.name}` : "Ajouter un deal"}</h3>
                  <div className="fsb-muted">Le deal definit les regles CPA et RS et la marge agence.</div>
                </div>
                {dealForm.id ? (
                  <button className="fsb-btn" type="button" onClick={resetDealForm}>Annuler</button>
                ) : null}
              </div>
              <form onSubmit={saveDeal}>
                <div className="fsb-grid">
                  <div className="fsb-field">
                    <label>Casino</label>
                    <select
                      className="fsb-select"
                      value={dealForm.casinoId}
                      onChange={(e) => setDealForm((p) => ({ ...p, casinoId: e.target.value }))}
                      required
                    >
                      <option value="">Choisir un casino</option>
                      {(data?.casinos || []).map((casino) => (
                        <option key={casino.id} value={String(casino.id)}>{casino.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Nom du deal</label>
                    <input
                      className="fsb-input"
                      value={dealForm.name}
                      onChange={(e) => setDealForm((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="fsb-field">
                    <label>CPA total / FTD (€)</label>
                    <input className="fsb-input" type="number" min="0" step="0.01" value={dealForm.cpaAmount}
                      onChange={(e) => setDealForm((p) => ({ ...p, cpaAmount: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Part agence / FTD (€)</label>
                    <input className="fsb-input" type="number" min="0" step="0.01" value={dealForm.cpaAgencyCut}
                      onChange={(e) => setDealForm((p) => ({ ...p, cpaAgencyCut: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>RS total %</label>
                    <input className="fsb-input" type="number" min="0" max="100" step="0.01" value={dealForm.ersPercent}
                      onChange={(e) => setDealForm((p) => ({ ...p, ersPercent: e.target.value }))} />
                  </div>
                  <div className="fsb-field">
                    <label>Part agence RS %</label>
                    <input className="fsb-input" type="number" min="0" max="100" step="0.01" value={dealForm.ersAgencyPercent}
                      onChange={(e) => setDealForm((p) => ({ ...p, ersAgencyPercent: e.target.value }))} />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Notes</label>
                    <textarea className="fsb-textarea" style={{ minHeight: 72 }} value={dealForm.notes}
                      onChange={(e) => setDealForm((p) => ({ ...p, notes: e.target.value }))} />
                  </div>
                </div>
                <div className="fsb-modal-actions">
                  <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "deal"}>
                    {saving === "deal" ? "Enregistrement..." : dealForm.id ? "Mettre a jour" : "Creer le deal"}
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
                    <option value="updated">Trier : maj recente</option>
                    <option value="cpa">Trier : CPA desc</option>
                    <option value="rs">Trier : RS desc</option>
                  </select>
                </div>
                <table className="fsb-table">
                  <thead>
                    <tr><th>Deal</th><th>CPA</th><th>RS</th><th>Maj</th><th>Actions</th></tr>
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
          </>
        ) : null}

      </div>
    </>
  );
}
