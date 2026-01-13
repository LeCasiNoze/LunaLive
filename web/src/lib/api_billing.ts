// web/src/lib/api_billing.ts
const API = (import.meta as any).env?.VITE_API_URL || "https://lunalive-api.onrender.com";

async function postJson(path: string, token: string, body: any) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "request_failed");
  return j;
}

export async function billingCheckout(token: string, plan: "viewer" | "streamer") {
  return postJson("/billing/checkout-session", token, { plan });
}

export async function billingPortal(token: string) {
  return postJson("/billing/customer-portal", token, {});
}
