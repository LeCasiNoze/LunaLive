import type {Pool} from 'pg';

// Statut des designs soumis au staff dans 🎨︱validation-design : un design non validé n'apparaît pas en public.
let ready:Promise<unknown>|null=null;
export function reviewSchema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_design_reviews(key text PRIMARY KEY,version text NOT NULL,status text NOT NULL DEFAULT 'pending',
    note text,decided_by text,decided_at timestamptz,message_ids text[] NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT NOW());
    ALTER TABLE belva_design_reviews ADD COLUMN IF NOT EXISTS applied_version text;
    CREATE TABLE IF NOT EXISTS belva_design_review_log(id serial PRIMARY KEY,key text NOT NULL,version text,status text NOT NULL,note text,decided_by text NOT NULL,at timestamptz NOT NULL DEFAULT NOW())`).catch(e=>{ready=null;throw e;});
  return ready;
}

const cache=new Map<string,{ok:boolean;at:number}>();
export const forgetApproval=(key:string)=>cache.delete(key);
export async function isApproved(pool:Pool|undefined,key:string){
  if(!pool)return false;
  const hit=cache.get(key);if(hit&&Date.now()-hit.at<60_000)return hit.ok;
  await reviewSchema(pool);
  const ok=(await pool.query(`SELECT 1 FROM belva_design_reviews WHERE key=$1 AND status='approved'`,[key])).rowCount===1;
  cache.set(key,{ok,at:Date.now()});return ok;
}
