import { loadToken } from "./storage";
const BASE=((import.meta.env.VITE_API_BASE??import.meta.env.VITE_API_URL??"https://lunalive-api.onrender.com") as string).replace(/\/$/,"");
async function request(init?:RequestInit){const token=loadToken();const r=await fetch(`${BASE}/api/fsb/automod`,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,...init?.headers}});const p=await r.json();if(!r.ok||p?.ok!==true)throw Error(p?.error||"automod_control_failed");return p as {ok:true;enabled:boolean;updatedAt:string|null};}
export const getAutomodControl=()=>request();
export const setAutomodControl=(enabled:boolean)=>request({method:"PUT",body:JSON.stringify({enabled})});
