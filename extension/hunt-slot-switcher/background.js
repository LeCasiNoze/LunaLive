importScripts("core.js");
const rules=LunaSlotRules;
let running=null;
const versions=new Map();
const key=id=>"huntSource:"+id;
const version=id=>versions.get(id)||0;
async function source(id){return (await chrome.storage.session.get(key(id)))[key(id)];}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  (async()=>{
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
      await chrome.storage.session.remove(key(id));
      if(running?.source===id) {
        running.cancelled=true;
        if(Number.isInteger(running.target))await chrome.tabs.sendMessage(running.target,{type:"cancel"}).catch(()=>{});
      }
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
    const job={source:id,target:null,cancelled:false};running=job;
    try{
      const session=await source(id);
      if(!session)throw Error("Active le changement automatique.");
      job.target=session.target;
      const tab=await chrome.tabs.get(session.target);
      if(rules.casino(tab.url)!==session.casino)throw Error("L’onglet casino a changé. Réactive l’option.");
      if(session.seen.includes(m.slot.callId))return {ok:true,message:"Cette machine a déjà été demandée."};
      const current=await source(id);
      if(job.cancelled || !current || current.generation!==session.generation)throw Error("Recherche annulée.");
      const result=await chrome.tabs.sendMessage(session.target,{type:"open",slot:m.slot});
      if(job.cancelled)throw Error("Recherche annulée.");
      if(!result?.ok)throw Error(result?.error || "Recherche impossible. Recharge l’onglet casino.");
      // Persist dedupe across a sleeping/restarted service worker.
      session.seen=[...session.seen.slice(-199),m.slot.callId];
      if(await source(id))await chrome.storage.session.set({[key(id)]:session});
      return {ok:true,message:"Ouverture demandée : "+m.slot.name};
    }finally{if(running===job)running=null;}
  })().then(reply).catch(e=>reply({ok:false,error:e.message || "Extension indisponible."}));
  return true;
});
chrome.tabs.onRemoved.addListener(id=>{
  versions.set(id,version(id)+1);
  void chrome.storage.session.remove(key(id));
});
