import {randomInt} from 'node:crypto';
import {SlashCommandBuilder,type Client,type Guild,type Interaction,type Message,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';
import {BELVA_ROLES} from './belva-roles.js';

// Tombola du dimanche : l'API annonce un code dans le chat Rumble de Belva (table belva_tombola_codes),
// chaque code tapé avec /code donne 1 ticket pour le tirage de la semaine. Tirage pondéré, gagnants distincts.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const GIVEAWAY_CHANNEL='1481938142905766008';
const PANEL_CHANNEL='1571169967054000139';
const WINNERS=()=>Number(process.env.BELVA_TOMBOLA_WINNERS)||2;
const PRIZE=()=>process.env.BELVA_TOMBOLA_PRIZE?.trim()||'15 €';
// Prochain dimanche 23 h (Paris), après le live du dimanche ; calculé en heure locale pour suivre les changements d'heure.
const SUNDAY=`date_trunc('week',now() AT TIME ZONE 'Europe/Paris')+interval '6 days 23 hours'`;
const NEXT_DRAW=`((${SUNDAY})+CASE WHEN (now() AT TIME ZONE 'Europe/Paris')>=(${SUNDAY}) THEN interval '7 days' ELSE interval '0' END) AT TIME ZONE 'Europe/Paris'`;
const COMMANDS=[
  new SlashCommandBuilder().setName('code').setDescription('Valider un code tombola annoncé pendant le live de Belva')
    .addStringOption(o=>o.setName('code').setDescription('Le code affiché dans le chat Rumble').setRequired(true).setMinLength(4).setMaxLength(8)),
  new SlashCommandBuilder().setName('tombola').setDescription('Tes tickets pour la tombola du dimanche'),
];
const NAMES=new Set(COMMANDS.map(c=>c.name));

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_tombola_codes(code text PRIMARY KEY,session_id text NOT NULL,bucket int NOT NULL,
    started_at timestamptz NOT NULL DEFAULT NOW(),created_at timestamptz NOT NULL DEFAULT NOW(),expires_at timestamptz NOT NULL,announced_at timestamptz,
    UNIQUE(session_id,bucket));
    CREATE TABLE IF NOT EXISTS belva_tombola_tickets(code text NOT NULL,discord_id text NOT NULL,draw_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),PRIMARY KEY(code,discord_id));
    CREATE INDEX IF NOT EXISTS belva_tombola_tickets_draw ON belva_tombola_tickets(draw_at);
    CREATE TABLE IF NOT EXISTS belva_tombola_draws(draw_at timestamptz PRIMARY KEY,winner_ids text[] NOT NULL DEFAULT '{}',tickets int NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT NOW())`).catch(e=>{ready=null;throw e;});
  return ready;
}

export async function registerBelvaTombolaCommands(client:Client){
  const guild=await client.guilds.fetch(GUILD_ID()).catch(()=>null);if(!guild)return;
  for(const c of COMMANDS)await guild.commands.create(c.toJSON());
}

const ts=(d:Date)=>`<t:${Math.floor(new Date(d).getTime()/1000)}:F>`;
const mine=async(pool:Pool,id:string)=>(await pool.query(`SELECT count(*)::int n,(${NEXT_DRAW}) draw_at FROM belva_tombola_tickets WHERE discord_id=$1 AND draw_at=(${NEXT_DRAW})`,[id])).rows[0] as {n:number;draw_at:Date};

export async function handleBelvaTombola(i:Interaction,pool?:Pool):Promise<boolean>{
  if(i.guildId!==GUILD_ID()||!i.isChatInputCommand()||!NAMES.has(i.commandName))return false;
  await i.deferReply({ephemeral:true});
  const code=i.commandName==='code'?i.options.getString('code',true):null;
  await i.editReply(await tombolaReply(pool,i.guild!,i.user.id,code));
  return true;
}

// Version texte (« /code K7QX » envoyé comme message sur mobile).
export async function handleBelvaTombolaMessage(message:Message,pool?:Pool):Promise<boolean>{
  const m=/^[/!](?:code\s+(\S{4,8})|(tombola|tickets))\s*$/i.exec(message.content.trim());
  if(!m||message.author.bot||message.guildId!==GUILD_ID()||!message.guild)return false;
  const content=await tombolaReply(pool,message.guild,message.author.id,m[1]??null);
  await message.reply({content,allowedMentions:{parse:[],repliedUser:false}});
  return true;
}

async function tombolaReply(pool:Pool|undefined,guild:Guild,userId:string,rawCode:string|null):Promise<string>{
  if(!pool)return 'Tombola indisponible pour le moment.';
  await schema(pool);
  const member=await guild.members.fetch(userId).catch(()=>null);
  const eligible=member?.roles.cache.has(BELVA_ROLES.membre)??false;
  const warn=eligible?'':'\n⚠️ Pour être tiré au sort, vérifie d’abord un compte casino dans un salon d’offre (#toutes-les-offres) : seuls les membres vérifiés peuvent gagner.';
  if(rawCode!==null){
    const code=rawCode.trim().toUpperCase();
    const ok=(await pool.query(`INSERT INTO belva_tombola_tickets(code,discord_id,draw_at)
      SELECT code,$2,(${NEXT_DRAW}) FROM belva_tombola_codes WHERE code=$1 AND bucket>0 AND announced_at IS NOT NULL AND expires_at>NOW()
      ON CONFLICT DO NOTHING RETURNING code`,[code,userId])).rowCount;
    const t=await mine(pool,userId);
    if(!ok){
      const known=(await pool.query(`SELECT 1 FROM belva_tombola_tickets WHERE code=$1 AND discord_id=$2`,[code,userId])).rowCount;
      return known?`Tu as déjà validé ce code. Tickets cette semaine : **${t.n}**.`:'Code inconnu ou expiré : un code est valable 10 minutes après son annonce dans le chat Rumble de Belva.';
    }
    return `🎟️ **+1 ticket !** Tu en as **${t.n}** pour le tirage du ${ts(t.draw_at)} (${WINNERS()} gagnants à ${PRIZE()}).${warn}`;
  }
  const t=await mine(pool,userId);
  return `🎟️ Tickets cette semaine : **${t.n}**\nTirage : ${ts(t.draw_at)} · ${WINNERS()} gagnants à ${PRIZE()}\nUn code est annoncé toutes les 40 minutes pendant le live de Belva sur Rumble : tape **/code** suivi du code ici.${warn}`;
}

// Tirage pondéré par le nombre de tickets, parmi les membres encore présents avec le rôle vérifié.
export function pickWinners(tickets:{discord_id:string;n:number}[],howMany:number,eligible:(id:string)=>boolean,rand=randomInt){
  const left=tickets.filter(t=>t.n>0&&eligible(t.discord_id));const out:string[]=[];
  while(left.length&&out.length<howMany){
    let r=rand(left.reduce((s,t)=>s+t.n,0));
    const k=left.findIndex(t=>(r-=t.n)<0);out.push(left[k].discord_id);left.splice(k,1);
  }
  return out;
}

async function drawDue(client:Client,pool:Pool){
  const due=(await pool.query(`SELECT DISTINCT t.draw_at FROM belva_tombola_tickets t LEFT JOIN belva_tombola_draws d ON d.draw_at=t.draw_at
    WHERE t.draw_at<=NOW() AND d.draw_at IS NULL ORDER BY 1`)).rows as {draw_at:Date}[];
  for(const {draw_at} of due){
    // La ligne de tirage est posée avant l'annonce : un redémarrage ne relance jamais un tirage.
    const claimed=(await pool.query(`INSERT INTO belva_tombola_draws(draw_at) VALUES($1) ON CONFLICT DO NOTHING RETURNING draw_at`,[draw_at])).rowCount;
    if(!claimed)continue;
    const tickets=(await pool.query(`SELECT discord_id,count(*)::int n FROM belva_tombola_tickets WHERE draw_at=$1 GROUP BY 1`,[draw_at])).rows as {discord_id:string;n:number}[];
    const guild=await client.guilds.fetch(GUILD_ID());
    const members=await guild.members.fetch({user:tickets.map(t=>t.discord_id)}).catch(()=>null);
    const winners=pickWinners(tickets,WINNERS(),id=>members?.get(id)?.roles.cache.has(BELVA_ROLES.membre)??false);
    const total=tickets.reduce((s,t)=>s+t.n,0);
    await pool.query(`UPDATE belva_tombola_draws SET winner_ids=$2,tickets=$3 WHERE draw_at=$1`,[draw_at,winners,total]);
    const channel=await client.channels.fetch(GIVEAWAY_CHANNEL).catch(()=>null) as TextChannel|null;
    await channel?.send({content:winners.length
      ?`🎟️ **Tombola du dimanche** · ${total} tickets en jeu\n🥳 ${winners.map(id=>`<@${id}>`).join(' et ')} : vous gagnez **${PRIZE()}** chacun ! Ouvrez un ticket pour le récupérer.\n-# Prochaine tombola : un code toutes les 40 minutes pendant le live de Belva, à taper avec /code. 18+`
      :`🎟️ Tombola du dimanche : aucun membre vérifié parmi les ${total} tickets, pas de gagnant cette semaine.`,allowedMentions:{users:winners}});
    const panel=await client.channels.fetch(PANEL_CHANNEL).catch(()=>null) as TextChannel|null;
    await panel?.send({content:`Tombola du ${ts(draw_at)} · ${total} tickets · gagnant(s) à payer (${PRIZE()} chacun) : ${winners.map(id=>`<@${id}>`).join(', ')||'aucun'}`,allowedMentions:{parse:[]}});
  }
}

export async function startBelvaTombola(client:Client,pool?:Pool){
  if(process.env.BELVA_TOMBOLA_ENABLED==='false'||!pool)return;
  await schema(pool);
  let busy=false;
  setInterval(()=>{
    if(busy)return;busy=true;
    void drawDue(client,pool).catch(e=>console.error('[nozebot] tombola Belva',e)).finally(()=>{busy=false;});
  },60_000).unref();
}
