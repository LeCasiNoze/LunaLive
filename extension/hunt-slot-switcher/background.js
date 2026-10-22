importScripts("core.js");
const rules=LunaSlotRules;
let running=null;
const versions=new Map();
const key=id=>"huntSource:"+id;
const version=id=>versions.get(id)||0;
async function source(id){return (await chrome.storage.session.get(key(id)))[key(id)];}
const samePage=(a,b)=>{try{const x=new URL(a),y=new URL(b);return x.origin===y.origin && x.pathname.replace(/\/$/,"")===y.pathname.replace(/\/$/,"");}catch{return false;}};
async function prepareShuffle(job,session,slot){
  if(!job.expectedUrl)throw Error("Recharge l’extension et l’onglet Shuffle pour préparer la devise.");
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    const current=await source(job.source);
    if(job.cancelled || !current || current.generation!==session.generation)throw Error("Recherche annulée.");
    const tab=await chrome.tabs.get(job.target);
    if(rules.casino(tab.url)!=="Shuffle")throw Error("L’onglet casino a changé.");
    if(samePage(tab.url,job.expectedUrl)){
      const response=await chrome.tabs.sendMessage(job.target,{type:"prepare-shuffle",slot,expectedUrl:job.expectedUrl,playMode:"real"}).catch(()=>null);
      if(response?.ok)return;
      if(response && !response.retry)throw Error(response.error || "Préparation Shuffle non confirmée.");
    }else if(!samePage(tab.url,job.originalUrl) && tab.status!=="loading")throw Error("La machine a changé pendant la préparation.");
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  throw Error("Chargement Shuffle non confirmé. Vérifie la devise et le plein écran.");
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  (async()=>{
    if(m?.type==="game-selected"){
      const job=running;
      if(!job || job.cancelled || sender.frameId!==0 || sender.tab?.id!==job.target || job.casino!=="Shuffle" || m.callId!==job.callId)throw Error("Sélection non autorisée.");
      const target=new URL(m.url),origin=new URL(sender.url);
      if(target.origin!==origin.origin || rules.casino(target.href)!=="Shuffle" || !/\/games\//i.test(target.pathname))throw Error("Destination Shuffle invalide.");
      if(job.expectedUrl && job.expectedUrl!==target.href)throw Error("Destination déjà fixée.");
      job.expectedUrl=target.href;return {ok:true};
    }
    if(m?.type==="bind" && !sender.tab) {
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!rules.casino(tab?.url))throw Error("Ouvre d’abord un onglet Shuffle ou Celsius.");
      await chrome.storage.session.set({casinoTab:tab.id});
      return {ok:true,message:rules.casino(tab.url)+" sélectionné."};
    }
    if(!sender.tab || !rules.luna(sender.url) || sender.frameId!==0)throw Error("Page non autorisée.");
    const id=sender.tab.id;
    if(m?.type==="ping")return {ok:true,message:"Extension connectée."};
    if(m?.type==="disable"){
      versions.set(id,version(id)+1);
      if(running?.source===id) {
        running.cancelled=true;
        if(Number.isInteger(running.target))await chrome.tabs.sendMessage(running.target,{type:"cancel"}).catch(()=>{});
      }
      await chrome.storage.session.remove(key(id));
      return {ok:true,message:"Changement automatique désactivé."};
    }
    if(m?.type==="enable"){
      const generation=version(id)+1;versions.set(id,generation);
      const bound=(await chrome.storage.session.get("casinoTab")).casinoTab;
      const tab=rules.chooseTab(await chrome.tabs.query({}),bound);
      const probe=await chrome.tabs.sendMessage(tab.id,{type:"probe"}).catch(()=>null);
      if(!probe?.ok)throw Error("Recharge l’onglet casino après installation de l’extension.");
      if(version(id)!==generation)throw Error("Activation annulée.");
      const session={target:tab.id,casino:rules.casino(tab.url),seen:[],generation};
      await chrome.storage.session.set({[key(id)]:session});
      if(version(id)!==generation){await chrome.storage.session.remove(key(id));throw Error("Activation annulée.");}
      return {ok:true,message:session.casino+" prêt."};
    }
    if(m?.type!=="open" || !rules.validSlot(m.slot))throw Error("Demande invalide.");
    // Reserve before the first await: two rapid messages cannot start two jobs.
    if(running)throw Error("Une recherche est déjà en cours.");
    const job={source:id,target:null,cancelled:false,casino:null,callId:m.slot.callId,expectedUrl:null,originalUrl:null};running=job;
    try{
      const session=await source(id);
      if(!session)throw Error("Active le changement automatique.");
      job.target=session.target;
      const tab=await chrome.tabs.get(session.target);
      job.casino=session.casino;job.originalUrl=tab.url;
      if(rules.casino(tab.url)!==session.casino)throw Error("L’onglet casino a changé. Réactive l’option.");
      if(session.seen.includes(m.slot.callId))return {ok:true,message:"Cette machine a déjà été demandée."};
      const current=await source(id);
      if(job.cancelled || !current || current.generation!==session.generation)throw Error("Recherche annulée.");
      const result=await chrome.tabs.sendMessage(session.target,{type:"open",slot:m.slot}).catch(error=>{
        // The old content script may disappear after its exact card was acknowledged.
        if(job.expectedUrl)return {ok:true};throw error;
      });
      if(job.cancelled)throw Error("Recherche annulée.");
      if(!result?.ok)throw Error(result?.error || "Recherche impossible. Recharge l’onglet casino.");
      if(session.casino==="Shuffle")await prepareShuffle(job,session,m.slot);
      if(job.cancelled)throw Error("Recherche annulée.");
      // Persist dedupe across a sleeping/restarted service worker.
      session.seen=[...session.seen.slice(-199),m.slot.callId];
      const latest=await source(id);
      if(job.cancelled || !latest || latest.generation!==session.generation)throw Error("Recherche annulée.");
      await chrome.storage.session.set({[key(id)]:session});
      return {ok:true,message:session.casino==="Shuffle"?"ARS confirmé · jeu agrandi : "+m.slot.name:"Ouverture demandée : "+m.slot.name};
    }finally{if(running===job)running=null;}
  })().then(reply).catch(e=>reply({ok:false,error:e.message || "Extension indisponible."}));
  return true;
});
chrome.tabs.onRemoved.addListener(id=>{
  versions.set(id,version(id)+1);
  if(running && (running.source===id || running.target===id)){
    running.cancelled=true;
    if(running.source===id && Number.isInteger(running.target))void chrome.tabs.sendMessage(running.target,{type:"cancel"}).catch(()=>{});
  }
  void chrome.storage.session.remove(key(id));
});
