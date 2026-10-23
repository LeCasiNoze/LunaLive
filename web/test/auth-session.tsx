import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from '../src/auth/AuthProvider';
let mode=localStorage.getItem('fixture-api-mode') || 'ok';
const delayed: Array<()=>void>=[];
window.fetch=async(input,init)=>{
 const path=new URL(String(input),location.href).pathname;
 if(path!=='/me')return new Response(JSON.stringify({ok:true,claimed:false}),{status:200});
 if(mode==='network')throw new TypeError('Failed to fetch');
 if(mode==='slow401')return new Promise(resolve=>delayed.push(()=>resolve(new Response(JSON.stringify({error:'unauthorized'}),{status:401}))));
 if(mode==='401'||mode==='503')return new Response(JSON.stringify({error:mode==='401'?'unauthorized':'unavailable'}),{status:Number(mode)});
 const token=(init?.headers as any)?.Authorization;
 const second=String(token).includes('fixture-session-b');
 return new Response(JSON.stringify({ok:true,user:{id:second?2:1,username:second?'Belvaa':'Alice',role:'viewer',rubis:0}}),{status:200});
};
function Fixture(){
 const auth=useAuth();
 const [last,setLast]=React.useState('Aucun test lancé');
 const refresh=async(next:string)=>{mode=next;localStorage.setItem('fixture-api-mode',next);await auth.refreshMe();setLast(next);};
 return <main style={{maxWidth:850,margin:'40px auto',lineHeight:1.7}}>
  <h1>Sessions — vérification locale</h1>
  <p data-testid="account">Compte : {auth.user?.username || 'aucun'}</p>
  <p data-testid="token">Session : {auth.token ? 'conservée' : 'absente'}</p>
  <p data-testid="stored">Stockage : {localStorage.getItem('lunalive_token_v1') || 'vide'}</p>
  <p data-testid="last">Dernier contrôle : {last}</p>
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
   <button onClick={()=>{mode='ok';auth.setAuth('fixture-session-a',{id:1,username:'Alice',role:'viewer',rubis:0});}}>Connecter Alice</button>
   <button onClick={()=>void refresh('network')}>Simuler une coupure</button>
   <button onClick={()=>void refresh('503')}>Simuler API 503</button>
   <button onClick={()=>void refresh('401')}>Simuler session expirée</button>
   <button onClick={()=>{mode='network';localStorage.setItem('fixture-api-mode',mode);auth.setAuth('fixture-session-b',null);}}>Retour Discord pendant coupure</button>
   <button onClick={()=>{mode='ok';localStorage.setItem('fixture-api-mode',mode);window.dispatchEvent(new Event('online'));setLast('online');}}>Rétablir le réseau</button>
   <button onClick={()=>{mode='slow401';void auth.refreshMe();setLast('401 en attente');}}>Ancienne requête lente</button>
   <button onClick={()=>{mode='ok';auth.setAuth('fixture-session-b',{id:2,username:'Belvaa',role:'viewer',rubis:0});}}>Connecter Belvaa</button>
   <button onClick={()=>{for(const resolve of delayed.splice(0))resolve();setLast('Anciennes réponses livrées');}}>Livrer anciennes réponses</button>
   <button onClick={()=>auth.logout()}>Déconnexion explicite</button>
  </div>
 </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><Fixture/></AuthProvider></React.StrictMode>);
