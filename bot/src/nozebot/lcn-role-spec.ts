// Rôles du Discord LeCasiNoze : mêmes règles que chez Belva (mêmes clés), noms et couleurs dans l'univers LunaLive
// (titres de palier et couleurs de rareté). Validé par Lucas le 18/11/2026.
export type LcnRole={key:string;id?:string;name:string;color:number;hoist:boolean;group:string};
export const LCN_ROLES:LcnRole[]=[
  {key:'admin',id:'1188940226358415443',name:'🛡️ Admin',color:0xE63946,hoist:true,group:'Staff'},
  {key:'modo',id:'1188939890344329379',name:'⚔️ Modérateur',color:0x4CC9F0,hoist:true,group:'Staff'},
  {key:'roi',id:'1268622387398840442',name:'👑 Roi de la Slot',color:0xF4C95D,hoist:true,group:'Unique'},
  {key:'cnz',id:'1281868087330869260',name:'👃 CNZ TEAM',color:0x5B6CFF,hoist:true,group:'Team'},
  {key:'obsidienne',name:'🌟 Légende Nasale',color:0xF8FAFC,hoist:true,group:'Grades'},
  {key:'diamant',name:'🙏 Apôtre du Noze',color:0xFBBF24,hoist:true,group:'Grades'},
  {key:'saphir',name:'🩸 Saigneur de Slot',color:0xA855F7,hoist:true,group:'Grades'},
  {key:'rubis',name:'👃 Flaireur de Call',color:0xC4B5FD,hoist:true,group:'Grades'},
  {key:'or',name:'🌾 Farm Hunter',color:0x60A5FA,hoist:true,group:'Grades'},
  {key:'fer',name:'🎰 Apprenti Spinner',color:0x34D399,hoist:true,group:'Grades'},
  {key:'bronze',name:'🪙 Gratteur de Tips',color:0x94A3B8,hoist:true,group:'Grades'},
  {key:'carreOr',name:'🍾 Table VIP',color:0xF6E3B4,hoist:true,group:'Paliers'},
  {key:'membre',name:'✅ Joueur Vérifié',color:0x2FBF71,hoist:true,group:'Paliers'},
  {key:'rainbet',id:'1569126447577038908',name:'🌧️ Rainbet',color:0x3D8BFF,hoist:false,group:'Casinos'},
  {key:'betportal',name:'🟢 Betportal',color:0x1FF25E,hoist:false,group:'Casinos'},
  {key:'celsius',name:'🧡 Celsius',color:0xFF6A3D,hoist:false,group:'Casinos'},
  {key:'habitue',id:'1559957253019279390',name:'🌒 Habitué',color:0xA5B4FC,hoist:false,group:'Accueil'},
  {key:'invite',id:'1544429206400802896',name:'🌑 Nouveau-Né',color:0x8B93A7,hoist:false,group:'Accueil'},
  {key:'notifLive',id:'1188926242519523328',name:'🔴 Notif Lives',color:0xFF4D4D,hoist:false,group:'Notifications'},
  {key:'notifGiveaways',id:'1188926393946484783',name:'🎁 Notif Giveaways',color:0xFF8FCB,hoist:false,group:'Notifications'},
  {key:'notifOffres',name:'🔥 Notif Offres',color:0x7DF9C8,hoist:false,group:'Notifications'},
  {key:'notifYoutube',id:'1188926088852799578',name:'▶️ Notif YouTube',color:0xFF1744,hoist:false,group:'Notifications'},
  {key:'notifInsta',id:'1217875557631393923',name:'📸 Notif Instagram',color:0xD946EF,hoist:false,group:'Notifications'},
];
export const lcnRole=(key:string)=>LCN_ROLES.find(r=>r.key===key)!;
