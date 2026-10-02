import type { Pool, PoolClient } from "pg";
import { validRumbleIdentity } from "./rules.js";
export type Wallet = { balance: number; reserved: number; available: number };
export async function readWallet(client: Pick<PoolClient, 'query'>, streamerId:number, userId:string):Promise<Wallet> {
  const result=await client.query(`SELECT balance,reserved FROM automod_points_accounts WHERE streamer_id=$1 AND rumble_user_id=$2`,[streamerId,userId]);
  return result.rows[0]?walletFromRow(result.rows[0]):{balance:0,reserved:0,available:0};
}
export function walletSummary(wallet:Wallet):string {
  return `Solde : ${wallet.available} points disponibles${wallet.reserved?`, ${wallet.reserved} réservés`:''}.`;
}
export function walletFromRow(row: any): Wallet {
  const balance = Number(row.balance), reserved = Number(row.reserved);
  if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(reserved) || reserved < 0 || balance < reserved) throw Error("invalid_wallet");
  return { balance, reserved, available: balance - reserved };
}
export async function lockWallet(client: PoolClient, streamerId: number, userId: string, username: string): Promise<Wallet> {
  if (!validRumbleIdentity(userId)) throw Error("rumble_identity_required");
  await client.query(`INSERT INTO automod_points_accounts(streamer_id,rumble_user_id,username) VALUES($1,$2,$3)
    ON CONFLICT(streamer_id,rumble_user_id) DO UPDATE SET username=EXCLUDED.username,updated_at=NOW()`, [streamerId,userId,username.slice(0,80)]);
  const result = await client.query(`SELECT balance,reserved FROM automod_points_accounts WHERE streamer_id=$1 AND rumble_user_id=$2 FOR UPDATE`, [streamerId,userId]);
  return walletFromRow(result.rows[0]);
}
/** Caller owns a transaction. Lock the account BEFORE deciding admission or changing an order. */
export async function walletEntry(client: PoolClient, streamerId: number, userId: string, eventKey: string,
  delta: number, reservedDelta: number, reason: string, metadata: unknown = {}): Promise<boolean> {
  if (!Number.isSafeInteger(delta) || !Number.isSafeInteger(reservedDelta) || eventKey.length < 1 || eventKey.length > 240) throw Error("invalid_wallet_entry");
  const previous = await client.query(`SELECT rumble_user_id,delta,reserved_delta FROM automod_points_ledger WHERE streamer_id=$1 AND event_key=$2`, [streamerId,eventKey]);
  if (previous.rows[0]) {
    const row=previous.rows[0];
    if(row.rumble_user_id!==userId || Number(row.delta)!==delta || Number(row.reserved_delta)!==reservedDelta) throw Error("wallet_event_conflict");
    return false;
  }
  const updated = await client.query(`UPDATE automod_points_accounts SET balance=balance+$3,reserved=reserved+$4,updated_at=NOW()
    WHERE streamer_id=$1 AND rumble_user_id=$2 AND balance+$3>=reserved+$4 AND reserved+$4>=0 AND balance+$3<=1000000000000
    RETURNING balance,reserved`, [streamerId,userId,delta,reservedDelta]);
  if (!updated.rowCount) throw Error("insufficient_points");
  await client.query(`INSERT INTO automod_points_ledger(streamer_id,rumble_user_id,event_key,delta,reserved_delta,reason,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`, [streamerId,userId,eventKey,delta,reservedDelta,reason,JSON.stringify(metadata)]);
  return true;
}
export async function inTransaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result=await action(client); await client.query("COMMIT"); return result; }
  catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
export async function creditPoints(pool: Pool, streamerId: number, userId: string, username: string,
  eventKey: string, points: number, reason: string, metadata: unknown = {}): Promise<Wallet> {
  if (!Number.isSafeInteger(points) || points<0 || points>1000000) throw Error("invalid_credit");
  return inTransaction(pool,async client=>{
    await lockWallet(client,streamerId,userId,username);
    await walletEntry(client,streamerId,userId,eventKey,points,0,reason,metadata);
    const result=await client.query(`SELECT balance,reserved FROM automod_points_accounts WHERE streamer_id=$1 AND rumble_user_id=$2`,[streamerId,userId]);
    return walletFromRow(result.rows[0]);
  });
}
