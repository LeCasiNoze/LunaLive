const channels={kick:'24912362',twitch:'535777475'};
export function isMusicCommand(text){return /^!(?:music|musique)(?:\s|$)/i.test(String(text||'').trim());}
export function externalMusicMessage(event){
 if(!event||!channels[event.platform]||event.channelId!==channels[event.platform])throw Error('invalid_music_channel');
 for(const key of ['userId','messageId'])if(typeof event[key]!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(event[key]))throw Error('invalid_music_identity');
 if(typeof event.text!=='string'||event.text.length>2000||!isMusicCommand(event.text))throw Error('invalid_music_command');
 const username=String(event.username||'').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,80);
 if(!username)throw Error('invalid_music_username');
 return {id:`external:${event.platform}:${event.channelId}:${event.messageId}`,actorId:`${event.platform}:${event.userId}`,username,body:event.text,external:true};
}
export function kickViewerText(row,source){
 // Rumble viewers have local user_id=0. That does not make them bot messages.
 if(row.external_source==='rumble')return `${row.username} : ${row.body}`;
 if(row.external_source==='twitch')return row.body.startsWith('[Twitch] ')?row.body:`[Twitch] ${row.username} : ${row.body}`;
 return Number(row.user_id)>0?`[${source}] ${row.username} : ${row.body}`:row.body;
}
export async function requestExternalMusic(fetchImpl,event){
 const base='http://127.0.0.1:4324';
 const state=await fetchImpl(base+'/api/status',{signal:AbortSignal.timeout(5000)});
 if(!state.ok)throw Error('music_unavailable');
 const s=await state.json();if(!s.nonce)throw Error('music_unavailable');
 const response=await fetchImpl(base+'/api/external-request',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'x-music-control':s.nonce},body:JSON.stringify(event),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('music_request_unavailable');
 const result=await response.json();if(result.ok!==true)throw Error(result.uncertain?'music_request_uncertain':'music_request_unavailable');
 return (result.replies||[]).filter(t=>typeof t==='string'&&t.length<=500);
}
