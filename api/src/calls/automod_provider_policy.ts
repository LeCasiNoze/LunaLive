import type { Pool } from "pg";
import { normalizeProvider } from "./provider_aliases.js";

export function automodProviderAllowed(provider: string | null, allowed: unknown): boolean {
  const canonical = String(normalizeProvider(provider) ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const family = canonical === "hacksawgaming" ? "hacksaw" : canonical === "pragmaticplay" ? "pragmatic" : canonical === "nolimitcity" ? "nolimit" : null;
  return family !== null && Array.isArray(allowed) && allowed.includes(family);
}

/** Desired mode owns admission even during a CAPTCHA pause. Classic calls are unchanged. */
export async function automodCallProviderAllowed(pool: Pool, streamerId: number, provider: string | null): Promise<boolean> {
  const { rows } = await pool.query(`SELECT desired_enabled,dashboard_settings,runtime_status FROM automod_control WHERE streamer_id=$1`, [streamerId]);
  const control = rows[0];
  if (control?.desired_enabled !== true) return true;
  const allowed = control.dashboard_settings?.allowedProviders ?? control.runtime_status?.config?.allowedProviders ?? ["hacksaw", "pragmatic"];
  return automodProviderAllowed(provider, allowed);
}
