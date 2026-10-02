import type {PoolClient} from 'pg';
import {SHOP_RULES} from './rules.js';
/** Catalogue prices must use the same target base as the next worker visit. */
export async function effectiveShopStake(client:Pick<PoolClient,'query'>,streamerId:number,base:number,userId?:string,slotKey?:string):Promise<number>{
 if(!Number.isSafeInteger(base)||base<=0)throw Error('invalid_session_stake');
 const global=await client.query(`SELECT 1 FROM automod_shop_orders WHERE streamer_id=$1 AND kind='globalstake'
  AND (status IN ('pending','opening') OR status='done' AND (result->>'activeUntil')::timestamptz>NOW()) LIMIT 1`,[streamerId]);
 let factor=global.rowCount?SHOP_RULES.globalStake.factor:1;
 if(userId&&slotKey){
  const local=await client.query(`SELECT tier FROM automod_shop_orders WHERE streamer_id=$1 AND rumble_user_id=$2 AND slot_key=$3
   AND kind='stake' AND status IN ('pending','opening') ORDER BY created_at DESC LIMIT 1`,[streamerId,userId,slotKey]);
  const tier=Number(local.rows[0]?.tier??0);
  if(tier)factor=Math.max(factor,SHOP_RULES.stake[tier-1]?.factor??1);
 }
 return base*factor;
}
