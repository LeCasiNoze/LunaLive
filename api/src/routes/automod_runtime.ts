const boundedText=(value:unknown,max:number)=>String(value??'').replace(/https?:\/\/\S+/gi,'[url masquée]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[jeton masqué]').replace(/(token|secret|nonce|password|credential)\s*[:=]\s*\S+/gi,'$1=[masqué]').slice(0,max);
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;
export function publicAutomodRuntime(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>20000)return null;
 const providers=['hacksaw','pragmatic','nolimit'];
 const config=input.config&&typeof input.config==='object'?{
  allowedProviders:Array.isArray(input.config.allowedProviders)?input.config.allowedProviders.filter((p:unknown)=>providers.includes(String(p))).slice(0,3):[],
  stakeCents:integer(input.config.stakeCents),slotDurationMs:integer(input.config.slotDurationMs),goldenEnabled:input.config.goldenEnabled===true,audioMode:input.config.audioMode==='game'?'game':'spotify'}:null;
 return {phase:['idle','starting','running','stopping','error'].includes(input.phase)?input.phase:'error',publisherActive:input.publisherActive===true,queueWritable:input.queueWritable===true,
  slot:input.slot&&typeof input.slot==='object'?{name:boundedText(input.slot.name,120),provider:providers.includes(input.slot.provider)?input.slot.provider:'',callId:boundedText(input.slot.callId,40),requestedBy:boundedText(input.slot.requestedBy,80)}:null,
  slotPhase:boundedText(input.slotPhase,40),roundsPlayed:integer(input.roundsPlayed)??0,slotDeadlineAt:integer(input.slotDeadlineAt),recoveryPausedAt:integer(input.recoveryPausedAt),bonusActive:input.bonusActive===true,
  lastError:boundedText(input.lastError,500),logs:Array.isArray(input.logs)?input.logs.slice(-12).map((e:any)=>({at:boundedText(e?.at,40),message:boundedText(e?.message,350)})):[],config};
}
