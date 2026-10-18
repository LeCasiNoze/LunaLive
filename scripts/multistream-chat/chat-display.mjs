// Only verified bot replies pass through here. Never translate a viewer's text.
export function compactBotReply(value) {
  let text=String(value||'').trim();
  if(!text)return null;
  // These prompts refer to LunaLive-only controls, not commands on Kick/Twitch.
  if(/\[RAIN_OPEN\]/.test(text)||/^Rain (?:en cours|terminée)/.test(text.replace(/^[^\p{L}\p{N}]*/u,'')))return null;
  const discord=text.match(/https?:\/\/(?:www\.)?(?:discord\.gg\/|discord\.com\/invite\/)[A-Za-z0-9-]+/i);
  if(discord)return 'Discord: '+discord[0];
  if(/!call/.test(text)&&/!discord/.test(text)&&(/Guide\s*:|Commandes\s*:/.test(text)))return 'Commands: !call game · !listec · !discord · !site';
  text=text
    .replace(/^🎰 Call ajouté\s*:\s*/u,'Added: ')
    .replace(/ — dans /g,' · ETA ')
    .replace(/^📋 Calls:\s*aucun call en file\.?/u,'Queue empty.')
    .replace(/^📋 Calls:/u,'Queue:')
    .replace(/Machine introuvable\s*:\s*Essaie un nom plus précis\./g,'Game not found. Use its full name.')
    .replace(/Calls désactivés\s*:\s*Le streamer a désactivé les calls pour le moment\./g,'Calls are closed.')
    .replace(/Déjà en file\s*:\s*Cette machine est déjà call\./g,'Already queued.')
    .replace(/Limite atteinte\s*:\s*Tu as atteint ta limite de calls\./g,'Call limit reached.')
    .replace(/Call refusé\s*:\s*Ex: !call Fruit Party/g,'Use: !call game')
    .replace(/tu as déjà (\d+\/\d+) calls en file\./g,'$1 calls pending.')
    .replace(/Call refusé : le provider de « (.+?) » \((.+?)\) n’est pas autorisé pendant cette session Automod\./g,'$1 ($2): provider unavailable in this session.')
    .replace(/Commande désactivée/g,'Command disabled.');
  return Array.from(text).slice(0,450).join('');
}
