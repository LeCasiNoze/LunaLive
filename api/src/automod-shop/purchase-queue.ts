export async function requirePurchaseSlotAvailable(db:{query:(sql:string,args:unknown[])=>Promise<any>},streamerId:number,slotKey:string):Promise<void>{
 const waiting=await db.query(`SELECT 1 FROM calls_queue WHERE streamer_id=$1 AND slot_key=$2 LIMIT 1`,[streamerId,slotKey]);
 if(waiting.rowCount)throw Error('buy_slot_already_waiting');
}
