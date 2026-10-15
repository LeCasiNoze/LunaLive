import type {Pool} from 'pg';
import {sweepSoundboard,controlSoundboard} from './soundboard.js';
import {soundboardFeatureEnabled} from './soundboard-config.js';
export function startSoundboardMaintenance(pool:Pool){
 let running=false,stopped=false;
 const timer=setInterval(()=>{
  if(stopped||running)return;
  running=true;
  void(async()=>{
   // Disabling the feature must not strand requests already charged before a restart.
   const enabled=soundboardFeatureEnabled();
   if(!enabled){const exists=(await pool.query("SELECT to_regclass('public.nozecoin_soundboard_requests') AS present")).rows[0]?.present;if(!exists)return;}
   const sid=(await pool.query("SELECT id FROM streamers WHERE lower(slug)='lecasinoze' LIMIT 1")).rows[0]?.id;
   if(sid){if(enabled)await sweepSoundboard(pool,Number(sid));else await controlSoundboard(pool,Number(sid),false);}
  })().catch(()=>console.warn('[soundboard] maintenance temporarily unavailable')).finally(()=>{running=false;});
 },10000);
 timer.unref();
 return ()=>{stopped=true;clearInterval(timer);};
}
