import { loadToken } from "./storage";
const BASE=((import.meta.env.VITE_API_BASE??import.meta.env.VITE_API_URL??"https://lunalive-api.onrender.com") as string).replace(/\/$/,"");
export type AutomodControl={ok:true;enabled:boolean;updatedAt:string|null;captchaActive:boolean;captchaDetectedAt:string|null;captchaAvailable:boolean};
async function request(init?:RequestInit){const token=loadToken();const r=await fetch(`${BASE}/api/fsb/automod`,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,...init?.headers}});const p=await r.json();if(!r.ok||p?.ok!==true)throw Error(p?.error||"automod_control_failed");return p as AutomodControl;}
export const getAutomodControl=()=>request();
export const setAutomodControl=(enabled:boolean)=>request({method:"PUT",body:JSON.stringify({enabled})});
export async function getAutomodCaptchaAccess(){const token=loadToken();const r=await fetch(`${BASE}/api/fsb/automod/captcha-access`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}});const p=await r.json();if(!r.ok||p?.ok!==true||typeof p.url!=="string")throw Error(p?.error||"captcha_access_failed");return p as {ok:true;url:string;expiresInSeconds:number};}
