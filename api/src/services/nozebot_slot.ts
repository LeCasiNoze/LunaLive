import { pool } from "../db.js";
import {
  SLOT_BET_RUBIS,
  SLOT_COOLDOWN_MS,
  rollSlotOutcome,
  slotCheckAndTouchCooldownTx,
} from "../discord/games_slot.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";

export type NozeBotSlotResult = {
  code: string;
  label: string;
  art: string;
  bet: number;
  payout: number;
  penalty: number;
  net: number;
  balance: number;
  nextAt: string;
};

export class NozeBotSlotError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "NozeBotSlotError";
  }
}

export async function playNozeBotSlot(params: {
  discordUserId: string;
  discordGuildId: string;
  userId: number;
}): Promise<NozeBotSlotResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cooldown = await slotCheckAndTouchCooldownTx(client, params.discordUserId, SLOT_COOLDOWN_MS);
    if (!cooldown.ok) {
      if (cooldown.error === "cooldown") {
        throw new NozeBotSlotError("cooldown", 429, {
          remainingMs: cooldown.remainingMs,
          nextAt: new Date(Date.now() + cooldown.remainingMs).toISOString(),
        });
      }
      throw new NozeBotSlotError("slot_unavailable", 500);
    }

    await spendRubisTx(client, {
      userId: params.userId,
      amount: SLOT_BET_RUBIS,
      spendKind: "sink",
      spendType: "discord_slot_bet",
      meta: { bot: "nozebot", discordGuildId: params.discordGuildId },
    });
    const outcome = rollSlotOutcome();

    let penalty = 0;
    if (outcome.extraLossRubis > 0) {
      const available = await client.query(
        `SELECT COALESCE(SUM(amount_remaining), 0)::int AS amount
         FROM wallet_lots WHERE user_id=$1 AND amount_remaining > 0`,
        [params.userId]
      );
      penalty = Math.min(outcome.extraLossRubis, Number(available.rows[0]?.amount || 0));
      if (penalty > 0) {
        await spendRubisTx(client, {
          userId: params.userId,
          amount: penalty,
          spendKind: "sink",
          spendType: "discord_slot_penalty",
          meta: { bot: "nozebot", outcome: outcome.code },
        });
      }
    }
    if (outcome.payoutRubis > 0) {
      await earnRubisTx(client, params.userId, "discord_slot", outcome.payoutRubis, {
        bot: "nozebot", outcome: outcome.code,
      });
    }
    await client.query(`INSERT INTO discord_command_uses (user_id, command) VALUES ($1, 'slot')`, [params.userId]);
    const balanceRow = await client.query(`SELECT rubis FROM users WHERE id=$1`, [params.userId]);
    const balance = Number(balanceRow.rows[0]?.rubis || 0);
    await client.query("COMMIT");

    return {
      code: outcome.code,
      label: outcome.label,
      art: outcome.art,
      bet: SLOT_BET_RUBIS,
      payout: outcome.payoutRubis,
      penalty,
      net: outcome.payoutRubis - SLOT_BET_RUBIS - penalty,
      balance,
      nextAt: new Date(Date.now() + SLOT_COOLDOWN_MS).toISOString(),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof NozeBotSlotError) throw error;
    if (error instanceof Error && error.message === "insufficient_rubis") {
      throw new NozeBotSlotError("insufficient_rubis", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}
