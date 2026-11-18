import Anthropic from '@anthropic-ai/sdk';
import {ActionRowBuilder,ButtonBuilder,ButtonStyle,ChannelType,EmbedBuilder,PermissionFlagsBits,type Client,type Interaction,type TextChannel} from 'discord.js';
import type {Pool} from 'pg';

// Betportal ne transmet ni le pseudo ni le montant : on rapproche le screen de dépôt d'un membre (montant et heure lus par IA)
// des « premiers dépôts » reçus en postback par NivoraNet autour de cette heure. Le staff confirme le bon joueur d'un clic.
const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
const PATRON_ROLE='1482854912059511006';
const VIDEUR_ROLE='1483165106140352632';
const STAFF_LIST='📋︱liste-remboursements';
const P='belva:bp:';

export type ScreenRead={amount:number|null;currency:string|null;at:string|null};
// Heure lue sur le screen, prise en heure de Paris (« AAAA-MM-JJ HH:MM »).
export function parisToDate(local:string){
  const m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(local);if(!m)return null;
  const guess=Date.UTC(+m[1]!,+m[2]!-1,+m[3]!,+m[4]!,+m[5]!);
  const off=(t:number)=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Paris',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(t));
    const g=(k:string)=>Number(p.find(x=>x.type===k)!.value);return Date.UTC(g('year'),g('month')-1,g('day'),g('hour'),g('minute'))-t;};
  return new Date(guess-off(guess));
}

export async function readDepositScreen(image:Buffer,mediaType:string):Promise<ScreenRead|null>{
  if(!process.env.ANTHROPIC_API_KEY)return null;
  const media=(['image/png','image/jpeg','image/webp','image/gif'].includes(mediaType)?mediaType:'image/png') as 'image/png';
  const r=await new Anthropic().messages.create({
    model:'claude-opus-5-5',max_tokens:1024,output_config:{effort:'low'},
    messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:media,data:image.toString('base64')}},
      {type:'text',text:'Capture d’écran d’un dépôt sur un casino en ligne. Réponds uniquement avec un objet JSON : {"amount": montant du dépôt (nombre) ou null, "currency": devise (EUR, USD, USDT…) ou null, "at": date et heure du dépôt telles qu’affichées, au format "AAAA-MM-JJ HH:MM", ou null}. N’invente rien : null si ce n’est pas lisible.'},
    ]}],
  });
  const text=r.content.flatMap(b=>b.type==='text'?[b.text]:[]).join('');
  const json=/\{[\s\S]*\}/.exec(text)?.[0];if(!json)return null;
  try{const o=JSON.parse(json) as Partial<ScreenRead>;
    return {amount:typeof o.amount==='number'?o.amount:null,currency:typeof o.currency==='string'?o.currency:null,at:typeof o.at==='string'?o.at:null};}
  catch{return null;}
}

type Ftd={player_ref:string;received_at:string};
async function ftdsAround(center:Date,hours:number):Promise<Ftd[]>{
  const url=process.env.NIVORA_SUPABASE_URL,key=process.env.NIVORA_SUPABASE_KEY;if(!url||!key)return [];
  const from=new Date(center.getTime()-hours*3600e3).toISOString(),to=new Date(center.getTime()+hours*3600e3).toISOString();
  // Lecture seule : uniquement les postbacks « premier dépôt » de la fenêtre.
  const r=await fetch(`${url}/rest/v1/betportal_deliveries?select=player_ref,received_at&event=eq.ftd&received_at=gte.${encodeURIComponent(from)}&received_at=lte.${encodeURIComponent(to)}&order=received_at.asc`,
    {headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(10_000)});
  if(!r.ok)throw Error(`nivora ${r.status}`);
  return await r.json() as Ftd[];
}

let ready:Promise<unknown>|null=null;
function schema(pool:Pool){
  ready??=pool.query(`CREATE TABLE IF NOT EXISTS belva_betportal_links(player_ref text PRIMARY KEY,discord_id text NOT NULL,linked_by text NOT NULL,at timestamptz NOT NULL DEFAULT NOW())`).catch(e=>{ready=null;throw e;});
  return ready;
}
const fmt=(d:Date)=>new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);

// Appelé à l'ouverture d'un ticket Betportal avec capture : note pour le staff, jamais visible du membre.
export async function matchBetportalDeposit(client:Client,pool:Pool,o:{discordId:string;ticketChannelId:string;image:Buffer;mediaType:string;declared?:number}){
  await schema(pool);
  const read=await readDepositScreen(o.image,o.mediaType).catch(e=>{console.error('[nozebot] lecture screen Betportal',e?.message||e);return null;});
  const at=read?.at?parisToDate(read.at):null;
  const center=at??new Date();const window=at?3:72;
  const taken=new Set((await pool.query(`SELECT player_ref FROM belva_betportal_links`)).rows.map(r=>String(r.player_ref)));
  const ftds=(await ftdsAround(center,window).catch(e=>{console.error('[nozebot] postbacks Betportal',e?.message||e);return [] as Ftd[];}))
    .filter(f=>!taken.has(f.player_ref)).map(f=>({...f,gap:Math.abs(Date.parse(f.received_at)-center.getTime())})).sort((a,b)=>a.gap-b.gap).slice(0,4);
  // Note staff sur le serveur du ticket (Belva ou LeCasiNoze) : chacun sa liste des remboursements.
  const ticket=await client.channels.fetch(o.ticketChannelId).catch(()=>null);
  const guild=ticket&&'guild' in ticket?ticket.guild:await client.guilds.fetch(GUILD_ID());
  const list=(await guild.channels.fetch()).find(c=>c?.type===ChannelType.GuildText&&(c.name===STAFF_LIST||/liste-remboursements$/i.test([...c.name.normalize('NFKD')].filter(x=>/[a-z0-9-]/i.test(x)).join('')))) as TextChannel|undefined;if(!list)return;
  const lecture=!process.env.ANTHROPIC_API_KEY?'⚠️ Lecture IA désactivée (clé ANTHROPIC_API_KEY absente sur le bot)'
    :read?`💶 **${read.amount??'?'} ${read.currency??''}** · 🕒 **${read.at??'heure illisible'}**${o.declared?` · déclaré : ${o.declared} €`:''}`:'⚠️ Screen illisible par l’IA';
  const embed=new EmbedBuilder().setColor(0x1FF25E).setTitle('🔎 Rapprochement Betportal')
    .setDescription([`Ticket <#${o.ticketChannelId}> · membre <@${o.discordId}>`,'',`**Lecture du screen :** ${lecture}`,'',
      ftds.length?`**Premiers dépôts reçus ${at?'± 3 h autour':'ces 72 dernières heures'} (non attribués) :**\n${ftds.map(f=>`• \`${f.player_ref}\` · reçu ${fmt(new Date(f.received_at))} · écart ${Math.round(f.gap/60000)} min`).join('\n')}`
        :`Aucun premier dépôt Betportal non attribué ${at?'± 3 h autour de cette heure':'sur les 72 dernières heures'}.`,
      '','-# Betportal n’envoie pas le montant : il se vérifie dans le rapport Cellxpert si besoin. Le postback peut arriver quelques minutes après le dépôt.'].join('\n'));
  const buttons=ftds.length?[new ActionRowBuilder<ButtonBuilder>().addComponents(ftds.map(f=>new ButtonBuilder()
    .setCustomId(`${P}link:${f.player_ref}:${o.discordId}`).setStyle(ButtonStyle.Success).setLabel(`C’est lui : ${f.player_ref.replace('betportal-','')}`)))]:[];
  await list.send({embeds:[embed],components:buttons,allowedMentions:{parse:[]}});
}

export async function handleBetportalMatch(i:Interaction,pool?:Pool):Promise<boolean>{
  if(!i.isButton()||!i.customId.startsWith(P))return false;
  if(!pool||!i.inCachedGuild())return true;
  const m=i.member;
  if(!(m.roles.cache.has(PATRON_ROLE)||m.roles.cache.has(VIDEUR_ROLE)||m.roles.cache.has('1188939890344329379')||m.permissions.has(PermissionFlagsBits.Administrator))){await i.reply({ephemeral:true,content:'Réservé au staff.'});return true;}
  const [,,,ref,discordId]=i.customId.split(':');
  await schema(pool);
  const ok=(await pool.query(`INSERT INTO belva_betportal_links(player_ref,discord_id,linked_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`,[ref,discordId,i.user.id])).rowCount;
  await i.update({components:[]});
  await i.followUp({content:ok?`✅ \`${ref}\` attribué à <@${discordId}> par <@${i.user.id}>. Valide ensuite le compte dans le ticket.`:`\`${ref}\` était déjà attribué.`,allowedMentions:{parse:[]}});
  return true;
}
