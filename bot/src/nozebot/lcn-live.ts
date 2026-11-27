import {MessageFlags} from 'discord.js';
import type {LiveAlertConfig,LiveSnapshot} from './live-alerts.js';

// Alerte live du Discord LeCasiNoze, même carte que celle de Belva (belva-live.ts).
const OFFERS={rainbet:'1569126449670004776',tickets:'1544429389415063604'};

export function buildLcnLiveMessage(s:LiveSnapshot,ping:boolean,config:Pick<LiveAlertConfig,'guildId'|'roleId'|'lunaLiveUrl'|'rumbleUrl'>){
  const T=(content:string)=>({type:10,content});
  const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
  const channel=(id:string)=>`https://discord.com/channels/${config.guildId}/${id}`;
  const started=s.startedAt?`<t:${Math.floor(s.startedAt.getTime()/1000)}:R>`:'à l’instant';
  const header=[T(`-# <@&${config.roleId}>`),T(`# LeCasiNoze est en live !\n**${s.title}**\n-# En direct · lancé ${started}`)];
  return {flags:MessageFlags.IsComponentsV2 as const,allowedMentions:ping?{roles:[config.roleId]}:{parse:[] as never[]},components:[{type:17,accent_color:0xff2d55,components:[
    ...(s.avatarUrl?[{type:9,components:header,accessory:{type:11,media:{url:s.avatarUrl},description:'LeCasiNoze'}}]:header),
    ...(s.thumbnailUrl?[{type:12,items:[{media:{url:s.thumbnailUrl},description:`Aperçu du live : ${s.title}`}]}]:[]),
    {type:14,divider:true,spacing:2},
    T('### 🎰 Pendant le live\n> 💸 **Jusqu’à 30 € remboursés** sur ton premier dépôt Celsius ou Betportal avec nos liens\n> 🌧️ **Rainbet**, notre partenaire principal : toutes les infos dans son salon\n> 🎫 Un ticket suffit pour demander ton remboursement'),
    {type:1,components:[link('Regarder sur Rumble','🟢',config.rumbleUrl),link('LunaLive','🌙',config.lunaLiveUrl)]},
    {type:1,components:[link('Rainbet','🌧️',channel(OFFERS.rainbet)),link('Ouvrir un ticket','🎫',channel(OFFERS.tickets))]},
    {type:14,divider:false,spacing:1},
    T('-# 🔞 18+ · Les jeux d’argent comportent des risques : endettement, isolement, dépendance. Joueurs Info Service : 09 74 75 13 13.'),
  ]}] as never[]};
}
