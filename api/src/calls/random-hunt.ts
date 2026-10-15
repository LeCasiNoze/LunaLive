import type {Pool} from 'pg';
import {normalizeProvider,providerAliases} from './provider_aliases.js';
import {excludedSlotName} from './excluded-slot.js';
export const RANDOM_HUNT_PROVIDERS=['Pragmatic Play','Hacksaw Gaming','Nolimit City','AvatarUX','BGaming','Elk'];
export function randomHuntProvider(raw:string):string|null{
 const p=String(normalizeProvider(raw.trim().toLowerCase()==='elk studios'?'elk':raw)||'').toLowerCase();
 return RANDOM_HUNT_PROVIDERS.find(x=>x.toLowerCase()===p)??null;
}
export function validateGeneration(count:unknown,requestId:unknown){
 if(!Number.isInteger(count)||Number(count)<1||Number(count)>30)throw Error('invalid_count');
 if(typeof requestId!=='string'||!/^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/.test(requestId))throw Error('invalid_request');
}
export async function generateHuntCalls(pool:Pool,sid:number,slug:string,count:number,requestId:string){
 validateGeneration(count,requestId);
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock($1)',[sid]);
  const receipt=(await c.query('SELECT added FROM calls_hunt_generations WHERE streamer_id=$1 AND request_id=$2',[sid,requestId])).rows[0];
  if(receipt){await c.query('COMMIT');return {ok:true,added:Number(receipt.added),replayed:true};}
  const settings=(await c.query('SELECT enabled FROM calls_settings WHERE streamer_id=$1',[sid])).rows[0];
  if(settings?.enabled===false)throw Error('calls_disabled');
  const session=(await c.query('SELECT mode,opened FROM calls_hunt_sessions WHERE streamer_id=$1 FOR UPDATE',[sid])).rows[0];
  if(session&&(session.mode!=='farm'||session.opened))throw Error('hunt_not_farming');
  const control=(await c.query('SELECT desired_enabled FROM automod_control WHERE streamer_id=$1',[sid])).rows[0];
  if(control?.desired_enabled)throw Error('automod_active');
  const pending=Number((await c.query(`SELECT COUNT(*) AS n FROM calls_queue WHERE streamer_id=$1
   AND COALESCE(is_bonus,FALSE)=FALSE AND (bet IS NULL OR bet<=0)`,[sid])).rows[0].n);
  if(pending+count>500)throw Error('queue_full');
  const bans=(await c.query('SELECT kind,ban_key FROM calls_bans WHERE streamer_id=$1',[sid])).rows;
  const bannedSlots=new Set(bans.filter(x=>x.kind==='slot').map(x=>x.ban_key));
  const bannedProviders=new Set(bans.filter(x=>x.kind==='provider').map(x=>String(randomHuntProvider(x.ban_key)||normalizeProvider(x.ban_key)||'').toLowerCase()));
  const policy=(await c.query('SELECT mode FROM calls_provider_policy WHERE streamer_id=$1',[sid])).rows[0];
  const allowed=new Set((await c.query('SELECT provider_norm FROM calls_allowed_providers WHERE streamer_id=$1',[sid])).rows.map(x=>String(randomHuntProvider(x.provider_norm)||normalizeProvider(x.provider_norm)||'').toLowerCase()));
  const aliases=[...new Set([...RANDOM_HUNT_PROVIDERS.flatMap(providerAliases),'elk studios'])];
  const candidates=(await c.query(`SELECT name,name_key,provider FROM slots_catalog s
   WHERE lower(trim(s.provider))=ANY($2::text[]) AND NOT EXISTS
   (SELECT 1 FROM calls_queue q WHERE q.streamer_id=$1 AND q.slot_key=s.name_key)
   ORDER BY random()`,[sid,aliases])).rows.filter(x=>{
    const provider=randomHuntProvider(x.provider)?.toLowerCase();
    return provider&&!bannedSlots.has(x.name_key)&&!bannedProviders.has(provider)
     &&(policy?.mode!=='allow_only'||allowed.has(provider))
     &&(slug.toLowerCase()!=='lecasinoze'||!excludedSlotName(x.name));
   }).slice(0,count);
  if(!candidates.length)throw Error('no_eligible_slots');
  let pos=Number((await c.query('SELECT COALESCE(MAX(pos),0) AS pos FROM calls_queue WHERE streamer_id=$1',[sid])).rows[0].pos);
  for(const slot of candidates)await c.query(`INSERT INTO calls_queue
   (streamer_id,slot_name,slot_key,provider,user_id,username,pos,is_bonus,hunt_generated)
   VALUES($1,$2,$3,$4,0,'Aléatoire',$5,FALSE,TRUE)`,[sid,slot.name,slot.name_key,String(randomHuntProvider(slot.provider)).toLowerCase(),++pos]);
  await c.query('INSERT INTO calls_hunt_generations(streamer_id,request_id,added) VALUES($1,$2,$3)',[sid,requestId,candidates.length]);
  await c.query('COMMIT');return {ok:true,added:candidates.length,replayed:false};
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}
