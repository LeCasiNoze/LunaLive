import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db.js";
import {
  canSplit,
  currentHand,
  doDouble,
  doHit,
  doSplit,
  doStand,
  handTotal,
  isBlackjack,
  nextHandOrEnd,
  playDealerToEnd,
  settle,
  startGame,
  type BJFinish,
  type BJGame,
  type Card,
} from "../discord/games_blackjack.js";
import { awardXpTx, getBlackjackCooldownMs, getLevelInfo, XP_SOURCES } from "../economy/xp.js";
import { earnRubisTx, spendRubisTx } from "../wallet_engine.js";

const MAIN_BET = 20;
const PAIRS_BET = 3;
const PLUS3_BET = 2;
const NO_COOLDOWN_DISCORD_USER_IDS = new Set(
  (process.env.NOZEBOT_NO_COOLDOWN_DISCORD_IDS || "682472610868887567")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

export type NozeBotBlackjackAction = "hit" | "stand" | "double" | "split";

export type NozeBotBlackjackView = {
  sessionId: string;
  status: "active" | "finished";
  mode: "classic" | "plus";
  dealer: { cards: Array<Card | null>; total: number | null };
  hands: Array<{
    cards: Card[];
    total: number;
    bet: number;
    doubled: boolean;
    finished: boolean;
    active: boolean;
  }>;
  sideBetLines: string[];
  actions: { hit: boolean; stand: boolean; double: boolean; split: boolean };
  balance: number;
  cooldownEndsAt: string;
  result: null | (BJFinish & { xpGained: number; balance: number });
};

export class NozeBotBlackjackError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = "NozeBotBlackjackError";
  }
}

type SessionRow = {
  id: string;
  discord_user_id: string;
  discord_guild_id: string;
  user_id: string | number;
  mode: "classic" | "plus";
  status: "active" | "finished" | "expired";
  game: BJGame;
  result: (BJFinish & { xpGained: number; balance: number }) | null;
  expires_at: Date | string;
};

function cooldownEnd(lastPlayAt: Date | string, cooldownMs: number): string {
  return new Date(new Date(lastPlayAt).getTime() + cooldownMs).toISOString();
}

async function balanceFor(client: PoolClient, userId: number): Promise<number> {
  const result = await client.query(`SELECT rubis FROM users WHERE id=$1`, [userId]);
  return Number(result.rows[0]?.rubis || 0);
}

function viewFor(
  row: SessionRow,
  balance: number,
  cooldownEndsAt: string
): NozeBotBlackjackView {
  const game = row.game;
  const active = row.status === "active" && !game.finished;
  const hand = game.hands[game.active];
  const dealerCards = active
    ? [game.dealer[0], null]
    : game.dealer;

  return {
    sessionId: row.id,
    status: active ? "active" : "finished",
    mode: row.mode,
    dealer: {
      cards: dealerCards,
      total: active ? null : handTotal(game.dealer),
    },
    hands: game.hands.map((item, index) => ({
      cards: item.cards,
      total: handTotal(item.cards),
      bet: item.bet,
      doubled: item.doubled,
      finished: item.finished,
      active: active && index === game.active,
    })),
    sideBetLines: game.sidebetLines || [],
    actions: {
      hit: Boolean(active && hand && !hand.finished),
      stand: Boolean(active && hand && !hand.finished),
      double: Boolean(active && hand && !hand.finished && hand.cards.length === 2 && !hand.doubled),
      split: Boolean(active && canSplit(game)),
    },
    balance,
    cooldownEndsAt,
    result: row.result,
  };
}

async function cooldownState(
  client: PoolClient,
  discordUserId: string,
  userId: number,
  touch: boolean
): Promise<{ cooldownMs: number; endsAt: string }> {
  if (NO_COOLDOWN_DISCORD_USER_IDS.has(discordUserId)) {
    return { cooldownMs: 0, endsAt: new Date(0).toISOString() };
  }
  const user = await client.query(`SELECT xp::bigint AS xp FROM users WHERE id=$1 FOR UPDATE`, [userId]);
  if (!user.rows[0]) throw new NozeBotBlackjackError("user_not_found", 404);
  const level = getLevelInfo(Number(user.rows[0].xp || 0)).level;
  const cooldownMs = getBlackjackCooldownMs(level);
  const current = await client.query(
    `SELECT last_play_at FROM discord_bj_cooldowns WHERE discord_user_id=$1 FOR UPDATE`,
    [discordUserId]
  );
  const lastPlayAt = current.rows[0]?.last_play_at as Date | string | undefined;
  if (touch && lastPlayAt) {
    const endsAt = cooldownEnd(lastPlayAt, cooldownMs);
    const remainingMs = new Date(endsAt).getTime() - Date.now();
    if (remainingMs > 0) {
      throw new NozeBotBlackjackError("cooldown", 429, { remainingMs, nextAt: endsAt });
    }
  }
  if (touch) {
    await client.query(
      `INSERT INTO discord_bj_cooldowns (discord_user_id, last_play_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (discord_user_id) DO UPDATE SET last_play_at=NOW(), updated_at=NOW()`,
      [discordUserId]
    );
    return { cooldownMs, endsAt: new Date(Date.now() + cooldownMs).toISOString() };
  }
  return {
    cooldownMs,
    endsAt: lastPlayAt ? cooldownEnd(lastPlayAt, cooldownMs) : new Date(0).toISOString(),
  };
}

function sessionFrom(row: Record<string, unknown>): SessionRow {
  return row as unknown as SessionRow;
}

async function settleSession(
  client: PoolClient,
  row: SessionRow,
  game: BJGame
): Promise<SessionRow> {
  const userId = Number(row.user_id);
  game.finished = true;
  const allBust = game.hands.every((hand) => handTotal(hand.cards) > 21);
  if (!allBust && !isBlackjack(game.hands[0]?.cards || [])) playDealerToEnd(game);
  const settled = settle(game);

  for (const hand of settled.perHand) {
    if (settled.isNaturalBlackjack && hand.i === 1 && hand.kind === "win") {
      await earnRubisTx(client, userId, "discord_blackjack_natural", Math.floor(MAIN_BET * 2.5), {
        bot: "nozebot", sessionId: row.id,
      });
    } else if (hand.kind === "win") {
      await earnRubisTx(client, userId, "discord_blackjack_win", hand.bet * 2, {
        bot: "nozebot", sessionId: row.id, hand: hand.i,
      });
    } else if (hand.kind === "push") {
      await earnRubisTx(client, userId, "discord_blackjack_push", hand.bet, {
        bot: "nozebot", sessionId: row.id, hand: hand.i,
      });
    }
  }

  const side = game.sidebetPayouts || { pairsCredit: 0, plus3Credit: 0, plus3Kind: null };
  if (side.pairsCredit > 0) {
    await earnRubisTx(client, userId, "discord_blackjack_pairs", side.pairsCredit, {
      bot: "nozebot", sessionId: row.id,
    });
  }
  if (side.plus3Credit > 0) {
    await earnRubisTx(client, userId, "discord_blackjack_21p3", side.plus3Credit, {
      bot: "nozebot", sessionId: row.id, result: side.plus3Kind,
    });
  }

  const xp = await awardXpTx(
    client,
    userId,
    XP_SOURCES.blackjack_played,
    "blackjack_played",
    "discord_blackjack",
    { bot: "nozebot", sessionId: row.id, mode: row.mode }
  );
  await client.query(`INSERT INTO discord_command_uses (user_id, command) VALUES ($1, 'blackjack')`, [userId]);

  const historyResult = settled.isNaturalBlackjack && settled.perHand[0]?.kind === "win"
    ? "blackjack"
    : settled.totalNet > 0
      ? "win"
      : settled.totalNet === 0
        ? "push"
        : settled.perHand.every((hand) => hand.kind === "bust") ? "bust" : "lose";
  await client.query(
    `INSERT INTO blackjack_hands (user_id, result, net_gain, side_bet_21_3_result)
     VALUES ($1,$2,$3,$4)`,
    [userId, historyResult, settled.totalNet, side.plus3Kind]
  );

  const balance = await balanceFor(client, userId);
  const result = { ...settled, xpGained: xp.delta, balance };
  await client.query(
    `UPDATE nozebot_blackjack_sessions
     SET status='finished', game=$2::jsonb, result=$3::jsonb, updated_at=NOW(), finished_at=NOW()
     WHERE id=$1 AND status='active'`,
    [row.id, JSON.stringify(game), JSON.stringify(result)]
  );
  return { ...row, status: "finished", game, result };
}

export async function startNozeBotBlackjack(params: {
  discordUserId: string;
  discordGuildId: string;
  userId: number;
  mode: "classic" | "plus";
}): Promise<NozeBotBlackjackView> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT * FROM nozebot_blackjack_sessions
       WHERE discord_user_id=$1 AND status='active' FOR UPDATE`,
      [params.discordUserId]
    );
    if (existing.rows[0]) {
      const row = sessionFrom(existing.rows[0]);
      const cooldown = await cooldownState(client, params.discordUserId, params.userId, false);
      const balance = await balanceFor(client, params.userId);
      await client.query("COMMIT");
      return viewFor(row, balance, cooldown.endsAt);
    }

    const cooldown = await cooldownState(client, params.discordUserId, params.userId, true);
    const totalBet = params.mode === "plus" ? MAIN_BET + PAIRS_BET + PLUS3_BET : MAIN_BET;
    await spendRubisTx(client, {
      userId: params.userId,
      amount: totalBet,
      spendKind: "sink",
      spendType: params.mode === "plus" ? "discord_blackjack_plus_start" : "discord_blackjack_start",
      meta: { bot: "nozebot", discordGuildId: params.discordGuildId },
    });

    const id = randomUUID();
    const game = startGame({
      mainBet: MAIN_BET,
      pairsBet: params.mode === "plus" ? PAIRS_BET : 0,
      plus3Bet: params.mode === "plus" ? PLUS3_BET : 0,
    });
    const inserted = await client.query(
      `INSERT INTO nozebot_blackjack_sessions
       (id, discord_user_id, discord_guild_id, user_id, mode, game, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,NOW() + INTERVAL '7 days') RETURNING *`,
      [id, params.discordUserId, params.discordGuildId, params.userId, params.mode, JSON.stringify(game)]
    );
    let row = sessionFrom(inserted.rows[0]);
    if (isBlackjack(game.hands[0].cards)) row = await settleSession(client, row, game);
    const balance = row.result?.balance ?? await balanceFor(client, params.userId);
    await client.query("COMMIT");
    return viewFor(row, balance, cooldown.endsAt);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof NozeBotBlackjackError) throw error;
    if (error instanceof Error && error.message === "insufficient_rubis") {
      throw new NozeBotBlackjackError("insufficient_rubis", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function actOnNozeBotBlackjack(params: {
  discordUserId: string;
  discordGuildId: string;
  userId: number;
  sessionId: string;
  action: NozeBotBlackjackAction;
}): Promise<NozeBotBlackjackView> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT * FROM nozebot_blackjack_sessions WHERE id=$1 FOR UPDATE`,
      [params.sessionId]
    );
    if (!selected.rows[0]) throw new NozeBotBlackjackError("session_not_found", 404);
    let row = sessionFrom(selected.rows[0]);
    if (
      row.discord_user_id !== params.discordUserId ||
      row.discord_guild_id !== params.discordGuildId ||
      Number(row.user_id) !== params.userId
    ) throw new NozeBotBlackjackError("session_forbidden", 403);

    const cooldown = await cooldownState(client, params.discordUserId, params.userId, false);
    if (row.status !== "active") {
      const balance = await balanceFor(client, params.userId);
      await client.query("COMMIT");
      return viewFor(row, balance, cooldown.endsAt);
    }
    const game = row.game;
    const hand = currentHand(game);
    if (!hand || hand.finished) throw new NozeBotBlackjackError("invalid_action", 409);

    if (params.action === "hit") {
      const { bust } = doHit(game);
      if (bust || handTotal(hand.cards) === 21) {
        if (!bust) doStand(game);
        if (nextHandOrEnd(game) === "finish") row = await settleSession(client, row, game);
      }
    } else if (params.action === "stand") {
      doStand(game);
      if (nextHandOrEnd(game) === "finish") row = await settleSession(client, row, game);
    } else if (params.action === "double") {
      if (hand.cards.length !== 2 || hand.doubled) throw new NozeBotBlackjackError("invalid_action", 409);
      await spendRubisTx(client, {
        userId: params.userId,
        amount: hand.bet,
        spendKind: "sink",
        spendType: "discord_blackjack_double",
        meta: { bot: "nozebot", sessionId: row.id },
      });
      doDouble(game);
      if (nextHandOrEnd(game) === "finish") row = await settleSession(client, row, game);
    } else if (params.action === "split") {
      if (!canSplit(game)) throw new NozeBotBlackjackError("invalid_action", 409);
      await spendRubisTx(client, {
        userId: params.userId,
        amount: MAIN_BET,
        spendKind: "sink",
        spendType: "discord_blackjack_split",
        meta: { bot: "nozebot", sessionId: row.id },
      });
      doSplit(game);
    }

    if (row.status === "active") {
      await client.query(
        `UPDATE nozebot_blackjack_sessions SET game=$2::jsonb, updated_at=NOW() WHERE id=$1`,
        [row.id, JSON.stringify(game)]
      );
      row = { ...row, game };
    }
    const balance = row.result?.balance ?? await balanceFor(client, params.userId);
    await client.query("COMMIT");
    return viewFor(row, balance, cooldown.endsAt);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error instanceof NozeBotBlackjackError) throw error;
    if (error instanceof Error && error.message === "insufficient_rubis") {
      throw new NozeBotBlackjackError("insufficient_rubis", 409);
    }
    throw error;
  } finally {
    client.release();
  }
}
