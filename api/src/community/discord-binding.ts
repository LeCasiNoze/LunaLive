import type {PoolClient} from 'pg';
import {discordIdentityBindingsSql} from './external-accounts.js';
export async function assertDiscordBinding(client:Pick<PoolClient,'query'>,discordId:string,userId:number){
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['discord:'+discordId]);
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['discord-user:'+userId]);
 const conflict=await client.query(`SELECT 1 FROM (${discordIdentityBindingsSql}) linked WHERE (discord_user_id=$1 AND user_id<>$2) OR (user_id=$2 AND discord_user_id<>$1) LIMIT 1`,[discordId,userId]);
 if(conflict.rows[0])throw Error('identity_conflict');
}
