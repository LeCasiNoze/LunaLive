import crypto from "node:crypto";
import {coinsProfile,coinAction,linkedCoins,InsufficientCoins,weeklyCnz} from '../nozecoins/wallet.js';
import {UPGRADES,type Upgrade} from '../nozecoins/rules.js';
import {requestAutomodDiscordLink,automodDiscordProfile,discordProfileSchema} from '../automod-shop/discord-profile.js';
import { Router, type NextFunction, type Request, type Response } from "express";
import { pool } from "../db.js";
import { createLinkCode, getLinkedUser } from "../discord/link.js";
import { getDiscordClaimMultiplier, getLevelInfo, awardXpTx } from "../economy/xp.js";
import { earnRubisTx } from "../wallet_engine.js";
import { discordDailyClaimTxClient } from "./bot/games_claim.js";
import { getProfileStats } from "../services/profile_stats.js";
import { a } from "../utils/async.js";
import {
  actOnNozeBotBlackjack,
  NozeBotBlackjackError,
  startNozeBotBlackjack,
  type NozeBotBlackjackAction,
} from "../services/nozebot_blackjack.js";
import { NozeBotSlotError, playNozeBotSlot } from "../services/nozebot_slot.js";

export const internalNozeBotRouter = Router();

const LECASINOZE_GUILD_ID = "1188913226990235800";
const DISCORD_ID_RE = /^\d{17,20}$/;

function sameSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function requireNozeBot(req: Request, res: Response, next: NextFunction): void {
  const received = String(req.header("x-bot-key") || "").trim();
  const candidates = [process.env.BOT_INTERNAL_KEY, process.env.INTERNAL_BOT_KEY]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!candidates.some((candidate) => sameSecret(received, candidate))) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

function readIdentity(req: Request, res: Response): { discordUserId: string; discordGuildId: string } | null {
  const discordUserId = String(req.body?.discordUserId || "").trim();
  const discordGuildId = String(req.body?.discordGuildId || "").trim();
  if (!DISCORD_ID_RE.test(discordUserId) || discordGuildId !== LECASINOZE_GUILD_ID) {
    res.status(400).json({ ok: false, error: "bad_identity" });
    return null;
  }
  return { discordUserId, discordGuildId };
}

internalNozeBotRouter.post('/internal/bot/nozebot/coins/:action',requireNozeBot,a(async(req,res)=>{
 const identity=readIdentity(req,res);if(!identity)return;
 if(process.env.NOZECOINS_ENABLED!=='true')return res.status(503).json({ok:false,error:'coins_disabled'});
 const sid=Number((await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' LIMIT 1")).rows[0]?.id);
 if(!sid)return res.status(404).json({ok:false,error:'streamer_missing'});
 try{
  if(['cnz','cnz-ack'].includes(req.params.action)){
   if(identity.discordUserId!=='1432436833253326929')return res.status(403).json({ok:false,error:'bad_actor'});
   if(req.params.action==='cnz')return res.json({ok:true,rewards:await weeklyCnz(pool,sid)});
   const week=String(req.body?.week||''),ids=req.body?.ids;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Array.isArray(ids)||ids.length>25||ids.some(x=>typeof x!=='string'||!/^\d+$/.test(x)))return res.status(400).json({ok:false,error:'bad_ack'});
   await pool.query('UPDATE nozecoin_cnz_announcements SET announced_at=NOW() WHERE streamer_id=$1 AND week=$2 AND rumble_user_id=ANY($3::text[])',[sid,week,ids]);return res.json({ok:true});
  }
  if(req.params.action==='links'){
   await discordProfileSchema(pool);const cursor=String(req.body?.cursor||'');
   if(cursor&&!/^\d{17,20}$/.test(cursor))return res.status(400).json({ok:false,error:'bad_cursor'});
   const links=(await pool.query(`SELECT discord_user_id AS "discordId",username FROM automod_discord_links WHERE streamer_id=$1 AND discord_user_id>$2 ORDER BY discord_user_id LIMIT 100`,[sid,cursor])).rows;
   return res.json({ok:true,links,nextCursor:links.length===100?links.at(-1).discordId:null});
  }
  const link=await linkedCoins(pool,sid,identity.discordUserId);
  if(req.params.action==='profile')return res.json({ok:true,profile:await coinsProfile(pool,sid,link.rumble_user_id,link.username),shop:UPGRADES});
  if(!['claim','slot','upgrade'].includes(req.params.action))return res.status(400).json({ok:false,error:'bad_action'});
  const receipt=String(req.body?.receipt||'');if(!/^\d{17,20}$/.test(receipt))return res.status(400).json({ok:false,error:'bad_receipt'});
  const upgrade=req.body?.upgrade;if(req.params.action==='upgrade'&&(!upgrade||!Object.hasOwn(UPGRADES,upgrade)))return res.status(400).json({ok:false,error:'bad_upgrade'});
  const result=await coinAction(pool,sid,link.rumble_user_id,link.username,req.params.action as 'claim'|'slot'|'upgrade',`discord:${req.params.action}:${receipt}`,upgrade as Upgrade,req.body?.expectedTier);
  return res.json(result);
 }catch(e){const code=e instanceof Error?e.message:'';
  if(e instanceof InsufficientCoins)return res.status(409).json({ok:false,error:e.message,balance:e.balance,cost:e.cost,missing:e.cost-e.balance});
  if(['rumble_not_linked','insufficient_coins','max_tier','bad_upgrade','stale_shop'].includes(code))return res.status(409).json({ok:false,error:code});throw e;
 }
}));

internalNozeBotRouter.post('/internal/bot/nozebot/automod/:action',requireNozeBot,a(async(req,res)=>{
 const identity=readIdentity(req,res);if(!identity)return;
 const sid=(await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' LIMIT 1")).rows[0]?.id;
 if(!sid)return res.status(404).json({ok:false,error:'streamer_missing'});
 if(req.params.action==='profile')return res.json({ok:true,profile:await automodDiscordProfile(pool,Number(sid),identity.discordUserId)});
 if(req.params.action!=='link')return res.status(404).json({ok:false,error:'unknown_action'});
 try{return res.json({ok:true,...await requestAutomodDiscordLink(pool,Number(sid),identity.discordUserId)});}
 catch(e){if(e instanceof Error&&e.message==='link_cooldown')return res.status(429).json({ok:false,error:'link_cooldown'});throw e;}
}));

internalNozeBotRouter.post("/internal/bot/nozebot/link", requireNozeBot, a(async (req, res) => {
  const identity = readIdentity(req, res);
  if (!identity) return;

  const linked = await getLinkedUser(identity.discordUserId);
  if (linked) {
    res.json({
      ok: true,
      linked: true,
      user: {
        id: Number(linked.id),
        username: String(linked.username),
        role: String(linked.role || "viewer"),
      },
    });
    return;
  }

  const link = await createLinkCode(identity.discordUserId, {
    log: (message) => console.log(`[nozebot-link] ${message}`),
  });
  res.json({
    ok: true,
    linked: false,
    code: link.code,
    expiresAt: link.expiresAt.toISOString(),
  });
}));

internalNozeBotRouter.post("/internal/bot/nozebot/profile", requireNozeBot, a(async (req, res) => {
  const identity = readIdentity(req, res);
  if (!identity) return;

  const linked = await getLinkedUser(identity.discordUserId);
  if (!linked) {
    res.status(409).json({ ok: false, error: "not_linked" });
    return;
  }

  const profile = await getProfileStats(Number(linked.id));
  if (!profile) {
    res.status(404).json({ ok: false, error: "profile_not_found" });
    return;
  }
  res.json({ ok: true, profile });
}));

internalNozeBotRouter.post("/internal/bot/nozebot/claim", requireNozeBot, a(async (req, res) => {
  const identity = readIdentity(req, res);
  if (!identity) return;

  const linked = await getLinkedUser(identity.discordUserId);
  if (!linked) {
    res.status(409).json({ ok: false, error: "not_linked" });
    return;
  }

  const userId = Number(linked.id);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claim = await discordDailyClaimTxClient(client, identity.discordUserId);
    if (!claim.ok) {
      await client.query("ROLLBACK");
      if (claim.error === "cooldown") {
        res.status(429).json({
          ok: false,
          error: "cooldown",
          remainingMs: claim.remainingMs,
          nextAt: claim.nextAt.toISOString(),
        });
        return;
      }
      res.status(500).json({ ok: false, error: "claim_failed" });
      return;
    }

    const userRow = await client.query(
      `SELECT xp::bigint AS xp FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    const levelBefore = getLevelInfo(Number(userRow.rows[0]?.xp || 0));
    const multiplier = getDiscordClaimMultiplier(levelBefore.level);
    const amount = Math.round(Number(claim.amount) * multiplier);

    await earnRubisTx(client, userId, "discord_claim", amount, {
      source: "discord",
      bot: "nozebot",
      kind: "claim",
      monthKey: claim.monthKey,
      countThisMonth: claim.countThisMonth,
      bonus: claim.bonus,
      levelBonusPct: multiplier > 1 ? Math.round((multiplier - 1) * 100) : 0,
      discordUserId: identity.discordUserId,
      discordGuildId: identity.discordGuildId,
    });
    const xp = await awardXpTx(client, userId, 5, "discord_claim", "claim", {
      bot: "nozebot",
      countThisMonth: claim.countThisMonth,
    });
    await client.query(
      `INSERT INTO discord_command_uses (user_id, command) VALUES ($1, 'claim')`,
      [userId]
    );
    const balanceRow = await client.query(
      `SELECT rubis, xp::bigint AS xp FROM users WHERE id = $1`,
      [userId]
    );
    await client.query("COMMIT");

    const level = getLevelInfo(Number(balanceRow.rows[0]?.xp || xp.newXp || 0));
    res.json({
      ok: true,
      claim: {
        amount,
        baseAmount: Number(claim.amount),
        bonus: Number(claim.bonus),
        countThisMonth: Number(claim.countThisMonth),
        nextAt: claim.nextAt.toISOString(),
        balance: Number(balanceRow.rows[0]?.rubis || 0),
        xpGained: xp.delta,
        level: level.level,
        levelTitle: level.fullTitle,
        leveledUp: xp.leveledUp,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[nozebot-claim] transaction failed", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  } finally {
    client.release();
  }
}));

async function linkedIdentity(
  req: Request,
  res: Response
): Promise<{ discordUserId: string; discordGuildId: string; userId: number } | null> {
  const identity = readIdentity(req, res);
  if (!identity) return null;
  const linked = await getLinkedUser(identity.discordUserId);
  if (!linked) {
    res.status(409).json({ ok: false, error: "not_linked" });
    return null;
  }
  return { ...identity, userId: Number(linked.id) };
}

function sendBlackjackError(res: Response, error: unknown): void {
  if (error instanceof NozeBotBlackjackError) {
    res.status(error.status).json({ ok: false, error: error.code, ...error.details });
    return;
  }
  console.error("[nozebot-blackjack] request failed", error);
  res.status(500).json({ ok: false, error: "internal_error" });
}

internalNozeBotRouter.post("/internal/bot/nozebot/blackjack/start", requireNozeBot, a(async (req, res) => {
  const identity = await linkedIdentity(req, res);
  if (!identity) return;
  const mode = req.body?.mode === "plus" ? "plus" : req.body?.mode === "classic" ? "classic" : null;
  if (!mode) {
    res.status(400).json({ ok: false, error: "bad_mode" });
    return;
  }
  try {
    const game = await startNozeBotBlackjack({ ...identity, mode });
    res.json({ ok: true, game });
  } catch (error) {
    sendBlackjackError(res, error);
  }
}));

internalNozeBotRouter.post("/internal/bot/nozebot/blackjack/action", requireNozeBot, a(async (req, res) => {
  const identity = await linkedIdentity(req, res);
  if (!identity) return;
  const sessionId = String(req.body?.sessionId || "").trim();
  const action = String(req.body?.action || "") as NozeBotBlackjackAction;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !["hit", "stand", "double", "split"].includes(action)) {
    res.status(400).json({ ok: false, error: "bad_action" });
    return;
  }
  try {
    const game = await actOnNozeBotBlackjack({ ...identity, sessionId, action });
    res.json({ ok: true, game });
  } catch (error) {
    sendBlackjackError(res, error);
  }
}));

internalNozeBotRouter.post("/internal/bot/nozebot/slot", requireNozeBot, a(async (req, res) => {
  const identity = await linkedIdentity(req, res);
  if (!identity) return;
  try {
    const slot = await playNozeBotSlot(identity);
    res.json({ ok: true, slot });
  } catch (error) {
    if (error instanceof NozeBotSlotError) {
      res.status(error.status).json({ ok: false, error: error.code, ...error.details });
      return;
    }
    console.error("[nozebot-slot] request failed", error);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
}));
