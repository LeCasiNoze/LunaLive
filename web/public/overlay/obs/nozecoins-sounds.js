/* Owner-only OBS consumer. Never exposes an internal bot key or stores the owner token. */
(() => {
 const fragment=new URLSearchParams(location.hash.slice(1));
 const token=fragment.get('token')||'';
 history.replaceState(null,'',location.pathname+location.search);
 const panel=document.getElementById('panel'),status=document.getElementById('status'),controls=document.getElementById('controls');
 const toast=document.getElementById('toast'),label=document.getElementById('sound-name');
 const showControls=new URLSearchParams(location.search).get('control')==='1';
 let disposed=false,ready=false,heartbeatBusy=false,pollBusy=false,pendingAck=null,cancelPlayback=()=>{};
 const consumerId=crypto.randomUUID();
 function explain(text,error=false){status.textContent=text;if(showControls||error)panel.hidden=false;}
 async function post(action,body={}){
  const response=await fetch(`https://lunalive-api.onrender.com/me/nozecoins/soundboard/${action}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({consumerId,...body}),signal:AbortSignal.timeout(10000),credentials:'omit',cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok!==true){const error=new Error('soundboard_request_failed');error.code=typeof data.error==='string'?data.error:'network';error.status=response.status;throw error;}
  return data;
 }
 function report(error){
  ready=false;
  const messages={soundboard_disabled:'La soundboard n’est pas encore activée côté serveur.',soundboard_owner_required:'Cette source est réservée au propriétaire LeCasiNoze.',consumer_in_use:'Un autre lecteur OBS est déjà actif. Fermez le doublon.',unauthorized:'La session LunaLive a expiré. Reconfigurez la source.'};
  explain(messages[error.code]||'Lecteur temporairement indisponible. Les demandes expirées seront remboursées.',true);
  if(error.status===401||error.status===403)disposed=true;
 }
 async function heartbeat(){
  if(disposed||heartbeatBusy||showControls)return;
  if(document.hidden){ready=false;cancelPlayback();return;}
  heartbeatBusy=true;
  try{const data=await post('heartbeat');ready=data.ready===true;
   explain(ready?'Lecteur prêt · live personnel vérifié.':'En attente d’un live personnel et de l’activation du propriétaire.');
   if(!ready)cancelPlayback();
  }catch(error){cancelPlayback();report(error);}finally{heartbeatBusy=false;}
 }
 async function acknowledge(){
  if(!pendingAck)return true;
  try{await post('ack',pendingAck);pendingAck=null;return true;}
  catch(error){report(error);return false;}
 }
 function play(sound){
  return new Promise(resolve=>{
   const audio=new Audio();let finished=false,cutoff;
   const loadTimeout=setTimeout(()=>finish(false),10000);
   function finish(played){if(finished)return;finished=true;clearTimeout(loadTimeout);clearTimeout(cutoff);audio.onended=null;audio.onerror=null;audio.onplaying=null;audio.pause();audio.removeAttribute('src');audio.load();toast.hidden=true;cancelPlayback=()=>{};resolve(played);}
   cancelPlayback=()=>finish(false);
   // Both values come exclusively from the server-approved catalogue.
   audio.volume=Math.max(0,Math.min(0.7,Number(sound.volume)||0));
   audio.onplaying=()=>{audio.onplaying=null;clearTimeout(loadTimeout);label.textContent=sound.label;toast.hidden=false;cutoff=setTimeout(()=>finish(false),Math.min(8000,sound.durationMs)+350);};
   audio.onended=()=>finish(true);audio.onerror=()=>finish(false);
   audio.src=sound.audioUrl;audio.play().catch(()=>finish(false));
  });
 }
 async function poll(){
  if(disposed||pollBusy||showControls)return;
  pollBusy=true;
  try{
   if(pendingAck&&!(await acknowledge()))return;
   if(!ready||document.hidden)return;
   const next=await post('next');if(!next.request)return;
   const request=next.request;
   const played=await play(request.sound);
   pendingAck={requestId:request.requestId,played};await acknowledge();
  }catch(error){report(error);}finally{pollBusy=false;}
 }
 document.getElementById('enable').addEventListener('click',async()=>{try{await post('control',{enabled:true});explain('Activation demandée. Le lecteur OBS distinct doit être ouvert dans la scène du live.');}catch(error){report(error);}});
 document.getElementById('stop').addEventListener('click',async()=>{ready=false;cancelPlayback();try{await post('control',{enabled:false});explain('Lecture coupée. Les demandes en attente sont remboursées.');}catch(error){report(error);}});
 if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)||token.length>8192){explain('Configuration requise : jeton LunaLive du propriétaire absent. Aucun son ne peut être débité depuis cette page.',true);return;}
 controls.hidden=!showControls;panel.hidden=!showControls;
 if(showControls){explain('Panneau propriétaire. Cette page ne joue pas de son et ne remplace pas le lecteur OBS.');return;}
 void heartbeat();const beatTimer=setInterval(heartbeat,5000),pollTimer=setInterval(poll,1000);
 document.addEventListener('visibilitychange',()=>{if(document.hidden){ready=false;cancelPlayback();}else void heartbeat();});
 addEventListener('pagehide',()=>{disposed=true;ready=false;cancelPlayback();clearInterval(beatTimer);clearInterval(pollTimer);});
})();
