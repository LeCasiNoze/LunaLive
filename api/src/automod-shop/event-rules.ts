/** Agreed rules, kept independent of browser execution and wallet mutation. */
export type EventMode='automod'|'auto-hunt'|'session-buy'|'provider-challenge';
export type EventProvider='pragmatic'|'hacksaw';
export const EVENT_RULES={challengeDurationMs:2*60*60_000,providerBlockSize:3,preparationMs:3*60_000,
 naturalBonusPoints:5,referralPoints:500,referralMonthlyLimit:5,referralPlayedCalls:2,
 referralEligibilityMs:7*24*60*60_000,monthlyGiveawayBudgetCents:5000,
 dailyEventRankPoints:[100,50,25] as const,maximumLevelDiscountPercent:10} as const;

function nonNegativeInt(value:number,name:string){if(!Number.isSafeInteger(value)||value<0)throw Error('invalid_'+name);}

export function providerPassScore(input:{spentCents:number;returnedCents:number;naturalBonuses:number;bestMultiplier:number}){
 nonNegativeInt(input.spentCents,'spent');nonNegativeInt(input.returnedCents,'returned');nonNegativeInt(input.naturalBonuses,'bonuses');
 if(!Number.isFinite(input.bestMultiplier)||input.bestMultiplier<0)throw Error('invalid_multiplier');
 const profitCents=input.returnedCents-input.spentCents;
 const spectacle=input.bestMultiplier>=5000?80:input.bestMultiplier>=1000?40:input.bestMultiplier>=500?20:input.bestMultiplier>=300?10:input.bestMultiplier>=100?5:0;
 // Integer hundredths avoid cumulative floating point errors (1 euro = 2 score points).
 const scoreHundredths=profitCents*2+(input.naturalBonuses*5+spectacle)*100;
 if(!Number.isSafeInteger(scoreHundredths))throw Error('score_overflow');
 return {profitCents,scoreHundredths,score:scoreHundredths/100,spectacle};
}

export function nextChallengeProvider(completedPasses:number):EventProvider{
 nonNegativeInt(completedPasses,'passes');return Math.floor(completedPasses/3)%2===0?'pragmatic':'hacksaw';
}
export function canFinishChallenge(input:{elapsedMs:number;pragmaticPasses:number;hacksawPasses:number;bonusActive:boolean;passActive:boolean}){
 nonNegativeInt(input.elapsedMs,'elapsed');nonNegativeInt(input.pragmaticPasses,'passes');nonNegativeInt(input.hacksawPasses,'passes');
 return input.elapsedMs>=EVENT_RULES.challengeDurationMs&&!input.bonusActive&&!input.passActive&&
  input.pragmaticPasses>0&&input.pragmaticPasses===input.hacksawPasses&&input.pragmaticPasses%3===0;
}

export function remainingPassMs(durationMs:number,playedMs:number){
 nonNegativeInt(durationMs,'duration');nonNegativeInt(playedMs,'played');return Math.max(0,durationMs-playedMs);
}

export interface PurchaseOption {id:string;kind:'classic'|'bounty'|'other';costCents:number;stakeCents:number;verified:boolean}
export function selectSessionPurchase(provider:EventProvider,sessionStakeCents:number,offers:PurchaseOption[]){
 if(!Number.isSafeInteger(sessionStakeCents)||sessionStakeCents<=0)throw Error('invalid_stake');
 const targetCents=sessionStakeCents*100,capCents=sessionStakeCents*125;
 const safe=offers.filter(o=>o.verified&&Number.isSafeInteger(o.costCents)&&o.costCents>0&&o.costCents<=capCents&&Number.isSafeInteger(o.stakeCents)&&o.stakeCents>0);
 const priority=provider==='hacksaw'?'bounty':'classic';
 const preferred=safe.filter(o=>o.kind===priority);
 const candidates=preferred.length?preferred:safe.filter(o=>o.kind==='classic');
 return [...candidates].sort((a,b)=>Math.abs(a.costCents-targetCents)-Math.abs(b.costCents-targetCents)||a.costCents-b.costCents||a.id.localeCompare(b.id))[0]??null;
}

export type ShopFeature='bonus'|'raise'|'extend'|'upgrade-one-purchase';
export function shopFeatureAllowed(mode:EventMode,feature:ShopFeature,jail=false){
 if(mode==='provider-challenge')return feature==='raise';
 if(mode==='session-buy')return feature==='upgrade-one-purchase';
 if(feature==='upgrade-one-purchase')return false;
 return !(jail&&feature==='extend');
}
export function assertShopContext(expectedRevision:string,currentRevision:string,mode:EventMode,feature:ShopFeature,jail=false){
 if(!expectedRevision||expectedRevision!==currentRevision)throw Error('shop_context_changed_no_debit');
 if(!shopFeatureAllowed(mode,feature,jail))throw Error('shop_feature_unavailable_no_debit');
}

export function parisEventDay(date:Date){
 if(!Number.isFinite(date.getTime()))throw Error('invalid_date');
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date);
 const get=(type:string)=>parts.find(p=>p.type===type)?.value;
 return {key:`${get('year')}-${get('month')}-${get('day')}`,month:`${get('year')}-${get('month')}`,active:['Tue','Fri'].includes(get('weekday')??'')};
}
