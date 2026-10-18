import { Router } from "express";
import { pool } from "../db.js";
import { tryGetAuthUser } from "../auth.js";

export const chatEventsRouter = Router();
// Read-only snapshots: the database owns counts, membership, labels and deadlines.
export async function readChatEvents(streamerId: number, userId: number) {
  const events: {kind: string; data: any}[] = [];
  const complete: string[] = [];
  const loaders: Record<string, () => Promise<any>> = {
    rain: async () => {
      const r = await pool.query(`SELECT st.round_id, st.open_at_ms, st.close_at_ms, c.rubies_per_user,
        (SELECT COUNT(*)::int FROM bot_rain_joins j WHERE j.streamer_id=st.streamer_id AND j.round_id=st.round_id) AS count,
        EXISTS(SELECT 1 FROM bot_rain_joins j WHERE j.streamer_id=st.streamer_id AND j.round_id=st.round_id AND j.user_id=$2) AS joined
        FROM bot_rain_state st JOIN bot_rain_cfg c USING(streamer_id)
        WHERE st.streamer_id=$1 AND c.enabled AND st.phase='open' AND st.close_at_ms > EXTRACT(EPOCH FROM NOW())*1000`, [streamerId,userId]);
      const row=r.rows[0];
      return row ? { round:row.round_id,endsAtMs:Number(row.close_at_ms),durationSec:(Number(row.close_at_ms)-Number(row.open_at_ms))/1000,pot:Number(row.rubies_per_user),count:Number(row.count),joined:row.joined } : null;
    },
    chest: async () => {
      const r=await pool.query(`SELECT o.id,o.opens_at,o.closes_at,
        (SELECT COUNT(*)::int FROM streamer_chest_participants p WHERE p.opening_id=o.id) AS count,
        EXISTS(SELECT 1 FROM streamer_chest_participants p WHERE p.opening_id=o.id AND p.user_id=$2) AS joined
        FROM streamer_chest_openings o WHERE o.streamer_id=$1 AND o.status='open' AND o.closes_at>NOW() ORDER BY o.id DESC LIMIT 1`,[streamerId,userId]);
      const row=r.rows[0];
      return row ? {round:String(row.id),endsAtMs:new Date(row.closes_at).getTime(),durationSec:(new Date(row.closes_at).getTime()-new Date(row.opens_at).getTime())/1000,count:Number(row.count),joined:row.joined} : null;
    },
    wheel: async () => {
      const r=await pool.query(`SELECT c.updated_at,
        (SELECT COUNT(*)::int FROM bot_wheel_entries e WHERE e.streamer_id=c.streamer_id) AS count,
        (SELECT COALESCE(json_agg(e.username ORDER BY e.created_at,e.id),'[]'::json) FROM bot_wheel_entries e WHERE e.streamer_id=c.streamer_id) AS participants,
        EXISTS(SELECT 1 FROM bot_wheel_entries e WHERE e.streamer_id=c.streamer_id AND e.user_id=$2) AS joined
        FROM bot_wheel_cfg c WHERE c.streamer_id=$1 AND c.enroll_open`,[streamerId,userId]);
      const row=r.rows[0];
      return row ? {round:streamerId,eventKey:`wheel:${streamerId}:${new Date(row.updated_at).getTime()}`,endsAtMs:null,count:Number(row.count),participants:row.participants,joined:row.joined} : null;
    },
    predict: async () => {
      const r=await pool.query(`SELECT p.*,
        (SELECT COUNT(*)::int FROM prediction_bets b WHERE b.prediction_id=p.id) AS count,
        (SELECT COALESCE(SUM(b.amount),0)::int FROM prediction_bets b WHERE b.prediction_id=p.id AND b.choice=1) AS yes_total,
        (SELECT COALESCE(SUM(b.amount),0)::int FROM prediction_bets b WHERE b.prediction_id=p.id AND b.choice=2) AS no_total,
        (SELECT b.choice FROM prediction_bets b WHERE b.prediction_id=p.id AND b.user_id=$2) AS my_choice
        FROM predictions p WHERE p.streamer_id=$1 AND p.status IN ('open','locked') ORDER BY p.id DESC LIMIT 1`,[streamerId,userId]);
      const row=r.rows[0];
      if(!row) return null;
      const yes=Number(row.yes_total), no=Number(row.no_total),totalStake=yes+no;
      return {round:row.id,question:row.question,option1:row.option1_label,option2:row.option2_label,
        endsAtMs:new Date(row.bets_close_at).getTime(),durationSec:(new Date(row.bets_close_at).getTime()-new Date(row.created_at).getTime())/1000,
        locked:row.status!=='open'||new Date(row.bets_close_at).getTime()<=Date.now(), count:Number(row.count),totalStake,
        pctYes:totalStake>0?Math.round(yes/totalStake*100):null,myVote:row.my_choice==1?'yes':row.my_choice==2?'no':null,joined:!!row.my_choice};
    },
  };
  await Promise.all(Object.entries(loaders).map(async([kind,load])=>{
    try { const data=await load(); complete.push(kind); if(data) events.push({kind,data:{...data,real:true}}); }
    catch(error) { console.warn("[chat-events] snapshot failed",kind,(error as any)?.code); }
  }));
  return {events,complete};
}
chatEventsRouter.get("/chat/:slug/events",async(req,res)=>{
  try {
    const r=await pool.query(`SELECT id FROM streamers WHERE lower(slug)=lower($1) AND (suspended_until IS NULL OR suspended_until<NOW()) LIMIT 1`,[String(req.params.slug)]);
    if(!r.rows[0]) return res.status(404).json({ok:false,error:"streamer_not_found"});
    const userId=Number(tryGetAuthUser(req)?.id||0);
    const result=await readChatEvents(Number(r.rows[0].id),userId);
    res.set("Cache-Control","no-store");
    return res.json({ok:true,...result});
  }catch{ return res.status(500).json({ok:false,error:"events_unavailable"}); }
});
