import {PermissionFlagsBits as P,type Guild} from 'discord.js';

// Refonte des rôles du Discord de Belva, appliquée par le bot quand le staff valide la palette (salon validation-design).
// Ordre = ordre d'affichage, du haut vers le bas, juste sous le rôle « Bot » de NozeBot.
// La couleur affichée d'un membre est celle de son rôle coloré le plus haut : staff > grade > palier > casino > notifs.
export type RoleSpec={key:string;id?:string;name:string;color:number;shade:string;hoist:boolean;perms:bigint|null;group:string;auto:string};


export const ROLE_SPEC:RoleSpec[]=[
  {key:'videur',id:'1483165106140352632',name:'🛡️ Videur',color:0xE8475F,shade:'Cordon de velours',hoist:true,perms:P.Administrator,group:'Staff',auto:'À la main (admins : LeCasiNoze, Ricou)'}, // Videur = admins (demande de Lucas, 17/11/2026)
  {key:'blva',id:'1483154059534794883',name:'🔱 BLVA',color:0xF9F871,shade:'Néon citron',hoist:true,perms:0n,group:'Team BLVA',auto:'Automatique · pseudo Rumble « BLVA… » + compte lié'},
  {key:'obsidienne',name:'🖤 Obsidienne',color:0x9B7BD4,shade:'Reflet d’obsidienne',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (dépôt vérifié requis)'},
  {key:'diamant',name:'💎 Diamant',color:0xBFF4FF,shade:'Éclat de diamant',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (dépôt vérifié requis)'},
  {key:'saphir',name:'💠 Saphir',color:0x4C7DFF,shade:'Saphir de Ceylan',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (dépôt vérifié requis)'},
  {key:'rubis',name:'♦️ Rubis',color:0xE8175D,shade:'Rubis sang-de-pigeon',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (dépôt vérifié requis)'},
  {key:'or',name:'🥇 Or',color:0xF3C14B,shade:'Or 24 carats',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP'},
  {key:'fer',name:'⚙️ Fer',color:0xA7B4C2,shade:'Fer forgé',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (anciens Flambeur)'},
  {key:'bronze',name:'🥉 Bronze',color:0xD08B5B,shade:'Bronze patiné',hoist:true,perms:0n,group:'Grades',auto:'Automatique · XP (anciens Habitué)'},
  {key:'carreOr',id:'1571169943981133894',name:'🍾 Carré Or',color:0xF6E3B4,shade:'Champagne brut',hoist:true,perms:0n,group:'Paliers',auto:'Automatique · dépôt remboursé ou offert payé'},
  {key:'membre',id:'1571169945687949472',name:'🃏 Membre du Club',color:0x2FBF71,shade:'Feutre de table',hoist:true,perms:0n,group:'Paliers',auto:'Automatique · compte casino vérifié'},
  {key:'booster',id:'1483117845851410452',name:'🚀 Booster',color:0xFF73FA,shade:'Rose turbo',hoist:false,perms:0n,group:'Soutiens',auto:'À la main (boost du serveur)'},
  {key:'hazcasino',id:'1571169951102931038',name:'💜 HazCasino',color:0xB57BFF,shade:'Améthyste Haz',hoist:false,perms:0n,group:'Casinos',auto:'Automatique · compte Haz vérifié'},
  {key:'velobet',id:'1571169952436715631',name:'💚 VeloBet',color:0x8BE800,shade:'Trèfle VeloBet',hoist:false,perms:0n,group:'Casinos',auto:'Automatique · compte VeloBet vérifié'},
  {key:'celsius',id:'1571169954412101664',name:'🧡 Celsius',color:0xFF6A3D,shade:'Braise Celsius',hoist:false,perms:0n,group:'Casinos',auto:'Automatique · compte Celsius vérifié'},
  {key:'betportal',id:'1571974642480980059',name:'🟢 Betportal',color:0x1FF25E,shade:'Vert portail',hoist:false,perms:0n,group:'Casinos',auto:'Automatique · compte Betportal vérifié'},
  {key:'rainbet',id:'1571169955616002059',name:'🌧️ Rainbet',color:0x3D8BFF,shade:'Averse électrique',hoist:false,perms:0n,group:'Casinos',auto:'Automatique · compte Rainbet vérifié (code NIVORANET)'},
  {key:'habitue',name:'🌙 Habitué',color:0x8AB4F8,shade:'Lune d’argent',hoist:false,perms:0n,group:'Accueil',auto:'Automatique · règlement accepté + Rumble lié'},
  {key:'invite',id:'1482854045210120343',name:'🎟️ Invité',color:0xB9A88F,shade:'Ticket kraft',hoist:false,perms:0n,group:'Accueil',auto:'Automatique · à l’arrivée'},
  {key:'notifLive',id:'1571152748030722179',name:'🔴 Notif Live',color:0xFF4D4D,shade:'Rouge On Air',hoist:false,perms:0n,group:'Notifications',auto:'Au choix · salon notifications'},
  {key:'notifGiveaways',id:'1571152748970385530',name:'🎁 Notif Giveaways',color:0xFF8FCB,shade:'Ruban rose',hoist:false,perms:0n,group:'Notifications',auto:'Au choix · salon notifications'},
  {key:'notifOffres',id:'1571152750304301117',name:'🔥 Notif Offres',color:0x7DF9C8,shade:'Menthe promo',hoist:false,perms:0n,group:'Notifications',auto:'Au choix · salon notifications'},
];
// Hors de portée du bot (au-dessus de son rôle) : proposés, à appliquer à la main ou en remontant le rôle « Bot ».
export const MANUAL_SPEC=[
  {id:'1482854912059511006',name:'👑 Patron',color:0x19D3D3,shade:'Cyan Belva'},
];
// Anciens rôles de niveaux MEE6 : membres migrés vers un grade, puis rôle supprimé.
export const RETIRED=[
  {id:'1483153601986691112',name:'🥂 Habitué',to:'bronze'},
  {id:'1483153695435784323',name:'🎲 Flambeur',to:'fer'},
  {id:'1483153786737524919',name:'♠️ As',to:null},
  {id:'1483153900398841908',name:'💎 High Roller',to:null},
];
export const GRADE_KEYS=['bronze','fer','or','rubis','saphir','diamant','obsidienne'] as const;
export const hex=(n:number)=>'#'+n.toString(16).toUpperCase().padStart(6,'0');

export async function gradeRoleId(guild:Guild,key:typeof GRADE_KEYS[number]){
  const spec=ROLE_SPEC.find(r=>r.key===key)!;
  return (await guild.roles.fetch()).find(r=>r.name===spec.name)?.id??null;
}

export async function applyRoleSpec(guild:Guild):Promise<string[]>{
  const report:string[]=[];
  const roles=await guild.roles.fetch();
  // Les positions bougent à chaque création de rôle : on compare toujours au rôle du bot en direct.
  const me=await guild.members.fetchMe();
  const below=(r:{position:number})=>me.roles.highest.comparePositionTo(r as never)>0;
  const ids:Record<string,string>={};
  for(const s of ROLE_SPEC){
    const found=(s.id?roles.get(s.id):undefined)??roles.find(r=>r.name===s.name);
    const data={name:s.name,colors:{primaryColor:s.color},hoist:s.hoist,...(s.perms===null?{}:{permissions:s.perms}),reason:'Refonte des rôles validée'};
    try{
      if(found){if(!below(found)){report.push(`⚠️ ${s.name} : au-dessus du bot, non modifié`);continue;}
        await found.edit(data);ids[s.key]=found.id;}
      else{const r=await guild.roles.create(data);ids[s.key]=r.id;report.push(`➕ ${s.name} créé`);}
    }catch(e){report.push(`❌ ${s.name} : ${(e as Error).message}`);}
  }
  // Positions : bloc collé sous le rôle du bot, dans l'ordre de la spec.
  const ordered=ROLE_SPEC.map(s=>ids[s.key]).filter(Boolean);
  try{const top=(await guild.roles.fetch(me.roles.highest.id,{force:true}))!.position;
    await guild.roles.setPositions(ordered.map((id,i)=>({role:id,position:top-1-i})));}
  catch(e){report.push(`⚠️ Ordre des rôles : ${(e as Error).message}`);}
  const members=await guild.members.fetch();
  for(const old of RETIRED){
    const role=roles.get(old.id);if(!role)continue;
    const target=old.to?ids[old.to]:null;let moved=0;
    if(old.to&&!target){report.push(`⚠️ ${old.name} gardé : le grade cible n’a pas pu être créé`);continue;}
    for(const m of members.filter(m=>m.roles.cache.has(old.id)).values()){if(target){await m.roles.add(target,'Grade remplaçant '+old.name).catch(()=>undefined);moved++;}}
    await role.delete('Remplacé par les grades').then(()=>report.push(`🗑️ ${old.name} supprimé${moved?` (${moved} membre${moved>1?'s':''} → ${ROLE_SPEC.find(s=>s.key===old.to)?.name})`:''}`))
      .catch(e=>report.push(`❌ ${old.name} : ${(e as Error).message}`));
  }
  for(const m of MANUAL_SPEC){const r=roles.get(m.id);
    if(r&&below(r))await r.edit({name:m.name,colors:{primaryColor:m.color}}).then(()=>report.push(`✅ ${m.name}`)).catch(()=>report.push(`⚠️ ${m.name} : à faire à la main (${hex(m.color)})`));
    else report.push(`⚠️ ${m.name} : au-dessus du bot, à faire à la main → couleur ${hex(m.color)}`);}
  report.unshift(`✅ ${Object.keys(ids).length} rôles mis à jour`);
  return report;
}
