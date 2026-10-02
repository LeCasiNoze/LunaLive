import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { sendRumbleMessageReliable } from "../rumble_chat_bridge.js";
import { shopReplyChunks,SHOP_RULES } from "./rules.js";
import { inTransaction } from "./wallet.js";
import { walletSummary } from "./wallet.js";
import { reconcileRemovedShopCalls } from "./runtime.js";
export async function notifyShop(pool:Pool,streamerId:number,text:string){
 const target=await pool.query(`SELECT i.live_video_id_numeric FROM streamer_rumble_info i JOIN streamers s ON s.id=i.streamer_id
  WHERE i.streamer_id=$1 AND i.is_live=TRUE AND lower(s.slug)='lecasinoze'`,[streamerId]);
 const vid=target.rows[0]?.live_video_id_numeric;if(!vid)return {sent:false};
 const results=[];for(const chunk of shopReplyChunks(text))results.push(await sendRumbleMessageReliable(pool,String(vid),chunk));
 return {sent:results.every(r=>r.sent||r.queued)};
}
export async function tickPointsRain(pool:Pool,streamerId:number){
 for(const released of await reconcileRemovedShopCalls(pool,streamerId)){
  await notifyShop(pool,streamerId,`@${released.username} — Ton call a été retiré : les points réservés sont libérés. ${walletSummary(released.wallet)}`);
 }
 const rain=await inTransaction(pool,async c=>{
  await c.query(`SELECT pg_advisory_xact_lock($1)`,[streamerId]);
  const mode=await c.query(`SELECT desired_enabled,runtime_status,runtime_seen_at FROM automod_control WHERE streamer_id=$1`,[streamerId]);
  const m=mode.rows[0];
  if(!m?.desired_enabled||!m.runtime_status?.publisherActive||Date.now()-new Date(m.runtime_seen_at).getTime()>60000)return null;
  const last=await c.query(`SELECT id,opened_at,closes_at,announced_at FROM automod_points_rains WHERE streamer_id=$1 ORDER BY opened_at DESC LIMIT 1`,[streamerId]);
  if(last.rows[0]&&Date.now()-new Date(last.rows[0].opened_at).getTime()<SHOP_RULES.rainIntervalMs)return new Date(last.rows[0].closes_at).getTime()>Date.now()?last.rows[0]:null;
  const id=randomUUID();
  const r=await c.query(`INSERT INTO automod_points_rains(id,streamer_id,points,closes_at) VALUES($1,$2,$3,NOW()+INTERVAL '2 minutes') RETURNING *`,[id,streamerId,SHOP_RULES.rainPoints]);
  return r.rows[0];
 });
 if(rain&&!rain.announced_at){
  const notified=await notifyShop(pool,streamerId,`🌧️ Rain Automod ! Tape !rain dans les 2 minutes pour recevoir ${SHOP_RULES.rainPoints} points. Une participation par personne.`);
  if(notified.sent)await pool.query(`UPDATE automod_points_rains SET announced_at=NOW() WHERE streamer_id=$1 AND id=$2`,[streamerId,rain.id]);
 }
 return rain?{id:rain.id,closesAt:rain.closes_at,points:SHOP_RULES.rainPoints}:null;
}
