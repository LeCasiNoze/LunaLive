import type {Pool} from 'pg';
import {sendRumbleMessageReliable} from '../rumble_chat_bridge.js';
export function publicRelayText(username:string,body:string,userId:number,botId=Number(process.env.BOT_USER_ID||0)){
 const name=username.replace(/[\r\n\u0000-\u001f]/g,'').trim().slice(0,50);
 const text=body.replace(/[\r\n\u0000-\u001f]/g,' ').trim();
 if(!name||!text||/^[!/]/.test(text)||userId<=0||userId===botId||['lunabot','nozebot',String(process.env.BOT_USERNAME||'').toLowerCase()].includes(name.toLowerCase()))return null;
 const value=`${name}: ${text}`;return value.length>200?value.slice(0,199)+'…':value;
}
const lastByUser=new Map<number,number>();
export async function relayAcceptedLunaMessage(pool:Pool,slug:string,sid:number,uid:number,username:string,body:string){
 if(process.env.LECASINOZE_LUNA_CHAT_RELAY!=='true'||slug.toLowerCase()!=='lecasinoze')return;
 const text=publicRelayText(username,body,uid);if(!text)return;
 const now=Date.now();if(now-(lastByUser.get(uid)??0)<2000)return;
 for(const [id,at] of lastByUser)if(now-at>120000)lastByUser.delete(id);
 if(lastByUser.size>2000)return;
 lastByUser.set(uid,now);
 const target=(await pool.query(`SELECT live_video_id_numeric AS id FROM streamer_rumble_info WHERE streamer_id=$1 AND is_live=TRUE AND updated_at>NOW()-INTERVAL '2 minutes'`,[sid])).rows[0];
 if(target?.id)await sendRumbleMessageReliable(pool,String(target.id),text);
}
