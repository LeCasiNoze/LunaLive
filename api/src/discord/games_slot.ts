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
  label: string;          // ex: "[OOO OOX] 30"
  art: string;            // ex: "OOO OOX" ou "F U C K E D"
  payoutRubis: number;    // gain brut (0..500)
  extraLossRubis: number; // perte extra (FUCKED = 100)
};

export type CooldownResult =
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
 *
 * bp cumulés /10000 :
 *  - fucked :  5.00% (0..500)
 *  - zero   : 22.00% (500..2700)
 *  - o1     : 23.00% (2700..5000)
 *  - o2     : 16.00% (5000..6600)
 *  - o3     : 12.00% (6600..7800)
 *  - o4     : 12.00% (7800..9000)
 *  - o5     :  6.00% (9000..9600)
 *  - o6     :  2.80% (9600..9880)
 *  - 777    :  1.00% (9880..9980)
 *  - max    :  0.20% (9980..10000)
 */
export function rollSlotOutcome(rnd: () => number = Math.random): SlotOutcome {
  const x = Math.floor(rnd() * 10000);
  const pick = (from: number, to: number) => x >= from && x < to;

  if (pick(0, 500)) {
    return {
      code: "fucked",
      label: "[FUCKED] -X3",
      art: "F U C K E D",
      payoutRubis: 0,
      extraLossRubis: 20, // -10x la mise (mise=10)
    };
  }

  if (pick(500, 2700)) {
    return { code: "zero", label: "[XXX XXX] 0", art: "XXX XXX", payoutRubis: 0, extraLossRubis: 0 };
  }

  if (pick(2700, 5000)) {
    return { code: "o1", label: "[OXX XXX] 3", art: "OXX XXX", payoutRubis: 3, extraLossRubis: 0 };
  }

  if (pick(5000, 6600)) {
    return { code: "o2", label: "[OOX XXX] 5", art: "OOX XXX", payoutRubis: 5, extraLossRubis: 0 };
  }

  if (pick(6600, 7800)) {
    return { code: "o3", label: "[OOO XXX] 10", art: "OOO XXX", payoutRubis: 10, extraLossRubis: 0 };
  }

  if (pick(7800, 9000)) {
    return { code: "o4", label: "[OOO OXX] 15", art: "OOO OXX", payoutRubis: 15, extraLossRubis: 0 };
  }

  if (pick(9000, 9600)) {
    return { code: "o5", label: "[OOO OOX] 30", art: "OOO OOX", payoutRubis: 30, extraLossRubis: 0 };
  }

  if (pick(9600, 9880)) {
    return { code: "o6", label: "[OOO OOO] 50", art: "OOO OOO", payoutRubis: 50, extraLossRubis: 0 };
  }

  if (pick(9880, 9980)) {
    return { code: "777", label: "[777 777] 100", art: "777 777", payoutRubis: 100, extraLossRubis: 0 };
  }

  return { code: "max", label: "[MAX WIN] 500", art: "MAX WIN", payoutRubis: 500, extraLossRubis: 0 };
}

/**
 * Cooldown table:
 * discord_slot_cooldowns(discord_user_id PK, last_play_at, updated_at)
 *
 * ⚠️ À appeler dans une transaction si tu veux un lock strict (FOR UPDATE).
 */
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

/**
 * Résultat "comme claim" : une fonction TxClient unique qui
 *  - check+touch cooldown (FOR UPDATE)
 *  - tire l'outcome
 *  - calcule le netDelta (ce que tu devras appliquer au wallet)
 */
export type SlotPlayResult =
  | { ok: true; outcome: SlotOutcome; bet: number; netDelta: number }
  | { ok: false; error: "cooldown"; remainingMs: number }
  | { ok: false; error: "db" };

export async function discordSlotPlayTxClient(
  client: PoolClient,
  discordUserId: string
): Promise<SlotPlayResult> {
  const cd = await slotCheckAndTouchCooldownTx(client, discordUserId, SLOT_COOLDOWN_MS);
  if (!cd.ok) return cd;

  const outcome = rollSlotOutcome();
  const bet = SLOT_BET_RUBIS;

  // net = -mise - malus + payout
  const netDelta = -bet - (outcome.extraLossRubis || 0) + (outcome.payoutRubis || 0);

  return { ok: true, outcome, bet, netDelta };
}

function normalizeArt(art: string) {
  // "F U C K E D" / "XXX XXX" / "OXX XXX" / etc.
  return String(art || "").trim();
}

export function buildSpinFrames(finalArt: string): string[] {
  // Animation simple: reveal progressif (~6 frames)
  // - "OOO OOX" => 2 blocs de 3 => 6 chars
  // - "MAX WIN" => 2 blocs de 3
  // - "777 777" => 2 blocs de 3
  // - "F U C K E D" => 6 tokens
  const art = normalizeArt(finalArt);

  if (art.includes(" ")) {
    const parts = art.split(/\s+/).filter(Boolean);

    // Format "OOO OOX" / "XXX XXX" / "MAX WIN" / "777 777"
    if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3) {
      const seq = [...parts[0].split(""), ...parts[1].split("")];
      const frames: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const shown = seq.map((c, idx) => (idx < i ? c : "·"));
        frames.push(`${shown.slice(0, 3).join("")} ${shown.slice(3).join("")}`);
      }
      return frames;
    }

    // Format "F U C K E D" (6 tokens) ou "M A X W I N" (6 tokens)
    if (parts.length === 6) {
      const frames: string[] = [];
      for (let i = 1; i <= 6; i++) {
        const shown = parts.map((c, idx) => (idx < i ? c : "·"));
        frames.push(`${shown.slice(0, 3).join(" ")}   ${shown.slice(3).join(" ")}`);
      }
      return frames;
    }
  }

  return [finalArt];
}
