import type { User } from "./types";

const LS_KEY = "lunalive_user_v1";

export function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function saveUser(u: User | null) {
  try {
    if (!u) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(u));
  } catch {
    // ignore
  }
}
