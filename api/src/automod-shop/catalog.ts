import type { Pool } from 'pg';
import { keyText } from '../calls/normalize.js';
import { validateOffers } from './rules.js';

export type ObservedBonusMenu = {slot_name:string;provider:string;base_stake_cents:number;offers:unknown;observed_at:unknown};

/** Preserve the observed quote: a slot's minimum may exceed the session target. */
export async function findObservedBonusMenu(client:Pick<Pool,'query'>,streamerId:number,slotKey:string,targetStakeCents:number):Promise<ObservedBonusMenu|null>{
 if(!Number.isSafeInteger(targetStakeCents)||targetStakeCents<=0)throw Error('invalid_catalog_target');
 const result=await client.query(`SELECT slot_name,provider,base_stake_cents,offers,observed_at
 FROM automod_bonus_catalog WHERE streamer_id=$1 AND slot_key=$2
 ORDER BY ABS(base_stake_cents-$3),base_stake_cents,observed_at DESC LIMIT 1`,[streamerId,slotKey,targetStakeCents]);
 return result.rows[0]??null;
}

/** Only verified menus are stored. Inspection failures never erase a known menu. */
export async function observeBonusCatalog(pool:Pick<Pool,'query'>,streamerId:number,input:any){
 const name=typeof input?.slotName==='string'?input.slotName.trim():'';
 if(!name||name.length>200||!['hacksaw','pragmatic','nolimit'].includes(input?.provider))throw Error('invalid_catalog_slot');
 const offers=validateOffers(input.offers),base=offers[0]!.baseStakeCents;
 if(base>10000||offers.some(o=>o.baseStakeCents!==base))throw Error('invalid_catalog_stake');
 await pool.query(`INSERT INTO automod_bonus_catalog(streamer_id,slot_key,slot_name,provider,base_stake_cents,offers)
 VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(streamer_id,slot_key,base_stake_cents)
 DO UPDATE SET slot_name=EXCLUDED.slot_name,provider=EXCLUDED.provider,offers=EXCLUDED.offers,observed_at=NOW()`,
 [streamerId,keyText(name),name,input.provider,base,JSON.stringify(offers)]);
 return {ok:true,baseStakeCents:base,offerCount:offers.length};
}
