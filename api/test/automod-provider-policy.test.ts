import test from "node:test";
import assert from "node:assert/strict";
import { automodCallProviderAllowed, automodProviderAllowed, callProviderAdmission } from "../src/calls/automod_provider_policy.js";
import { addCall } from "../src/calls/queue.js";

test("provider families accept aliases but reject disabled and unknown providers", () => {
 for(const provider of ['hacksaw','Hacksaw Gaming','backseat gaming']) assert.equal(automodProviderAllowed(provider,['hacksaw']),true);
 for(const provider of ['pragmatic','Pragmatic Play','pragmatic-play']) assert.equal(automodProviderAllowed(provider,['pragmatic']),true);
 assert.equal(automodProviderAllowed('no-limit-city',['nolimit']),true);
 for(const provider of ['Nolimit City','NetEnt',null,'fake hacksaw']) assert.equal(automodProviderAllowed(provider,['hacksaw','pragmatic']),false);
 assert.equal(automodProviderAllowed('Hacksaw Gaming',[]),false);
});
test("classic mode unchanged, active mode uses dashboard policy even with stale runtime", async () => {
 let row:any={desired_enabled:false};const db:any={query:async()=>({rows:[row]})};
 assert.equal(await automodCallProviderAllowed(db,1,'NetEnt'),true);
 row={desired_enabled:true,dashboard_settings:{allowedProviders:['hacksaw']},runtime_status:{config:{allowedProviders:['nolimit']}}};
 assert.equal(await automodCallProviderAllowed(db,1,'Nolimit City'),false);
 assert.equal(await automodCallProviderAllowed(db,1,'hacksaw'),true);
});
test("rejected call cannot enter the queue or consume the user's limit", async () => {
 const db:any={query:async(sql:string)=>({rows:sql.startsWith('SELECT enabled')?[{enabled:true}]:sql.includes('FROM automod_control')?[{desired_enabled:true,dashboard_settings:{allowedProviders:['hacksaw']}}]:[]}),
 connect:async()=>{throw Error('A rejected call must not start an insert transaction');}};
 assert.deepEqual(await addCall(db,1,123,'Viewer','Starburst','NetEnt'),{ok:false,error:'automod_provider_not_allowed'});
});

test('personal calls accept all families when personal policy is allow_all, despite stale Automod runtime',async()=>{
 const db:any={query:async()=>({rows:[{desired_enabled:false,dashboard_settings:{allowedProviders:['hacksaw','pragmatic']},runtime_status:{publisherActive:true}}]})};
 for(const provider of ['NetEnt','Play’n GO','Nolimit City','Pragmatic Play'])assert.deepEqual(await callProviderAdmission(db,1,provider),{automod:false,allowed:true});
});

test('a generated Automod request retains its own provider policy outside a running session',async()=>{
 const db:any={query:async()=>({rows:[{desired_enabled:false,dashboard_settings:{allowedProviders:['hacksaw','pragmatic']}}]})};
 assert.deepEqual(await callProviderAdmission(db,1,'NetEnt',true),{automod:true,allowed:false});
 assert.deepEqual(await callProviderAdmission(db,1,'Pragmatic Play',true),{automod:true,allowed:true});
});
test('a generated request with no control row uses safe Automod defaults',async()=>{
 const db:any={query:async()=>({rows:[]})};
 assert.deepEqual(await callProviderAdmission(db,1,'Pragmatic Play',true),{automod:true,allowed:true});
 assert.deepEqual(await callProviderAdmission(db,1,'NetEnt',true),{automod:true,allowed:false});
});

test('Automod admission never consults the conflicting personal provider allow-list',async()=>{
 const db:any={query:async(sql:string)=>{
  if(sql.includes('calls_provider_policy')||sql.includes('calls_allowed_providers'))throw Error('Personal policy must not be read for Automod');
  return {rows:sql.startsWith('SELECT enabled')?[{enabled:true}]:sql.includes('FROM automod_control')?[{desired_enabled:true,dashboard_settings:{allowedProviders:['hacksaw','pragmatic']}}]:[]};
 },connect:async()=>{throw Error('INSERT_STAGE_REACHED');}};
 await assert.rejects(addCall(db,1,123,'Viewer','Sweet Craze','Pragmatic Play'),/INSERT_STAGE_REACHED/);
});

test('personal admission still obeys its own restrictive policy when configured',async()=>{
 const db:any={query:async(sql:string)=>({rows:sql.startsWith('SELECT enabled')?[{enabled:true}]:sql.includes('FROM automod_control')?[{desired_enabled:false}]:sql.includes('SELECT mode FROM calls_provider_policy')?[{mode:'allow_only'}]:[]}),connect:async()=>{throw Error('Rejected personal call must not be inserted');}};
 assert.deepEqual(await addCall(db,1,123,'Viewer','Sweet Craze','Pragmatic Play'),{ok:false,error:'provider_not_allowed'});
});
