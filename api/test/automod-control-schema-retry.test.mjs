import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=readFileSync(new URL('../src/routes/automod_control.ts',import.meta.url),'utf8');
const base=src.slice(src.indexOf('function ensureSchema()'),src.indexOf('function captchaConfig()'));
const dashboard=src.slice(src.indexOf('export function ensureDashboardSchema()'),src.indexOf('async function dashboardStreamer')).replace('export ','');
for(const failure of [1,2]){
 let calls=0;const context={pool:{query:async()=>{calls++;if(calls===failure)throw Error('transient');return {rows:[]};}}};vm.createContext(context);
 vm.runInContext('let schemaReady=null,dashboardSchemaReady=null;'+base+dashboard+';globalThis.ensure=ensureDashboardSchema;',context);
 await assert.rejects(context.ensure());await context.ensure();await context.ensure();
 assert.equal(calls,3);
}
console.log('Both schema initialization failure paths recover and cache success');

