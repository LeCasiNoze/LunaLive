// Mise en page commune des grandes cartes du Discord de Belva (pensée téléphone) :
// une étape par bloc, son bouton juste en dessous, de l'air entre les blocs.
export const GUILD_ID=()=>process.env.BELVA_GUILD_ID?.trim()||'1429525570965737668';
export const T=(content:string)=>({type:10,content});
export const GAP={type:14,divider:false,spacing:2};
export const LINE={type:14,divider:true,spacing:2};
export const chUrl=(id?:string)=>`https://discord.com/channels/${GUILD_ID()}${id?'/'+id:''}`;
// style 1 bleu, 2 gris, 3 vert, 4 rouge ; les boutons lien (style 5) restent gris, Discord ne les colore pas.
export const btn=(label:string,emoji:string,style:1|2|3|4,custom_id:string)=>({type:2,style,label,emoji:{name:emoji},custom_id});
export const link=(label:string,emoji:string,url:string)=>({type:2,style:5,label,emoji:{name:emoji},url});
export const step=(title:string,body:string,buttons:object[]=[])=>[T(`### ${title}\n${body}`),...(buttons.length?[{type:1,components:buttons}]:[])];
export const FOOT=T('-# 🔞 18+ · Joue de façon responsable. Joueurs Info Service : 09 74 75 13 13.');
