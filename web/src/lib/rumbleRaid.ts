export type RaidTarget={url:string;channel:string;viewers:number|null;title:string;videoId:string};
export function raidCommand(text:string):{query:string}|null{
 const match=text.trim().match(/^\/raid(?:\s+(.*))?$/i);
 return match?{query:match[1]?.trim()||''}:null;
}
export function raidQueryUrl(query:string):string|null{
 if(!/^https:\/\/(?:www\.)?rumble\.com\/v[a-z0-9]{5,20}(?:-[^/?#\s]*)?\.html(?:[?#]\S*)?$/i.test(query))return null;
 try{return 'https://rumble.com'+new URL(query).pathname;}catch{return null;}
}
export function raidError(code:string):string{
 const messages:Record<string,string>={forbidden:'Réservé au streamer et aux modérateurs.',source_offline:'Aucun live Rumble actif.',source_changed:'Le live a changé. Rouvre le sélecteur.',
  raid_busy:'Un raid est déjà en préparation.',raid_uncertain:'Résultat non confirmé. Vérifie le chat Rumble avant de réessayer.',raid_cooldown:'Un raid a déjà été lancé récemment.',
  raid_refused:'Rumble refuse ce raid : chaîne indisponible, raids désactivés ou délai en cours.',rumble_permission:'Le compte Rumble du bot doit être modérateur de ta chaîne.',
  session_unavailable:'La connexion du bot à Rumble est à rétablir.',raid_target_unconfirmed:'Rumble n’a pas confirmé cette destination.',invalid_target:'Choisis un direct Rumble valide.'};
 return messages[code]||'Rumble est indisponible. Réessaie dans un instant.';
}
