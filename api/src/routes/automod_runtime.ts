const boundedText=(value:unknown,max:number)=>String(value??'').replace(/https?:\/\/\S+/gi,'[url masquée]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[jeton masqué]').replace(/(token|secret|nonce|password|credential)\s*[:=]\s*\S+/gi,'$1=[masqué]').slice(0,max);
const media=(v:unknown)=>{try{const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password?u.href.slice(0,2000):null;}catch{return null;}};
const integer=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):null;
const score=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<1e12?Math.round(value*100)/100:0;
export function publicAutomodRuntime(input:any){
 if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>70000)return null;
 const providers=['hacksaw','pragmatic','nolimit'];
 const config=input.config&&typeof input.config==='object'?{
  mode:input.config.mode==='provider-challenge'?'provider-challenge':input.config.mode==='session-buy'?'session-buy':input.config.mode==='auto-hunt'?'auto-hunt':'automod',fastSpins:input.config.fastSpins===true,hunt:input.config.hunt&&typeof input.config.hunt==='object'?{jail:input.config.hunt.jail===true,jailSpinLimit:integer(input.config.hunt.jailSpinLimit),openingCondition:['count','balance','vote'].includes(input.config.hunt.openingCondition)?input.config.hunt.openingCondition:'count',targetBonuses:integer(input.config.hunt.targetBonuses),balanceFloorCents:integer(input.config.hunt.balanceFloorCents),voteFromBonuses:integer(input.config.hunt.voteFromBonuses),voteEveryBonuses:integer(input.config.hunt.voteEveryBonuses)}:null,
  allowedProviders:Array.isArray(input.config.allowedProviders)?input.config.allowedProviders.filter((p:unknown)=>providers.includes(String(p))).slice(0,3):[],
  stakeCents:integer(input.config.stakeCents),slotDurationMs:integer(input.config.slotDurationMs),goldenEnabled:input.config.goldenEnabled===true,audioMode:input.config.audioMode==='game'?'game':'spotify'}:null;
 const series=input.sessionBuy?.series;
 const challenge=input.providerChallenge;
 const providerChallenge=input.mode==='provider-challenge'&&challenge?{
  status:['preparing','playing','settled','refunded'].includes(challenge.status)?challenge.status:'unknown',
  scores:{pragmatic:score(challenge.scores?.pragmatic),hacksaw:score(challenge.scores?.hacksaw)},
  counts:{pragmatic:integer(challenge.counts?.pragmatic)??0,hacksaw:integer(challenge.counts?.hacksaw)??0},
  nextProvider:challenge.nextProvider==='hacksaw'?'hacksaw':'pragmatic',closesAt:Number.isFinite(Date.parse(challenge.closesAt))?new Date(challenge.closesAt).toISOString():null}:null;
 const purchases=Array.isArray(series?.purchases)?series.purchases.slice(0,3):[];
 const sessionBuy=input.mode==='session-buy'?{completed:integer(input.sessionBuy?.completed)??0,phase:boundedText(series?.phase??'waiting',30),purchaseCount:purchases.length,settledCount:purchases.filter((p:any)=>p?.phase==='completed').length,gainCents:purchases.reduce((sum:number,p:any)=>sum+(integer(p?.gainCents)??0),0)}:null;
 return {providerChallenge,sessionBuy,supportedFeatures:Array.isArray(input.supportedFeatures)?input.supportedFeatures.filter((f:unknown)=>['weekly-purchase','purchase-upgrade'].includes(String(f))).slice(0,2):[],supportedModes:Array.isArray(input.supportedModes)?input.supportedModes.filter((m:unknown)=>['automod','auto-hunt','session-buy','provider-challenge'].includes(String(m))).slice(0,4):['automod','auto-hunt'],mode:input.mode==='provider-challenge'?'provider-challenge':input.mode==='session-buy'?'session-buy':input.mode==='bonus-hunt'?'bonus-hunt':'automod',huntEntries:Array.isArray(input.huntEntries)?input.huntEntries.filter((e:any)=>e&&typeof e==='object').slice(-50).map((e:any)=>({id:boundedText(e.id,100),status:['pending','opening','opened','failed'].includes(e.status)?e.status:'failed',slotName:boundedText(e.slotName,120),imageUrl:media(e.imageUrl),baseStakeCents:integer(e.baseStakeCents),gainCents:integer(e.gainCents)})):[],phase:['idle','starting','running','stopping','error'].includes(input.phase)?input.phase:'error',publisherActive:input.publisherActive===true,queueWritable:input.queueWritable===true,
  slot:input.slot&&typeof input.slot==='object'?{name:boundedText(input.slot.name,120),provider:providers.includes(input.slot.provider)?input.slot.provider:'',callId:boundedText(input.slot.callId,40),requestedBy:boundedText(input.slot.requestedBy,80),imageUrl:media(input.slot.imageUrl)}:null,
  slotPhase:boundedText(input.slotPhase,40),roundsPlayed:integer(input.roundsPlayed)??0,slotDeadlineAt:integer(input.slotDeadlineAt),recoveryPausedAt:integer(input.recoveryPausedAt),bonusActive:input.bonusActive===true,
  lastError:boundedText(input.lastError,500),logs:Array.isArray(input.logs)?input.logs.slice(-12).map((e:any)=>({at:boundedText(e?.at,40),message:boundedText(e?.message,350)})):[],config};
}
