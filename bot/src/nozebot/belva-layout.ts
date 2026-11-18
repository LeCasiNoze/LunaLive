// Mise en page commune des grandes cartes du Discord de Belva (pensée téléphone) :
// une étape par bloc, son bouton juste en dessous, de l'air entre les blocs.
export const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
export const T=(content:string)=>({type:10,content});
export const GAP={type:14,divider:false,spacing:2};
export const LINE={type:14,divider:true,spacing:2};
export const chUrl=(id?:string,guild=GUILD_ID())=>`https://discord.com/channels/${guild}${id?'/'+id:''}`;
// style 1 bleu, 2 gris, 3 vert, 4 rouge ; les boutons lien (style 5) restent gris, Discord ne les colore pas.
export const btn=(label:string,emoji:string,style:1|2|3|4,custom_id:string)=>({type:2,style,label,emoji:{name:emoji},custom_id});
export const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
// Bouton vers un salon ; absent si le salon n'existe pas sur ce serveur.
export const chLink=(label:string,emoji:string,id?:string,guild?:string)=>id?link(label,emoji,chUrl(id,guild)):null;
export const step=(title:string,body:string,list:(object|null)[]=[])=>{const buttons=list.filter(Boolean);
  return [T(`### ${title}\n${body}`),...(buttons.length?[{type:1,components:buttons}]:[])];};
export const FOOT=T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.');

// Emojis de l'application (utilisables sur tous les serveurs du bot) : logos des casinos et chevrons animés.
export const EMO={rainbet:'1572662103540502700',betportal:'1572665147464482976',celsius:'1572662106359205950',hazcasino:'1572662107269365821',velobet:'1572662108330659850'} as Record<string,string>;
const CHEV_RIGHT={id:'1572665148722909334',name:'chev_right',animated:true},CHEV_LEFT={id:'1572665150018949270',name:'chev_left',animated:true};
export const logo=(casino:string)=>EMO[casino]?`<:${casino}:${EMO[casino]}>`:'🎰';
export const logoEmoji=(casino:string)=>EMO[casino]?{id:EMO[casino],name:casino}:{name:'🎰'};
// Couleur du bouton d'inscription par casino (Discord : bleu, vert ou rouge).
const COLOR:Record<string,1|3|4>={rainbet:1,betportal:3,celsius:4,hazcasino:1,velobet:3};
export const SIGNUP_PREFIX='belva:go:';
// Inscription mise en avant : titre, puis le bouton en couleur entre deux chevrons animés qui pointent vers lui.
// Un bouton lien ne peut pas être coloré : le bouton coloré répond en privé avec le lien (belva-signup.ts).
export const signup=(casino:string,label:string,body:string)=>[
  T(`## ${logo(casino)} Inscris-toi ici`),T(body),
  {type:1,components:[{type:2,style:2,emoji:CHEV_RIGHT,custom_id:'belva:deco:1',disabled:true},
    {type:2,style:COLOR[casino]??3,label,emoji:logoEmoji(casino),custom_id:SIGNUP_PREFIX+casino},
    {type:2,style:2,emoji:CHEV_LEFT,custom_id:'belva:deco:2',disabled:true}]},
];
