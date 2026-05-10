import { loadToken } from "./storage";

export type AgencyCasino = {
  id: number;
  name: string;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AgencyDeal = {
  id: number;
  casinoId: number;
  casinoName: string;
  name: string;
  cpaAmount: number | null;
  cpaAgencyCut: number | null;
  ersPercent: number | null;
  ersAgencyPercent: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AgencyAvailableStreamer = {
  streamerId: number;
  userId: number | null;
  slug: string;
  displayName: string;
};

export type AgencyAssignmentStats = {
  monthKey: string;
  signups: number | null;
  depositCount: number | null;
  ftdCount: number | null;
  ftdFullBenef: number | null;
  totalDeposits: number | null;
  rsValue: number | null;
  showCpaToStreamer: boolean;
  showRsToStreamer: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AgencyAssignmentPayouts = {
  grossCpaUnit: number | null;
  grossCpa: number;
  streamerCpaUnit: number | null;
  streamerErsRate: number | null;
  agencyCpaUnit: number | null;
  agencyErsRate: number | null;
  streamerCpa: number;
  agencyCpa: number;
  streamerErs: number;
  agencyErs: number;
  streamerTotal: number;
  agencyTotal: number;
  grossTotal: number;
};

export type AgencyAssignment = {
  id: number;
  agencyStreamerId: number;
  dealId: number;
  streamerDisplayName: string;
  startDate: string | null;
  endDate: string | null;
  paymentDate: string | null;
  paymentFrequency: "monthly" | "biweekly";
  linksText: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  activeDuringMonth: boolean;
  linkedStreamerId?: number | null;
  linkedStreamerSlug?: string | null;
  linkedStreamerName?: string | null;
  accessUserId?: number | null;
  accessUsername?: string | null;
  stats: AgencyAssignmentStats;
  deal: {
    id: number;
    name: string;
    casinoId: number;
    casinoName: string;
    cpaAmount: number | null;
    cpaAgencyCut: number | null;
    ersPercent: number | null;
    ersAgencyPercent: number | null;
  };
  payouts: AgencyAssignmentPayouts;
  latestSnapshot?: AgencySnapshot | null;
  periodAggregate?: AgencyPeriodAggregate | null;
};

export type AgencyStreamer = {
  id: number;
  displayName: string;
  linkedStreamerId: number | null;
  linkedStreamerSlug: string | null;
  linkedStreamerName: string | null;
  lunaliveUserId: number | null;
  accessUserId: number | null;
  accessUsername: string | null;
  accessCode?: string | null;
  publicNote?: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  assignments: AgencyAssignment[];
};

export type AgencyGeneratedAccess = {
  username: string;
  password: string;
  loginPath: string;
};

export type AgencyDashboardResponse = {
  ok: true;
  monthKey: string;
  historyMonths: string[];
  casinos: AgencyCasino[];
  deals: AgencyDeal[];
  streamers: AgencyStreamer[];
  assignments: AgencyAssignment[];
  availableStreamers: AgencyAvailableStreamer[];
  summary: {
    casinos: number;
    deals: number;
    streamers: number;
    assignments: number;
    activeAssignments: number;
    streamerEarnings: number;
    agencyEarnings: number;
  };
  generatedAccess?: AgencyGeneratedAccess | null;
};

export type AgencyCasinoInput = {
  name: string;
  notes: string | null;
};

export type AgencyDealInput = {
  casinoId: number;
  name: string;
  cpaAmount: number | null;
  cpaAgencyCut: number | null;
  ersPercent: number | null;
  ersAgencyPercent: number | null;
  notes: string | null;
};

export type AgencyStreamerCreateInput = {
  displayName: string;
  notes: string | null;
  publicNote: string | null;
  initialDealId: number | null;
  initialStartDate: string | null;
  initialEndDate: string | null;
  initialPaymentDate: string | null;
  initialLinksText: string | null;
  initialAssignmentNotes: string | null;
};

export type AgencyStreamerUpdateInput = {
  displayName: string;
  notes: string | null;
  publicNote: string | null;
};

export type AgencyAssignmentInput = {
  agencyStreamerId: number;
  dealId: number;
  startDate: string | null;
  endDate: string | null;
  paymentDate: string | null;
  paymentFrequency: "monthly" | "biweekly";
  linksText: string | null;
  notes: string | null;
};

export type AgencyAssignmentUpdateInput = {
  dealId: number;
  startDate: string | null;
  endDate: string | null;
  paymentDate: string | null;
  paymentFrequency: "monthly" | "biweekly";
  linksText: string | null;
  notes: string | null;
};

export type AgencyStatsInput = {
  monthKey: string;
  signups: number | null;
  depositCount: number | null;
  ftdCount: number | null;
  ftdFullBenef: number | null;
  totalDeposits: number | null;
  rsValue: number | null;
  showCpaToStreamer: boolean;
  showRsToStreamer: boolean;
};

export type MyAgencyStatsResponse = {
  ok: true;
  monthKey: string;
  period?: "week" | "month" | "all";
  agency: null | {
    streamer: {
      id: number;
      displayName: string;
      linkedStreamerSlug: string | null;
      linkedStreamerName: string | null;
      accessUsername: string | null;
      publicNote?: string | null;
    };
    assignments: Array<{
      id: number;
      startDate: string | null;
      endDate: string | null;
      linksText: string | null;
      notes: string | null;
      activeDuringMonth: boolean;
      casino: {
        id: number;
        name: string;
      };
      deal: {
        id: number;
        name: string;
        cpaPerFtd: number | null;
        rsPercent: number | null;
      };
      stats: AgencyAssignmentStats;
      earnings: {
        grossCpa: number;
        cpa: number;
        rs: number;
        total: number;
        agencyCpa: number;
        agencyRs: number;
        agencyTotal: number;
        grossTotal: number;
        visibleCpa: number | null;
        visibleRs: number | null;
        visibleTotal: number;
      };
      updatedAt: string | null;
      latestSnapshot?: AgencySnapshot | null;
      periodAggregate?: AgencyPeriodAggregate | null;
    }>;
    summary: {
      signups: number;
      depositCount: number;
      ftdCount: number;
      totalDeposits: number;
      cpa: number;
      rs: number;
      agencyCpa: number;
      agencyRs: number;
      agencyTotal: number;
      grossTotal: number;
      visibleCpa: number;
      visibleRs: number;
      visibleTotal: number;
      total: number;
    };
    historyMonths: string[];
    updatedAt: string | null;
  };
};

export type AgencyPreviewResponse = MyAgencyStatsResponse & {
  preview?: boolean;
};

// ── Types snapshot v2 ─────────────────────────────────────────────────────────

export type AgencySnapshot = {
  id: number;
  assignmentId: number;
  capturedAt: string | null;
  signups: number | null;
  ftdCount: number | null;
  ftdSumDep: number | null;
  totalDeposits: number | null;
  rsAmount: number | null;
  bonusAmount: number;
  bonusCpaSplit: number;
  bonusRsSplit: number;
  bonusFtdRemoved: number;
  note: string | null;
  createdByUserId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AgencyBonusSplit = {
  bonusCpaSplit: number;
  bonusRsSplit: number;
  ftdRemoved: number;
  error?: string;
};

export type AgencyRawDelta = {
  signups: number;
  ftd: number;
  sumDep: number;
  totalDeposits: number;
  rsAmount: number;
};

export type AgencyAdjustedDelta = AgencyRawDelta;

export type AgencyPeriodTotals = {
  signups: number;
  ftd: number;
  sumDep: number;
  totalDeposits: number;
  rsAmount: number;
  cpaEarnings: number;
  rsEarnings: number;
  totalEarnings: number;
  agencyEarnings: number;
  bonusTotal: number;
};

export type AgencyPerSnapshotAgg = {
  snapshotId: number;
  capturedAt: string;
  rawDelta: AgencyRawDelta;
  bonusAmount: number;
  bonusCpaSplit: number;
  bonusRsSplit: number;
  ftdRemoved: number;
  adjustedDelta: AgencyAdjustedDelta;
};

export type AgencyPeriodAggregate = {
  rawTotals: AgencyPeriodTotals;
  adjustedTotals: AgencyPeriodTotals;
  agencyTotals: {
    agencyBaseCpa: number;
    agencyBaseRs: number;
    bonusTotal: number;
    total: number;
  };
  perSnapshot: AgencyPerSnapshotAgg[];
};

export type AgencySnapshotInput = {
  capturedAt?: string | null;
  signups?: number | null;
  ftdCount?: number | null;
  ftdSumDep?: number | null;
  totalDeposits?: number | null;
  rsAmount?: number | null;
  bonusAmount?: number;
  manualCpaSplit?: number | null;
  manualRsSplit?: number | null;
  note?: string | null;
};

export type AgencySnapshotResponse = {
  ok: true;
  snapshot: AgencySnapshot & {
    delta?: AgencyRawDelta;
    adjustedDelta?: AgencyAdjustedDelta;
    bonusSplit?: AgencyBonusSplit;
  };
};

export type AgencySnapshotsListResponse = {
  ok: true;
  period: "week" | "month" | "all";
  date: string;
  bounds: { start: string; end: string };
  snapshots: AgencySnapshot[];
  baseline: AgencySnapshot | null;
  aggregate: AgencyPeriodAggregate | null;
};

export type AgencyPreviewBonusResponse = {
  ok: true;
  delta: AgencyRawDelta;
  bonusSplit: AgencyBonusSplit;
  adjustedDelta: AgencyAdjustedDelta;
  deal: {
    cpaStreamerUnit: number;
    rsStreamerPct: number;
  };
};

export type AgencyRecruitFromTiktokInput = {
  tiktokInfluencerId: number;
  displayName?: string;
  notes?: string | null;
  publicNote?: string | null;
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

function withMonth(path: string, monthKey?: string | null) {
  if (!monthKey) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}month=${encodeURIComponent(monthKey)}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = loadToken();
  const headers = new Headers(init.headers || {});

  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (response.status === 401 && token && token === loadToken()) {
    try {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    } catch {
      // noop
    }
  }

  const text = await response.text().catch(() => "");
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        (text && text.length < 200 ? text : null) ||
        `API ${response.status}`
    );
  }

  return data as T;
}

export function getFsbAgencyDashboard(monthKey?: string | null) {
  return request<AgencyDashboardResponse>(withMonth("/api/fsb/agency", monthKey));
}

export function createAgencyCasino(payload: AgencyCasinoInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(withMonth("/api/fsb/agency/casinos", monthKey), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgencyCasino(id: number, payload: AgencyCasinoInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/casinos/${encodeURIComponent(String(id))}`, monthKey),
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteAgencyCasino(id: number, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/casinos/${encodeURIComponent(String(id))}`, monthKey),
    { method: "DELETE" }
  );
}

export function createAgencyDeal(payload: AgencyDealInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(withMonth("/api/fsb/agency/deals", monthKey), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgencyDeal(id: number, payload: AgencyDealInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/deals/${encodeURIComponent(String(id))}`, monthKey),
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteAgencyDeal(id: number, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/deals/${encodeURIComponent(String(id))}`, monthKey),
    { method: "DELETE" }
  );
}

export function createAgencyStreamer(payload: AgencyStreamerCreateInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(withMonth("/api/fsb/agency/streamers", monthKey), {
    method: "POST",
    body: JSON.stringify({ ...payload, linkedStreamerId: null }),
  });
}

export function updateAgencyStreamer(id: number, payload: AgencyStreamerUpdateInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/streamers/${encodeURIComponent(String(id))}`, monthKey),
    {
      method: "PUT",
      body: JSON.stringify({ ...payload, linkedStreamerId: null }),
    }
  );
}

export function deleteAgencyStreamer(id: number, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/streamers/${encodeURIComponent(String(id))}`, monthKey),
    { method: "DELETE" }
  );
}

export function resetAgencyStreamerAccess(id: number, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/streamers/${encodeURIComponent(String(id))}/reset-access`, monthKey),
    { method: "POST" }
  );
}

export function createAgencyAssignment(payload: AgencyAssignmentInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(withMonth("/api/fsb/agency/assignments", monthKey), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgencyAssignment(id: number, payload: AgencyAssignmentUpdateInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/assignments/${encodeURIComponent(String(id))}`, monthKey),
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteAgencyAssignment(id: number, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/assignments/${encodeURIComponent(String(id))}`, monthKey),
    { method: "DELETE" }
  );
}

export function updateAgencyStats(id: number, payload: AgencyStatsInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth(`/api/fsb/agency/assignments/${encodeURIComponent(String(id))}/stats`, monthKey ?? payload.monthKey),
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function getMyAgencyStats(monthKey?: string | null) {
  return request<MyAgencyStatsResponse>(withMonth("/api/agency/me", monthKey));
}

export function getFsbAgencyStreamerPreview(id: number, monthKey?: string | null) {
  return request<AgencyPreviewResponse>(
    withMonth(`/api/fsb/agency/streamers/${encodeURIComponent(String(id))}/preview`, monthKey)
  );
}

// ── API snapshot v2 ───────────────────────────────────────────────────────────

export function createAgencySnapshot(assignmentId: number, payload: AgencySnapshotInput) {
  return request<AgencySnapshotResponse>(
    `/api/fsb/agency/assignments/${encodeURIComponent(String(assignmentId))}/snapshots`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function updateAgencySnapshot(snapshotId: number, payload: AgencySnapshotInput) {
  return request<AgencySnapshotResponse>(
    `/api/fsb/agency/snapshots/${encodeURIComponent(String(snapshotId))}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );
}

export function deleteAgencySnapshot(snapshotId: number) {
  return request<{ ok: true }>(
    `/api/fsb/agency/snapshots/${encodeURIComponent(String(snapshotId))}`,
    { method: "DELETE" }
  );
}

export function getAgencySnapshots(
  assignmentId: number,
  params?: { period?: "week" | "month" | "all"; date?: string }
) {
  const search = new URLSearchParams();
  if (params?.period) search.set("period", params.period);
  if (params?.date) search.set("date", params.date);
  const qs = search.toString();
  const path = `/api/fsb/agency/assignments/${encodeURIComponent(String(assignmentId))}/snapshots${qs ? `?${qs}` : ""}`;
  return request<AgencySnapshotsListResponse>(path);
}

export function previewAgencyBonus(
  assignmentId: number,
  params: AgencySnapshotInput & { capturedAt?: string | null }
) {
  const search = new URLSearchParams();
  const entries: Array<[string, string | null | undefined]> = [
    ["bonusAmount", params.bonusAmount != null ? String(params.bonusAmount) : undefined],
    ["capturedAt", params.capturedAt ?? undefined],
    ["signups", params.signups != null ? String(params.signups) : undefined],
    ["ftdCount", params.ftdCount != null ? String(params.ftdCount) : undefined],
    ["ftdSumDep", params.ftdSumDep != null ? String(params.ftdSumDep) : undefined],
    ["totalDeposits", params.totalDeposits != null ? String(params.totalDeposits) : undefined],
    ["rsAmount", params.rsAmount != null ? String(params.rsAmount) : undefined],
    ["manualCpaSplit", params.manualCpaSplit != null ? String(params.manualCpaSplit) : undefined],
    ["manualRsSplit", params.manualRsSplit != null ? String(params.manualRsSplit) : undefined],
  ];
  for (const [k, v] of entries) {
    if (v != null) search.set(k, v);
  }
  const path = `/api/fsb/agency/assignments/${encodeURIComponent(String(assignmentId))}/preview-bonus?${search.toString()}`;
  return request<AgencyPreviewBonusResponse>(path);
}

export function recruitAgencyStreamerFromTiktok(payload: AgencyRecruitFromTiktokInput, monthKey?: string | null) {
  return request<AgencyDashboardResponse>(
    withMonth("/api/fsb/agency/streamers/from-tiktok", monthKey),
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export function getMyAgencyStatsPeriod(period?: "week" | "month", monthKey?: string | null, date?: string | null) {
  const search = new URLSearchParams();
  if (monthKey) search.set("month", monthKey);
  if (period) search.set("period", period);
  if (date) search.set("date", date);
  const qs = search.toString();
  return request<MyAgencyStatsResponse>(`/api/agency/me${qs ? `?${qs}` : ""}`);
}
