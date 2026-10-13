import {EVENT_RULES,type EventProvider} from './event-rules.js';

export const CHALLENGE_REWARDS={version:1,winner:1000,loser:250,draw:500,contributionCap:500,pointsPerScore:5} as const;
export type ChallengeRewardTerms={timeBps:number;certaintyBps:number};
/** Freeze eligibility when a camp is chosen, before later scores are known. */
export function challengeRewardTerms(elapsedMs:number,ownScore:number,otherScore:number):ChallengeRewardTerms{
 if(![elapsedMs,ownScore,otherScore].every(Number.isFinite))throw Error('challenge_invalid_reward');
 const timeBps=Math.floor(10000*Math.max(0,1-Math.max(0,elapsedMs)/EVENT_RULES.challengeDurationMs));
 const lead=Math.max(0,ownScore-otherScore)/(Math.abs(ownScore)+Math.abs(otherScore)+50);
 return {timeBps,certaintyBps:Math.floor(10000*(1-.75*lead))};
}
export function challengeReward(terms:ChallengeRewardTerms,provider:EventProvider,winner:EventProvider|null,positiveScoreHundredths:number){
 if(![terms.timeBps,terms.certaintyBps].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=10000)||!Number.isSafeInteger(positiveScoreHundredths)||positiveScoreHundredths<0)throw Error('challenge_invalid_reward');
 const base=winner===null?CHALLENGE_REWARDS.draw:winner===provider?CHALLENGE_REWARDS.winner:CHALLENGE_REWARDS.loser;
 const participation=Math.floor(base*terms.timeBps/10000*(winner===provider?terms.certaintyBps/10000:1));
 const contribution=Math.min(CHALLENGE_REWARDS.contributionCap,Math.floor(positiveScoreHundredths*CHALLENGE_REWARDS.pointsPerScore/100));
 return {participation,contribution,total:participation+contribution};
}
