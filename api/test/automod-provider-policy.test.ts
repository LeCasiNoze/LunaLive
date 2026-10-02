import test from "node:test";
import assert from "node:assert/strict";
import { automodCallProviderAllowed, automodProviderAllowed } from "../src/calls/automod_provider_policy.js";
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
