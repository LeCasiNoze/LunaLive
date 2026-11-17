import type {Pool} from 'pg';

// !tips <pseudo Rumble> [montant] dans le chat de Belva (staff) : retrouve le Discord relié et le pseudo casino vérifié
// pour tipper tout de suite ; NozeBot prévient le joueur en MP et note le tip pour le staff (table belva_tips).
let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_tips(id serial PRIMARY KEY,rumble_name text NOT NULL,discord_id text,amount numeric,
    by_name text NOT NULL,at timestamptz NOT NULL DEFAULT NOW(),notified boolean NOT NULL DEFAULT false)`).catch(e=>{ready=null;throw e;});
  return ready;
}

export async function tipChat(pool:Pool,streamerId:number,byName:string,text:string):Promise<string|null>{
  const m=/^!tips?\s+@?([\w.-]{2,40})(?:\s+(\d{1,5}(?:[.,]\d{1,2})?)\s*€?)?\s*$/i.exec(text.trim());
  if(!m)return 'Format : !tips pseudo 20';
  await schema(pool);
  const name=m[1]!,amount=m[2]?Number(m[2].replace(',','.')):null;
  const link=(await pool.query(`SELECT discord_user_id,username FROM automod_discord_links WHERE streamer_id=$1 AND lower(username)=lower($2) LIMIT 1`,[streamerId,name])).rows[0];
  await pool.query(`INSERT INTO belva_tips(rumble_name,discord_id,amount,by_name) VALUES($1,$2,$3,$4)`,[name,link?.discord_user_id??null,amount,byName]);
  if(!link)return `💸 Tip pour ${name}${amount?` (${amount} €)`:''} : compte pas encore relié. ${name}, tape !lier pour qu'on te retrouve sur le Discord de Belva.`;
  const accounts=(await pool.query(`SELECT casino,casino_username FROM belva_casino_accounts WHERE discord_id=$1 AND verified_at IS NOT NULL ORDER BY (casino='rainbet') DESC,casino`,[link.discord_user_id]).catch(()=>({rows:[]}))).rows as {casino:string;casino_username:string}[];
  const where=accounts.length?accounts.map(a=>`${a.casino==='rainbet'?'Rainbet':a.casino} : ${a.casino_username}`).join(' · '):'aucun compte casino vérifié';
  return `💸 Tip pour ${link.username}${amount?` (${amount} €)`:''} → ${where}`;
}
