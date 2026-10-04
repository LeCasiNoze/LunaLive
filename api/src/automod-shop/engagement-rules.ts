export const PREDICTION_MS=180_000;
export const MODE_VOTE_MS=300_000;
export const BET_MIN=10, BET_MAX=500;
export type PredictionBet={userId:string;choice:'yes'|'no';points:number};
export function validPredictionPoints(n:number){return Number.isSafeInteger(n)&&n>=BET_MIN&&n<=BET_MAX&&n%10===0;}
/** No seed or house subsidy: distribute exactly the existing pot, or refund it. */
export function predictionPayouts(bets:PredictionBet[],winner:'yes'|'no'|null){
 if(bets.some(b=>!validPredictionPoints(b.points))||new Set(bets.map(b=>b.userId)).size!==bets.length)throw Error('invalid_prediction_bets');
 const yes=bets.filter(b=>b.choice==='yes').reduce((s,b)=>s+b.points,0),no=bets.filter(b=>b.choice==='no').reduce((s,b)=>s+b.points,0);
 if(!winner||!yes||!no)return {refund:true,payouts:bets.map(b=>({userId:b.userId,points:b.points}))};
 const total=yes+no,winning=winner==='yes'?yes:no;
 const rows=bets.filter(b=>b.choice===winner).map(b=>({userId:b.userId,points:Math.floor(total*b.points/winning),remainder:total*b.points%winning}));
 let missing=total-rows.reduce((s,b)=>s+b.points,0);
 rows.sort((a,b)=>b.remainder-a.remainder||a.userId.localeCompare(b.userId));
 for(const row of rows){if(missing-->0)row.points++;}
 return {refund:false,payouts:rows.map(({userId,points})=>({userId,points}))};
}
export function parisVoteCheckpoint(now:Date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const hour=Number(parts.hour);
 return [10,14,20].includes(hour)&&Number(parts.minute)<15?`${parts.year}-${parts.month}-${parts.day}:${hour}`:null;
}
export function predictionStats(bets:PredictionBet[]){
 const yes=bets.filter(b=>b.choice==='yes'),no=bets.filter(b=>b.choice==='no');
 const yesPoints=yes.reduce((s,b)=>s+b.points,0),noPoints=no.reduce((s,b)=>s+b.points,0),pot=yesPoints+noPoints;
 return {yesVotes:yes.length,noVotes:no.length,yesPoints,noPoints,pot,
  yesOdds:yesPoints&&noPoints?pot/yesPoints:null,noOdds:yesPoints&&noPoints?pot/noPoints:null};
}

export function parsePredictionCommand(text:string){
 const raw=text.trim();
 if(!/^!(?:oui|non|pari)(?:\s|$)/i.test(raw))return null;
 const match=/^!(?:pari\s+)?(oui|non)\s+(\d{1,6})(?:[.,](\d{1,2}))?\s*$/i.exec(raw);
 if(!match)return {error:true as const};
 const amount=Number(match[2]+(match[3]?'.'+match[3]:''));
 const points=Math.round(amount/10)*10;
 if(amount<BET_MIN||amount>BET_MAX||!validPredictionPoints(points))return {error:true as const};
 return {error:false as const,choice:match[1]!.toLowerCase()==='oui'?'yes' as const:'no' as const,points};
}
