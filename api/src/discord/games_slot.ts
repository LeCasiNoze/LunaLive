// api/src/discord/games_slot.ts
import type { PoolClient } from "pg";

export const SLOT_BET_RUBIS = 10;
export const SLOT_COOLDOWN_MS = 6 * 3600_000;

export type SlotCode =
  | "fucked"
  | "zero"
  | "o1"
  | "o2"
  | "o3"
  | "o4"
  | "o5"
  | "o6"
  | "777"
  | "max";

export type SlotOutcome = {
  code: SlotCode;
  label: string;          // ex: "[OOO OOX]"
  art: string;            // ex: "OOO OOX"
  payoutRubis: number;    // gain brut (0..500)
  extraLossRubis: number; // perte extra (FUCKED = 100)
};

type CooldownResult =
  | { ok: true }
  | { ok: false; error: "cooldown"; remainingMs: number }
  | { ok: false; error: "db" };

function fmt2(n: number) {
  return String(n).padStart(2, "0");
}

export function fmtRemaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}h ${fmt2(mm)}m`;
  if (mm > 0) return `${mm}m ${fmt2(ss)}s`;
  return `${ss}s`;
}

/**
 * Table de drop VALIDÉE (sum=100%).
 * On tire au hasard et on renvoie l’outcome exact.
 */
export function rollSlotOutcome(rnd = Math.random()): SlotOutcome {
  // cumul sur 10000 (basis points)
  // 5.00% = 500, 22.00% = 2200, etc.
  const x = Math.floor(rnd * 10000);

  const pick = (from: number, to: number) => x >= from && x < to;

  // FUCKED 5.00%
  if (pick(0, 500)) {
    return {
      code: "fucked",
      label: "[FUCKED] -X10",
      art: "F U C K E D",
      payoutRubis: 0,
      extraLossRubis: 100, // -10x la mise (mise=10)
    };
  }

  // XXX XXX 22.00%
  if (pick(500, 2700)) {
    return { code: "zero", label: "[XXX XXX] 0", art: "XXX XXX", payoutRubis: 0, extraLossRubis: 0 };
  }

  // OXX XXX 23.00%
  if (pick(2700, 5000)) {
    return { code: "o1", label: "[OXX XXX] 3", art: "OXX XXX", payoutRubis: 3, extraLossRubis: 0 };
  }

  // OOX XXX 16.00%
  if (pick(5000, 6600)) {
    return { code: "o2", label: "[OOX XXX] 5", art: "OOX XXX", payoutRubis: 5, extraLossRubis: 0 };
  }

  // OOO XXX 12.00%
  if (pick(6600, 7800)) {
    return { code: "o3", label: "[OOO XXX] 10", art: "OOO XXX", payoutRubis: 10, extraLossRubis: 0 };
  }

  // OOO OXX 12.00%
  if (pick(7800, 9000)) {
    return { code: "o4", label: "[OOO OXX] 15", art: "OOO OXX", payoutRubis: 15, extraLossRubis: 0 };
  }

  // OOO OOX 6.00%
  if (pick(9000, 9600)) {
    return { code: "o5", label: "[OOO OOX] 30", art: "OOO OOX", payoutRubis: 30, extraLossRubis: 0 };
  }

  // OOO OOO 2.80%
  if (pick(9600, 9880)) {
    return { code: "o6", label: "[OOO OOO] 50", art: "OOO OOO", payoutRubis: 50, extraLossRubis: 0 };
  }

  // 777 777 1.00%
  if (pick(9880, 9980)) {
    return { code: "777", label: "[777 777] 100", art: "777 777", payoutRubis: 100, extraLossRubis: 0 };
  }

  // MAX WIN 0.20%
  return { code: "max", label: "[MAX WIN] 500", art: "MAX WIN", payoutRubis: 500, extraLossRubis: 0 };
}

export async function slotCheckAndTouchCooldownTx(
  client: PoolClient,
  discordUserId: string,
  cooldownMs = SLOT_COOLDOWN_MS
): Promise<CooldownResult> {
  try {
    const r = await client.query(
      `SELECT last_play_at FROM discord_slot_cooldowns WHERE discord_user_id=$1 FOR UPDATE`,
      [discordUserId]
    );

    const now = Date.now();
    const row = r.rows?.[0] ?? null;

    if (row?.last_play_at) {
      const last = new Date(row.last_play_at).getTime();
      const next = last + cooldownMs;
      if (now < next) return { ok: false, error: "cooldown", remainingMs: next - now };
    }

    if (!row) {
      await client.query(
        `INSERT INTO discord_slot_cooldowns (discord_user_id, last_play_at, updated_at)
         VALUES ($1, NOW(), NOW())`,
        [discordUserId]
      );
    } else {
      await client.query(
        `UPDATE discord_slot_cooldowns
         SET last_play_at=NOW(), updated_at=NOW()
         WHERE discord_user_id=$1`,
        [discordUserId]
      );
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "db" };
  }
}

function normalizeArt(art: string) {
  // "F U C K E D" / "XXX XXX" / "OXX XXX" / etc.
  return art.trim();
}

export function buildSpinFrames(finalArt: string): string[] {
  // Animation simple: reveal progressif (max ~6 edits + 1 final)
  // On travaille sur 6 chars (avec espace milieu) :
  // "OOO OOX" => left=3, right=3
  // "MAX WIN" => on révèle M A X / W I N
  // "777 777" => etc.
  // "F U C K E D" => 6 lettres (on ignore l’espace)
  const art = normalizeArt(finalArt);

  // Cas FUCKED: "F U C K E D" déjà séparé
  if (art.includes(" ")) {
    const parts = art.split(/\s+/).filter(Boolean);

    // Si format type "OOO OOX" ou "XXX XXX" => 2 blocs de 3
    if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
      const seq = [...parts[0].split(""), ...parts[1].split("")];
      const frames: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const shown = seq.map((c, idx) => (idx < i ? c : "·"));
        frames.push(`${shown.slice(0, 3).join("")} ${shown.slice(3).join("")}`);
      }
      return frames;
    }

    // Si format "M A X W I N" (6 tokens) ou "F U C K E D" (6 tokens)
    if (parts.length === 6) {
      const frames: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const shown = parts.map((c, idx) => (idx < i ? c : "·"));
        frames.push(`${shown.slice(0, 3).join(" ")}   ${shown.slice(3).join(" ")}`);
      }
      return frames;
    }

    // Si format "MAX WIN" (2 tokens)
    if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
      // déjà traité ci-dessus
    }
  }

  // fallback
  return [finalArt];
}
