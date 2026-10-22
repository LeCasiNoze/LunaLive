import * as React from "react";
const channel="lunalive-hunt-slots-v1";
type Reply={ok:boolean;message?:string;error?:string};
type Slot={id?:unknown;slotName?:unknown;provider?:unknown};
function request(type:string,slot?:{callId:string;name:string;provider:string|null}):Promise<Reply>{
  return new Promise(resolve=>{
    const id=crypto.randomUUID();
    const timeout=window.setTimeout(()=>finish({ok:false,error:type==="open"?"Recherche non confirmée. Vérifie le casino avant de continuer.":"Extension absente. Installe LunaLive — Slots suivantes, puis recharge cette page."}),type==="open"?45000:1800);
    function finish(result:Reply){clearTimeout(timeout);window.removeEventListener("message",receive);resolve(result);}
    function receive(event:MessageEvent){
      if(event.source===window && event.origin===location.origin && event.data?.channel===channel && event.data?.direction==="response" && event.data?.id===id)finish(event.data);
    }
    window.addEventListener("message",receive);
    window.postMessage({channel,direction:"request",id,type,slot},location.origin);
  });
}
export function useSlotNavigation(scope:string,allowed:boolean){
  const storageKey="lunalive:slot-navigation:"+scope;
  const [enabled,setEnabled]=React.useState(false);
  const [pending,setPending]=React.useState(false);
  const [message,setMessage]=React.useState("");
  const active=React.useRef(false);
  const desired=React.useRef(false);
  const activating=React.useRef(false);
  const epoch=React.useRef(0);
  function remember(value:boolean){
    desired.current=value;setEnabled(value);
    try{localStorage.setItem(storageKey,value?"on":"off");}catch{/* Keep working when browser storage is unavailable. */}
  }
  async function activate(generation:number){
    activating.current=true;setPending(true);
    const result=await request("enable");
    if(generation!==epoch.current)return false;
    activating.current=false;setPending(false);active.current=result.ok;
    setMessage(result.message || result.error || "");
    return result.ok;
  }
  React.useEffect(()=>{
    active.current=false;activating.current=false;setEnabled(false);setPending(false);setMessage("");epoch.current++;
    let saved=false;
    try{saved=localStorage.getItem(storageKey)==="on";}catch{}
    desired.current=allowed && saved;setEnabled(desired.current);
    if(desired.current)void activate(epoch.current);
    else void request("disable");
    // Cancel outstanding work, but preserve the user's preference across menu mounts.
    return ()=>{active.current=false;desired.current=false;activating.current=false;epoch.current++;void request("disable");};
  },[scope,allowed]);
  async function toggle(){
    if(desired.current){
      remember(false);active.current=false;activating.current=false;epoch.current++;setPending(false);
      setMessage("Désactivé.");void request("disable");return;
    }
    if(!allowed)return;
    const generation=++epoch.current;
    remember(true);
    await activate(generation);
  }
  async function next(slot:Slot|null|undefined,ticket:number){
    if(ticket!==epoch.current || !desired.current || !allowed || activating.current)return;
    if(!slot?.id || typeof slot.slotName!=="string"){setMessage("Plus de machine en attente.");return;}
    if(!active.current && !await activate(ticket))return;
    if(ticket!==epoch.current || !desired.current)return;
    setPending(true);setMessage("Recherche : "+slot.slotName);
    const result=await request("open",{callId:String(slot.id),name:slot.slotName,provider:typeof slot.provider==="string"?slot.provider:null});
    if(ticket!==epoch.current)return;
    setPending(false);setMessage(result.message || result.error || "");
    if(!result.ok){active.current=false;void request("disable");}
  }
  return {enabled,pending,message,toggle,next,ticket:()=>epoch.current};
}
