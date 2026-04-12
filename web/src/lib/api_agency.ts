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
  initialDealId: number | null;
  initialStartDate: string | null;
  initialEndDate: string | null;
  initialLinksText: string | null;
  initialAssignmentNotes: string | null;
};

export type AgencyStreamerUpdateInput = {
  displayName: string;
  notes: string | null;
};

export type AgencyAssignmentInput = {
  agencyStreamerId: number;
  dealId: number;
  startDate: string | null;
  endDate: string | null;
  linksText: string | null;
  notes: string | null;
};

export type AgencyAssignmentUpdateInput = {
  dealId: number;
  startDate: string | null;
  endDate: string | null;
  linksText: string | null;
  notes: string | null;
};

export type AgencyStatsInput = {
  monthKey: string;
  signups: number | null;
  depositCount: number | null;
  ftdCount: number | null;
  totalDeposits: number | null;
  rsValue: number | null;
  showCpaToStreamer: boolean;
  showRsToStreamer: boolean;
};

export type MyAgencyStatsResponse = {
  ok: true;
  monthKey: string;
  agency: null | {
    streamer: {
      id: number;
      displayName: string;
      linkedStreamerSlug: string | null;
      linkedStreamerName: string | null;
      accessUsername: string | null;
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
