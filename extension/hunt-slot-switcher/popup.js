document.getElementById("bind").addEventListener("click",async()=>{
 const status=document.getElementById("status");
 try{const r=await chrome.runtime.sendMessage({type:"bind"});status.textContent=r.ok?r.message:r.error;}
 catch{status.textContent="Sélection impossible. Recharge l’extension.";}
});