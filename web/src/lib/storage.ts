const LS_TOKEN = "lunalive_token_v1";

export function loadToken(): string | null {
  try {
    return localStorage.getItem(LS_TOKEN);
  } catch {
    return null;
  }
}

export function saveToken(t: string | null) {
  try {
    if (!t) localStorage.removeItem(LS_TOKEN);
    else localStorage.setItem(LS_TOKEN, t);
  } catch {
    // ignore
  }
}
