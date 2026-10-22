(() => {
  const channel="lunalive-hunt-slots-v1";
  window.addEventListener("message",async event=>{
    if(event.source!==window || event.origin!==location.origin || event.data?.channel!==channel || event.data?.direction!=="request")return;
    const {id,type,slot}=event.data;
    if(typeof id!=="string" || id.length>100 || !["ping","enable","disable","open"].includes(type))return;
    try {
      const result=await chrome.runtime.sendMessage({type,slot});
      window.postMessage({channel,direction:"response",id,...result},location.origin);
    }catch {
      window.postMessage({channel,direction:"response",id,ok:false,error:"Recharge LunaLive et l’onglet casino après installation de l’extension."},location.origin);
    }
  });
  window.addEventListener("pagehide",()=>{chrome.runtime.sendMessage({type:"disable"}).catch(()=>{});});
})();