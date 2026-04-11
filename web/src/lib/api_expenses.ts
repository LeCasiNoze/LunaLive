import { loadToken } from "./storage";

export type ExpenseCategory =
  | "giveaway"
  | "offres"
  | "parrainage"
  | "abonnement"
  | "personnalise";

export type Expense = {
  id: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  isRecurring: boolean;
  recurrenceEndDate: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ExpenseInput = {
  description: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  isRecurring: boolean;
  recurrenceEndDate: string | null;
  notes: string | null;
};

const BASE = (
  (import.meta.env.VITE_API_BASE ??
    import.meta.env.VITE_API_URL ??
    "https://lunalive-api.onrender.com") as string
).replace(/\/$/, "");

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

export function listExpenses() {
  return request<{ ok: true; expenses: Expense[] }>("/api/expenses");
}

export function createExpense(payload: ExpenseInput) {
  return request<{ ok: true; expense: Expense }>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateExpense(id: string, payload: ExpenseInput) {
  return request<{ ok: true; expense: Expense }>(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteExpense(id: string) {
  return request<{ ok: true; id: string }>(`/api/expenses/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
