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
  initialDealId: string;
  initialStartDate: string;
  initialEndDate: string;
  initialLinksText: string;
  initialAssignmentNotes: string;
};

type AssignmentFormState = {
  id: number | null;
  agencyStreamerId: string;
  dealId: string;
  startDate: string;
  endDate: string;
  linksText: string;
  notes: string;
};

const EMPTY_CASINO_FORM: CasinoFormState = {
  id: null,
  name: "",
  notes: "",
};

const EMPTY_DEAL_FORM: DealFormState = {
  id: null,
  casinoId: "",
  name: "",
  cpaAmount: "",
  cpaAgencyCut: "",
  ersPercent: "",
  ersAgencyPercent: "",
  notes: "",
};

const EMPTY_STREAMER_FORM: StreamerFormState = {
  id: null,
  displayName: "",
  notes: "",
  initialDealId: "",
  initialStartDate: "",
  initialEndDate: "",
  initialLinksText: "",
  initialAssignmentNotes: "",
};

const EMPTY_ASSIGNMENT_FORM: AssignmentFormState = {
  id: null,
  agencyStreamerId: "",
  dealId: "",
  startDate: "",
  endDate: "",
  linksText: "",
  notes: "",
};

export function FsbAgencySection() {
  const [monthKey, setMonthKey] = React.useState(currentMonthKey);
  const [data, setData] = React.useState<AgencyDashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedAccess, setGeneratedAccess] = React.useState<AgencyGeneratedAccess | null>(null);

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
      : items.filter((streamer) =>
          [
            streamer.displayName,
            streamer.accessUsername,
            streamer.notes,
            ...streamer.assignments.map((assignment) => `${assignment.deal.casinoName} ${assignment.deal.name}`),
          ]
            .map((value) => normalizeText(value))
            .some((value) => value.includes(search))
        );

    filtered.sort((left, right) => {
      if (streamerSort === "updated") {
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      }

      if (streamerSort === "assignments") {
        const assignmentDiff = right.assignments.length - left.assignments.length;
        if (assignmentDiff !== 0) return assignmentDiff;
      }

      if (streamerSort === "active") {
        const rightActive = right.assignments.filter((item) => item.activeDuringMonth).length;
        const leftActive = left.assignments.filter((item) => item.activeDuringMonth).length;
        const activeDiff = rightActive - leftActive;
        if (activeDiff !== 0) return activeDiff;
      }

      return normalizeText(left.displayName).localeCompare(normalizeText(right.displayName), "fr");
    });

    return filtered;
  }, [data?.streamers, monthKey, streamerSearch, streamerSort]);

  const sortedDeals = React.useMemo(() => {
    const items = [...(data?.deals || [])];

    items.sort((left, right) => {
      if (dealSort === "updated") {
        return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
      }

      if (dealSort === "cpa") {
        const cpaDiff = Number(right.cpaAmount || 0) - Number(left.cpaAmount || 0);
        if (cpaDiff !== 0) return cpaDiff;
      }

      if (dealSort === "rs") {
        const rsDiff = Number(right.ersPercent || 0) - Number(left.ersPercent || 0);
        if (rsDiff !== 0) return rsDiff;
      }

      const casinoCompare = normalizeText(left.casinoName).localeCompare(normalizeText(right.casinoName), "fr");
      if (casinoCompare !== 0) return casinoCompare;
      return normalizeText(left.name).localeCompare(normalizeText(right.name), "fr");
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

  React.useEffect(() => {
    void load(monthKey);
  }, [load, monthKey]);

  React.useEffect(() => {
    if (!data?.assignments.length) {
      setStatsAssignmentId("");
      return;
    }
    if (!statsAssignmentId || !data.assignments.some((item) => String(item.id) === statsAssignmentId)) {
      setStatsAssignmentId(String(data.assignments[0].id));
    }
  }, [data?.assignments, statsAssignmentId]);

  React.useEffect(() => {
    if (!selectedStatsAssignment) {
      setStatsSignups("");
      setStatsDepositCount("");
      setStatsFtdCount("");
      setStatsDeposits("");
      setStatsRsValue("");
      setShowCpaToStreamer(true);
      setShowRsToStreamer(true);
      return;
    }
    setStatsSignups(selectedStatsAssignment.stats.signups == null ? "" : String(selectedStatsAssignment.stats.signups));
    setStatsDepositCount(
      selectedStatsAssignment.stats.depositCount == null ? "" : String(selectedStatsAssignment.stats.depositCount)
    );
    setStatsFtdCount(selectedStatsAssignment.stats.ftdCount == null ? "" : String(selectedStatsAssignment.stats.ftdCount));
    setStatsDeposits(
      selectedStatsAssignment.stats.totalDeposits == null ? "" : String(selectedStatsAssignment.stats.totalDeposits)
    );
    setStatsRsValue(selectedStatsAssignment.stats.rsValue == null ? "" : String(selectedStatsAssignment.stats.rsValue));
    setShowCpaToStreamer(Boolean(selectedStatsAssignment.stats.showCpaToStreamer));
    setShowRsToStreamer(Boolean(selectedStatsAssignment.stats.showRsToStreamer));
  }, [selectedStatsAssignment]);

  function resetCasinoForm() {
    setCasinoForm(EMPTY_CASINO_FORM);
  }

  function resetDealForm() {
    setDealForm(EMPTY_DEAL_FORM);
  }

  function resetStreamerForm() {
    setStreamerForm(EMPTY_STREAMER_FORM);
  }

  function resetAssignmentForm() {
    setAssignmentForm(EMPTY_ASSIGNMENT_FORM);
  }

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

  function startEditCasino(id: number) {
    const casino = data?.casinos.find((item) => item.id === id);
    if (!casino) return;
    setCasinoForm({
      id: casino.id,
      name: casino.name,
      notes: casino.notes || "",
    });
  }

  function startEditDeal(id: number) {
    const deal = data?.deals.find((item) => item.id === id);
    if (!deal) return;
    setDealForm({
      id: deal.id,
      casinoId: String(deal.casinoId),
      name: deal.name,
      cpaAmount: deal.cpaAmount == null ? "" : String(deal.cpaAmount),
      cpaAgencyCut: deal.cpaAgencyCut == null ? "" : String(deal.cpaAgencyCut),
      ersPercent: deal.ersPercent == null ? "" : String(deal.ersPercent),
      ersAgencyPercent: deal.ersAgencyPercent == null ? "" : String(deal.ersAgencyPercent),
      notes: deal.notes || "",
    });
  }

  function startEditStreamer(streamer: AgencyStreamer) {
    setStreamerForm({
      id: streamer.id,
      displayName: streamer.displayName,
      notes: streamer.notes || "",
      initialDealId: "",
      initialStartDate: "",
      initialEndDate: "",
      initialLinksText: "",
      initialAssignmentNotes: "",
    });
  }

  function startEditAssignment(assignment: AgencyAssignment) {
    setAssignmentForm({
      id: assignment.id,
      agencyStreamerId: String(assignment.agencyStreamerId),
      dealId: String(assignment.dealId),
      startDate: assignment.startDate || "",
      endDate: assignment.endDate || "",
      linksText: assignment.linksText || "",
      notes: assignment.notes || "",
    });
  }

  async function saveCasino(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await runMutation("casino", () => {
      const payload = {
        name: casinoForm.name.trim(),
        notes: casinoForm.notes.trim() ? casinoForm.notes.trim() : null,
      };
      return casinoForm.id
        ? updateAgencyCasino(casinoForm.id, payload, monthKey)
        : createAgencyCasino(payload, monthKey);
    });
    if (response) resetCasinoForm();
  }

  async function saveDeal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const casinoId = Number(dealForm.casinoId || 0);
    if (!casinoId) {
      setError("Choisis un casino.");
      return;
    }

    const response = await runMutation("deal", () => {
      const payload = {
        casinoId,
        name: dealForm.name.trim(),
        cpaAmount: toNumberOrNull(dealForm.cpaAmount),
        cpaAgencyCut: toNumberOrNull(dealForm.cpaAgencyCut),
        ersPercent: toNumberOrNull(dealForm.ersPercent),
        ersAgencyPercent: toNumberOrNull(dealForm.ersAgencyPercent),
        notes: dealForm.notes.trim() ? dealForm.notes.trim() : null,
      };
      return dealForm.id ? updateAgencyDeal(dealForm.id, payload, monthKey) : createAgencyDeal(payload, monthKey);
    });
    if (response) resetDealForm();
  }

  async function saveStreamer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await runMutation("streamer", () => {
      if (streamerForm.id) {
        return updateAgencyStreamer(
          streamerForm.id,
          {
            displayName: streamerForm.displayName.trim(),
            notes: streamerForm.notes.trim() ? streamerForm.notes.trim() : null,
          },
          monthKey
        );
      }

      return createAgencyStreamer(
        {
          displayName: streamerForm.displayName.trim(),
          notes: streamerForm.notes.trim() ? streamerForm.notes.trim() : null,
          initialDealId: streamerForm.initialDealId ? Number(streamerForm.initialDealId) : null,
          initialStartDate: streamerForm.initialStartDate || null,
          initialEndDate: streamerForm.initialEndDate || null,
          initialLinksText: streamerForm.initialLinksText.trim() ? streamerForm.initialLinksText.trim() : null,
          initialAssignmentNotes: streamerForm.initialAssignmentNotes.trim()
            ? streamerForm.initialAssignmentNotes.trim()
            : null,
        },
        monthKey
      );
    });
    if (response) resetStreamerForm();
  }

  async function saveAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dealId = Number(assignmentForm.dealId || 0);
    const agencyStreamerId = Number(assignmentForm.agencyStreamerId || 0);

    if (!dealId) {
      setError("Choisis un deal.");
      return;
    }
    if (!assignmentForm.id && !agencyStreamerId) {
      setError("Choisis un streamer.");
      return;
    }

    const response = await runMutation("assignment", () => {
      const payload = {
        dealId,
        startDate: assignmentForm.startDate || null,
        endDate: assignmentForm.endDate || null,
        linksText: assignmentForm.linksText.trim() ? assignmentForm.linksText.trim() : null,
        notes: assignmentForm.notes.trim() ? assignmentForm.notes.trim() : null,
      };
      return assignmentForm.id
        ? updateAgencyAssignment(assignmentForm.id, payload, monthKey)
        : createAgencyAssignment({ agencyStreamerId, ...payload }, monthKey);
    });
    if (response) resetAssignmentForm();
  }

  async function saveStats(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statsAssignmentId) return;
    await runMutation("stats", () =>
      updateAgencyStats(
        Number(statsAssignmentId),
        {
          monthKey,
          signups: toNumberOrNull(statsSignups),
          depositCount: toNumberOrNull(statsDepositCount),
          ftdCount: toNumberOrNull(statsFtdCount),
          totalDeposits: toNumberOrNull(statsDeposits),
          rsValue: toNumberOrNull(statsRsValue),
          showCpaToStreamer,
          showRsToStreamer,
        },
        monthKey
      )
    );
  }

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
    const username = streamer.accessUsername ? `?username=${encodeURIComponent(streamer.accessUsername)}` : "";
    return `/agency${username}`;
  }

  function toAbsoluteUrl(path: string) {
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  function getPreviewPath(streamer: Pick<AgencyStreamer, "id" | "accessUsername">) {
    const params = new URLSearchParams();
    params.set("preview", String(streamer.id));
    if (streamer.accessUsername) params.set("username", streamer.accessUsername);
    return `/agency?${params.toString()}`;
  }

  const loginUrl =
    generatedAccess && typeof window !== "undefined"
      ? `${window.location.origin}${generatedAccess.loginPath}?username=${encodeURIComponent(generatedAccess.username)}`
      : generatedAccess?.loginPath || null;

  return (
    <>
      <section className="fsb-card">
        <div className="fsb-sectionhead">
          <div>
            <h2 className="fsb-sectiontitle">Agence</h2>
            <div className="fsb-muted">
              Multi-deals, historique mensuel, acces streamer dedie et stats mensuelles CPA / RS.
            </div>
          </div>
          <div className="fsb-actions">
            <button className="fsb-btn" onClick={() => setMonthKey(addMonths(monthKey, -1))}>
              Mois precedent
            </button>
            <span className="fsb-pill">{monthLabel(monthKey)}</span>
            <button className="fsb-btn" onClick={() => setMonthKey(addMonths(monthKey, 1))}>
              Mois suivant
            </button>
            <button className="fsb-btn" onClick={() => void load(monthKey)}>
              {loading ? "Actualisation..." : "Rafraichir"}
            </button>
          </div>
        </div>

        {data?.historyMonths?.length ? (
          <div className="fsb-pills" style={{ marginTop: 14 }}>
            {data.historyMonths.slice(0, 8).map((item) => (
              <button
                key={item}
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
            <span>Base partenaires</span>
          </div>
          <div className="fsb-stat">
            <small>Deals</small>
            <strong>{data?.summary.deals ?? 0}</strong>
            <span>Offres disponibles</span>
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
            <span>Total saisi cote streamer</span>
          </div>
          <div className="fsb-stat">
            <small>Marge agence</small>
            <strong>{eur(data?.summary.agencyEarnings ?? 0)}</strong>
            <span>Interne uniquement</span>
          </div>
        </div>
      </section>

      {generatedAccess ? (
        <section className="fsb-card" style={{ marginTop: 18 }}>
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Acces streamer genere</h3>
              <div className="fsb-muted">Le code d acces n est affiche qu ici apres creation ou reset.</div>
            </div>
            <button className="fsb-btn" onClick={() => setGeneratedAccess(null)}>
              Fermer
            </button>
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
              <label>Lien de consultation</label>
              <input className="fsb-input" value={loginUrl || generatedAccess.loginPath} readOnly />
            </div>
            <div className="fsb-field fsb-field-full">
              <label>Connexion</label>
              <div className="fsb-muted">
                Le streamer ouvre ce lien, son username est pre-rempli, puis il entre son code d acces.
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="fsb-grid-2" style={{ marginTop: 18 }}>
        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>{casinoForm.id ? "Modifier un casino" : "Ajouter un casino"}</h3>
              <div className="fsb-muted">Base de reference pour les deals.</div>
            </div>
            {casinoForm.id ? (
              <button className="fsb-btn" onClick={resetCasinoForm}>
                Annuler
              </button>
            ) : null}
          </div>
          <form onSubmit={saveCasino}>
            <div className="fsb-grid">
              <div className="fsb-field fsb-field-full">
                <label>Nom</label>
                <input
                  className="fsb-input"
                  value={casinoForm.name}
                  onChange={(e) => setCasinoForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="fsb-field fsb-field-full">
                <label>Notes</label>
                <textarea
                  className="fsb-textarea"
                  value={casinoForm.notes}
                  onChange={(e) => setCasinoForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="fsb-modal-actions">
              <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "casino"}>
                {saving === "casino" ? "Enregistrement..." : casinoForm.id ? "Mettre a jour" : "Creer"}
              </button>
            </div>
          </form>
        </section>

        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>{dealForm.id ? "Modifier un deal" : "Ajouter un deal"}</h3>
              <div className="fsb-muted">Le deal definit les regles CPA et RS.</div>
            </div>
            {dealForm.id ? (
              <button className="fsb-btn" onClick={resetDealForm}>
                Annuler
              </button>
            ) : null}
          </div>
          <form onSubmit={saveDeal}>
            <div className="fsb-grid">
              <div className="fsb-field">
                <label>Casino</label>
                <select
                  className="fsb-select"
                  value={dealForm.casinoId}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, casinoId: e.target.value }))}
                  required
                >
                  <option value="">Choisir</option>
                  {(data?.casinos || []).map((casino) => (
                    <option key={casino.id} value={casino.id}>
                      {casino.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fsb-field">
                <label>Nom</label>
                <input
                  className="fsb-input"
                  value={dealForm.name}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="fsb-field">
                <label>CPA total / depot</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dealForm.cpaAmount}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, cpaAmount: e.target.value }))}
                />
              </div>
              <div className="fsb-field">
                <label>Part agence / depot</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={dealForm.cpaAgencyCut}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, cpaAgencyCut: e.target.value }))}
                />
              </div>
              <div className="fsb-field">
                <label>RS total %</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={dealForm.ersPercent}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, ersPercent: e.target.value }))}
                />
              </div>
              <div className="fsb-field">
                <label>Part agence RS %</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={dealForm.ersAgencyPercent}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, ersAgencyPercent: e.target.value }))}
                />
              </div>
              <div className="fsb-field fsb-field-full">
                <label>Notes</label>
                <textarea
                  className="fsb-textarea"
                  value={dealForm.notes}
                  onChange={(e) => setDealForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="fsb-modal-actions">
              <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "deal"}>
                {saving === "deal" ? "Enregistrement..." : dealForm.id ? "Mettre a jour" : "Creer"}
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="fsb-grid-2" style={{ marginTop: 18 }}>
        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>{streamerForm.id ? "Modifier un streamer" : "Ajouter un streamer"}</h3>
              <div className="fsb-muted">Creation de la fiche agence et, si nouveau, d un acces streamer dedie.</div>
            </div>
            {streamerForm.id ? (
              <button className="fsb-btn" onClick={resetStreamerForm}>
                Annuler
              </button>
            ) : null}
          </div>
          <form onSubmit={saveStreamer}>
            <div className="fsb-grid">
              <div className="fsb-field">
                <label>Nom affiche</label>
                <input
                  className="fsb-input"
                  value={streamerForm.displayName}
                  onChange={(e) => setStreamerForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  required
                />
              </div>
              {!streamerForm.id ? (
                <>
                  <div className="fsb-field">
                    <label>Deal initial</label>
                    <select
                      className="fsb-select"
                      value={streamerForm.initialDealId}
                      onChange={(e) => setStreamerForm((prev) => ({ ...prev, initialDealId: e.target.value }))}
                    >
                      <option value="">Aucun pour l instant</option>
                      {(data?.deals || []).map((deal) => (
                        <option key={deal.id} value={deal.id}>
                          {deal.casinoName} - {deal.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="fsb-field">
                    <label>Date debut</label>
                    <input
                      className="fsb-input"
                      type="date"
                      value={streamerForm.initialStartDate}
                      onChange={(e) => setStreamerForm((prev) => ({ ...prev, initialStartDate: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field">
                    <label>Date fin</label>
                    <input
                      className="fsb-input"
                      type="date"
                      value={streamerForm.initialEndDate}
                      onChange={(e) => setStreamerForm((prev) => ({ ...prev, initialEndDate: e.target.value }))}
                    />
                  </div>
                  <div className="fsb-field">
                    <label>Notes assignation</label>
                    <input
                      className="fsb-input"
                      value={streamerForm.initialAssignmentNotes}
                      onChange={(e) =>
                        setStreamerForm((prev) => ({ ...prev, initialAssignmentNotes: e.target.value }))
                      }
                    />
                  </div>
                  <div className="fsb-field fsb-field-full">
                    <label>Liens utiles</label>
                    <textarea
                      className="fsb-textarea"
                      value={streamerForm.initialLinksText}
                      onChange={(e) => setStreamerForm((prev) => ({ ...prev, initialLinksText: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}
              <div className="fsb-field fsb-field-full">
                <label>Notes profil</label>
                <textarea
                  className="fsb-textarea"
                  value={streamerForm.notes}
                  onChange={(e) => setStreamerForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="fsb-modal-actions">
              <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "streamer"}>
                {saving === "streamer" ? "Enregistrement..." : streamerForm.id ? "Mettre a jour" : "Creer"}
              </button>
            </div>
          </form>
        </section>

        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>{assignmentForm.id ? "Modifier une assignation" : "Ajouter une assignation"}</h3>
              <div className="fsb-muted">Un streamer peut cumuler plusieurs deals avec ses dates et liens.</div>
            </div>
            {assignmentForm.id ? (
              <button className="fsb-btn" onClick={resetAssignmentForm}>
                Annuler
              </button>
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
                    onChange={(e) => setAssignmentForm((prev) => ({ ...prev, agencyStreamerId: e.target.value }))}
                    required
                  >
                    <option value="">Choisir</option>
                    {(data?.streamers || []).map((streamer) => (
                      <option key={streamer.id} value={streamer.id}>
                        {streamer.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="fsb-field">
                <label>Deal</label>
                <select
                  className="fsb-select"
                  value={assignmentForm.dealId}
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, dealId: e.target.value }))}
                  required
                >
                  <option value="">Choisir</option>
                  {(data?.deals || []).map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.casinoName} - {deal.name}
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
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div className="fsb-field">
                <label>Date fin</label>
                <input
                  className="fsb-input"
                  type="date"
                  value={assignmentForm.endDate}
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <div className="fsb-field fsb-field-full">
                <label>Liens utiles</label>
                <textarea
                  className="fsb-textarea"
                  value={assignmentForm.linksText}
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, linksText: e.target.value }))}
                />
              </div>
              <div className="fsb-field fsb-field-full">
                <label>Notes</label>
                <textarea
                  className="fsb-textarea"
                  value={assignmentForm.notes}
                  onChange={(e) => setAssignmentForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="fsb-modal-actions">
              <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "assignment"}>
                {saving === "assignment" ? "Enregistrement..." : assignmentForm.id ? "Mettre a jour" : "Creer"}
              </button>
            </div>
          </form>
        </section>
      </section>

      <section className="fsb-grid-2" style={{ marginTop: 18 }}>
        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Stats du mois</h3>
              <div className="fsb-muted">Si les valeurs sont vides, le mois est considere comme non renseigne.</div>
            </div>
            <span className="fsb-tag">{monthLabel(monthKey)}</span>
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
                  <option value="">Choisir</option>
                  {(data?.assignments || []).map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.streamerDisplayName} - {assignment.deal.casinoName} - {assignment.deal.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fsb-field">
                <label>Nombre d inscrits</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="1"
                  value={statsSignups}
                  onChange={(e) => setStatsSignups(e.target.value)}
                />
              </div>
              <div className="fsb-field">
                <label>Nombre de depots</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="1"
                  value={statsDepositCount}
                  onChange={(e) => setStatsDepositCount(e.target.value)}
                />
              </div>
              <div className="fsb-field">
                <label>FTD</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="1"
                  value={statsFtdCount}
                  onChange={(e) => setStatsFtdCount(e.target.value)}
                />
              </div>
              <div className="fsb-field fsb-field-full">
                <label>Depot total</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={statsDeposits}
                  onChange={(e) => setStatsDeposits(e.target.value)}
                />
              </div>
              <div className="fsb-field">
                <label>RS</label>
                <input
                  className="fsb-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={statsRsValue}
                  onChange={(e) => setStatsRsValue(e.target.value)}
                />
              </div>
              <label className="fsb-check">
                <input
                  type="checkbox"
                  checked={showCpaToStreamer}
                  onChange={(e) => setShowCpaToStreamer(e.target.checked)}
                />
                Afficher le CPA au streamer
              </label>
              <label className="fsb-check">
                <input
                  type="checkbox"
                  checked={showRsToStreamer}
                  onChange={(e) => setShowRsToStreamer(e.target.checked)}
                />
                Afficher le RS au streamer
              </label>
            </div>
            <div className="fsb-modal-actions">
              <button className="fsb-btn fsb-btn-primary" type="submit" disabled={saving === "stats" || !statsAssignmentId}>
                {saving === "stats" ? "Enregistrement..." : "Mettre a jour"}
              </button>
            </div>
          </form>
        </section>

        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Apercu selectionne</h3>
              <div className="fsb-muted">Lecture rapide du deal et de ce que l affi verra pour le mois en cours.</div>
            </div>
          </div>

          {selectedStatsAssignment ? (
            <div className="fsb-list">
              <div className="fsb-listitem">
                <div className="fsb-listmain">
                  <strong>
                    {selectedStatsAssignment.streamerDisplayName} - {selectedStatsAssignment.deal.casinoName}
                  </strong>
                  <div className="fsb-listmeta">
                    {selectedStatsAssignment.deal.name} | du {dateOnly(selectedStatsAssignment.startDate)}
                    {selectedStatsAssignment.endDate ? ` au ${dateOnly(selectedStatsAssignment.endDate)}` : " sans fin"}
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
                    FTD {num(selectedStatsAssignment.stats.ftdCount)} | CPA {eur(selectedStatsAssignment.payouts.streamerCpa)} | RS{" "}
                    {eur(selectedStatsAssignment.payouts.streamerErs)}
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
                    Brut {eur(selectedStatsAssignment.payouts.grossCpa)} | Visible streamer: CPA{" "}
                    {selectedStatsAssignment.stats.showCpaToStreamer ? "oui" : "non"} | RS{" "}
                    {selectedStatsAssignment.stats.showRsToStreamer ? "oui" : "non"}
                  </div>
                </div>
                <span className="fsb-tag">{eur(selectedStatsAssignment.payouts.grossTotal)}</span>
              </div>
              <div className="fsb-listitem">
                <div className="fsb-listmain">
                  <strong>Donnees du mois</strong>
                  <div className="fsb-listmeta">
                    Inscrits {num(selectedStatsAssignment.stats.signups)} | Depots {num(selectedStatsAssignment.stats.depositCount)} |
                    {" "}FTD {num(selectedStatsAssignment.stats.ftdCount)} | Depot total {eur(selectedStatsAssignment.stats.totalDeposits)}
                  </div>
                </div>
                <span className="fsb-tag">Maj {dateTime(selectedStatsAssignment.stats.updatedAt || selectedStatsAssignment.updatedAt)}</span>
              </div>
            </div>
          ) : (
            <div className="fsb-emptyblock" style={{ marginTop: 16 }}>
              Selectionne une assignation pour voir le detail.
            </div>
          )}
        </section>
      </section>

      <section className="fsb-card" style={{ marginTop: 18 }}>
        <div className="fsb-sectionhead">
          <div>
            <h3 style={{ margin: 0 }}>Streamers agences</h3>
            <div className="fsb-muted">Acces, lien de consultation et preview affi en un clic.</div>
          </div>
          <div className="fsb-actions">
            <input
              className="fsb-input"
              style={{ width: 220 }}
              value={streamerSearch}
              onChange={(e) => setStreamerSearch(e.target.value)}
              placeholder="Rechercher un streamer"
            />
            <select className="fsb-select" value={streamerSort} onChange={(e) => setStreamerSort(e.target.value)}>
              <option value="name">Trier: nom</option>
              <option value="updated">Trier: maj recente</option>
              <option value="active">Trier: actifs ce mois</option>
              <option value="assignments">Trier: nb deals</option>
            </select>
          </div>
        </div>
        <div className="fsb-tablewrap">
          <table className="fsb-table">
            <thead>
              <tr>
                <th>Streamer</th>
                <th>Acces</th>
                <th>Consultation</th>
                <th>Assignations</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredStreamers.map((streamer) => (
                (() => {
                  const consultationPath = getConsultationPath(streamer);
                  const consultationUrl = toAbsoluteUrl(consultationPath);
                  const previewPath = getPreviewPath(streamer);

                  return (
                    <tr key={streamer.id}>
                      <td>
                        <strong>{streamer.displayName}</strong>
                        <div className="fsb-sub">{streamer.notes || "Aucune note"}</div>
                      </td>
                      <td>
                        <strong>{streamer.accessUsername || "-"}</strong>
                        <div className="fsb-sub">Maj {dateTime(streamer.updatedAt)}</div>
                      </td>
                      <td>
                        <div className="fsb-inline">
                          <a className="fsb-jump" href={consultationPath} target="_blank" rel="noreferrer">
                            Page affi
                          </a>
                          <a className="fsb-jump" href={previewPath} target="_blank" rel="noreferrer">
                            Voir comme affi
                          </a>
                        </div>
                        <div className="fsb-sub" style={{ wordBreak: "break-all" }}>
                          {consultationUrl}
                        </div>
                      </td>
                      <td>
                        <strong>{streamer.assignments.length}</strong>
                        <div className="fsb-sub">
                          {streamer.assignments.filter((item) => item.activeDuringMonth).length} actifs sur {monthLabel(monthKey)}
                        </div>
                      </td>
                      <td>
                        <div className="fsb-inline">
                          <button onClick={() => startEditStreamer(streamer)}>Modifier</button>
                          <button onClick={() => void handleResetAccess(streamer.id)}>Reset code</button>
                          <button onClick={() => void handleDeleteStreamer(streamer.id)}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  );
                })()
              ))}
              {!filteredStreamers.length ? (
                <tr>
                  <td colSpan={5}>
                    <div className="fsb-sub">Aucun streamer ne correspond a la recherche.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fsb-card" style={{ marginTop: 18 }}>
        <div className="fsb-sectionhead">
          <div>
            <h3 style={{ margin: 0 }}>Assignations et stats</h3>
            <div className="fsb-muted">Une ligne = un deal actif ou historique pour un streamer.</div>
          </div>
        </div>
        <div className="fsb-tablewrap">
          <table className="fsb-table">
            <thead>
              <tr>
                <th>Assignation</th>
                <th>Periode</th>
                <th>Stats {monthLabel(monthKey)}</th>
                <th>Net affi</th>
                <th>Marge agence</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.assignments || []).map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <strong>{assignment.streamerDisplayName}</strong>
                    <div className="fsb-sub">
                      {assignment.deal.casinoName} - {assignment.deal.name}
                    </div>
                    <div className="fsb-sub" style={{ whiteSpace: "pre-wrap" }}>
                      {assignment.linksText || "Pas de lien utile"}
                    </div>
                  </td>
                  <td>
                    <strong>Du {dateOnly(assignment.startDate)}</strong>
                    <div className="fsb-sub">{assignment.endDate ? `Au ${dateOnly(assignment.endDate)}` : "Sans date de fin"}</div>
                    <div className="fsb-sub">{assignment.activeDuringMonth ? "Actif ce mois" : "Hors plage ce mois"}</div>
                  </td>
                  <td>
                    <strong>Inscrits {num(assignment.stats.signups)}</strong>
                    <div className="fsb-sub">
                      Depots {num(assignment.stats.depositCount)} | FTD {num(assignment.stats.ftdCount)} | Depot total{" "}
                      {assignment.stats.totalDeposits == null ? "-" : eur(assignment.stats.totalDeposits)}
                    </div>
                    <div className="fsb-sub">Maj {dateTime(assignment.stats.updatedAt || assignment.updatedAt)}</div>
                  </td>
                  <td>
                    <strong>{eur(assignment.payouts.streamerTotal)}</strong>
                    <div className="fsb-sub">
                      CPA {eur(assignment.payouts.streamerCpa)} | RS {eur(assignment.payouts.streamerErs)}
                    </div>
                    <div className="fsb-sub">
                      Visible: CPA {assignment.stats.showCpaToStreamer ? "oui" : "non"} | RS{" "}
                      {assignment.stats.showRsToStreamer ? "oui" : "non"}
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
                      <button onClick={() => startEditAssignment(assignment)}>Modifier</button>
                      <button onClick={() => setStatsAssignmentId(String(assignment.id))}>Stats</button>
                      <button onClick={() => void handleDeleteAssignment(assignment.id)}>Supprimer</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fsb-grid-2" style={{ marginTop: 18 }}>
        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Casinos</h3>
              <div className="fsb-muted">Base de reference.</div>
            </div>
          </div>
          <div className="fsb-tablewrap">
            <table className="fsb-table">
              <thead>
                <tr>
                  <th>Casino</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(data?.casinos || []).map((casino) => (
                  <tr key={casino.id}>
                    <td>
                      <strong>{casino.name}</strong>
                      <div className="fsb-sub">Maj {dateTime(casino.updatedAt)}</div>
                    </td>
                    <td>{casino.notes || "-"}</td>
                    <td>
                      <div className="fsb-inline">
                        <button onClick={() => startEditCasino(casino.id)}>Modifier</button>
                        <button onClick={() => void handleDeleteCasino(casino.id)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="fsb-card">
          <div className="fsb-sectionhead">
            <div>
              <h3 style={{ margin: 0 }}>Deals</h3>
              <div className="fsb-muted">Regles financieres et marge agence.</div>
            </div>
            <div className="fsb-actions">
              <select className="fsb-select" value={dealSort} onChange={(e) => setDealSort(e.target.value)}>
                <option value="casino-name">Trier: casino puis nom</option>
                <option value="updated">Trier: maj recente</option>
                <option value="cpa">Trier: CPA desc</option>
                <option value="rs">Trier: RS desc</option>
              </select>
            </div>
          </div>
          <div className="fsb-tablewrap">
            <table className="fsb-table">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>CPA</th>
                  <th>RS</th>
                  <th>Action</th>
                </tr>
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
                    <td>
                      <div className="fsb-inline">
                        <button onClick={() => startEditDeal(deal.id)}>Modifier</button>
                        <button onClick={() => void handleDeleteDeal(deal.id)}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!sortedDeals.length ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="fsb-sub">Aucun deal disponible.</div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}
