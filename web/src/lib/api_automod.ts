import { loadToken } from "./storage";
const BASE=((import.meta.env.VITE_API_BASE??import.meta.env.VITE_API_URL??"https://lunalive-api.onrender.com") as string).replace(/\/$/,"");
export type AutomodControl={ok:true;enabled:boolean;updatedAt:string|null;captchaActive:boolean;captchaDetectedAt:string|null;captchaAvailable:boolean};
async function request(init?:RequestInit){const token=loadToken();const r=await fetch(`${BASE}/api/fsb/automod`,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,...init?.headers}});const p=await r.json();if(!r.ok||p?.ok!==true)throw Error(p?.error||"automod_control_failed");return p as AutomodControl;}
export const getAutomodControl=()=>request();
export const setAutomodControl=(enabled:boolean)=>request({method:"PUT",body:JSON.stringify({enabled})});
export async function getAutomodCaptchaAccess(){const token=loadToken();const r=await fetch(`${BASE}/api/fsb/automod/captcha-access`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`}});const p=await r.json();if(!r.ok||p?.ok!==true||typeof p.url!=="string")throw Error(p?.error||"captcha_access_failed");return p as {ok:true;url:string;expiresInSeconds:number};}

export type AutomodProvider="pragmatic"|"hacksaw"|"nolimit";
export type AutomodDashboardSettings={allowedProviders:AutomodProvider[];stakeCents:number;slotDurationMs:number;goldenEnabled:boolean;audioMode?:"spotify"|"game"};
export type AutomodRuntime={phase:string;publisherActive:boolean;queueWritable:boolean;slot:{name:string;provider:string;callId:string;requestedBy:string}|null;slotPhase:string;roundsPlayed:number;slotDeadlineAt:number|null;recoveryPausedAt:number|null;bonusActive:boolean;lastError:string;logs:Array<{at:string;message:string}>;config:AutomodDashboardSettings|null};
export type AutomodDashboard={ok:true;enabled:boolean;updatedAt:string|null;captchaActive:boolean;captchaDetectedAt:string|null;captchaAvailable:boolean;settings:AutomodDashboardSettings|null;settingsRevision:number;appliedSettingsRevision:number;runtime:AutomodRuntime|null;runtimeSeenAt:string|null;commands:Array<{id:string;kind:string;status:string;createdAt:string;finishedAt:string|null;result:string|null}>};
async function dashboardRequest(path:string,init?:RequestInit){const token=loadToken();const response=await fetch(`${BASE}/api/fsb/automod${path}`,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`,...init?.headers},cache:"no-store"});const payload=await response.json().catch(()=>({}));if(!response.ok||payload.ok!==true)throw Error(payload.error||`Erreur Automod (${response.status})`);return payload;}
export const getAutomodDashboard=()=>dashboardRequest("/dashboard") as Promise<AutomodDashboard>;
export const setAutomodAudioMode=(audioMode:"spotify"|"game")=>dashboardRequest("/audio",{method:"PUT",body:JSON.stringify({audioMode})});
export const saveAutomodDashboardSettings=(settings:AutomodDashboardSettings)=>dashboardRequest("/settings",{method:"PUT",body:JSON.stringify(settings)}) as Promise<{ok:true;settings:AutomodDashboardSettings;settingsRevision:number}>;
export const sendAutomodCommand=(kind:"restart_chrome"|"skip_call")=>dashboardRequest("/commands",{method:"POST",body:JSON.stringify({kind})}) as Promise<{ok:true;id:string;kind:string}>;
