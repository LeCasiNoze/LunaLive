import type {Pool} from 'pg';
export function renderFollowTemplate(template:string,username:string){
 return String(template||'Merci @{user} pour le follow 💜').replaceAll('@{user}',`@${username}`).replaceAll('{user}',username);
}
export async function emitFollowOverlayAlert(db:Pick<Pool,'query'>,io:any,streamer:any,username:string){
 if(!io||!Number(streamer.ownerUserId))return;
 const result=await db.query('SELECT config FROM streamer_overlay_configs WHERE user_id=$1 LIMIT 1',[Number(streamer.ownerUserId)]);
 const a=result.rows?.[0]?.config?.alerts||{};
 const finite=(value:any,fallback:number)=>Number.isFinite(Number(value))?Number(value):fallback;
 const payload={event:'follow',name:username,text:renderFollowTemplate(a.follow_tpl,username),imageUrl:a.follow_img??null,soundUrl:a.follow_sound??null,
  volume:Math.max(0,Math.min(1,finite(a.sound_vol??1,1))),durationMs:Math.max(1200,Math.min(30000,finite(a.follow_duration_ms??4500,4500))),createdAt:new Date().toISOString()};
 const slug=String(streamer.slug).trim().toLowerCase();
 // The public OBS room already exposes the stream overlay; no owner room access is granted.
 io.to(`stream:${slug}`).to(`obsview:${slug}`).emit('obs:alert',payload);
}
