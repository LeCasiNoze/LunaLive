// Titles are metadata only: never invoke the game, queue or video controls.
export async function contextWithAutomod(status,{fetchImpl=fetch}={}){
  const result={...status,titleContext:{available:false}};
  if(status.publicationOwner!=='automod'||status.automodService!=='active')return result;
  try{
    const response=await fetchImpl('http://127.0.0.1:4317/api/status',{signal:AbortSignal.timeout(2000)});
    if(!response.ok)return result;
    const text=await response.text();if(text.length>2_000_000)return result;
    const value=JSON.parse(text);
    if(value.ok!==true||value.phase!=='running'||value.publisherActive!==true)return result;
    let mode=value.mode;
    if(mode==='bonus-hunt')mode='auto-hunt';
    if(!mode)mode=value.config?.bonusHunt?.enabled?'auto-hunt':value.config?.sessionMode||'classic';
    if(mode==='classic')mode='automod';
    // No nonce, settings, logs, queue or financial values cross this boundary.
    return {...status,titleContext:{available:true,mode,huntPhase:value.bonusHunt?.phase||null}};
  }catch{return result;}
}

export function titlePlan(context){
  if(context?.publicationOwner!=='automod'||context.automodService!=='active')return null;
  const c=context.titleContext;
  if(!c?.available||!['automod','auto-hunt'].includes(c.mode))return null;
  const opening=c.mode==='auto-hunt'&&['opening','settling','opening-bonus'].includes(c.huntPhase);
  const en=c.mode==='automod'?'Automod | You pick the slots | !call !discord | 18+':
    opening?'Auto Hunt | Bonus opening | !call !discord | 18+':'Auto Hunt | Farming bonuses | !call !discord | 18+';
  const fr=c.mode==='automod'?'Automod — Vous choisissez les slots !call !discord | 18+':
    opening?'Auto Hunt — Ouverture des bonus !call !discord | 18+':'Auto Hunt — Chasse aux bonus !call !discord | 18+';
  return {key:c.mode+':'+(opening?'opening':'normal'),titles:{kick:en,twitch:en,rumble:fr}};
}

export class TitleSynchronizer {
  constructor({apis,store,context,clock=Date.now,debounceMs=10_000}){
    Object.assign(this,{apis,store,context,clock,debounceMs});this.busy=false;this.pending=null;this.retryAt={};
  }
  async tick(){
    if(this.busy)return;this.busy=true;
    try{
      const context=await this.context(),plan=titlePlan(context),now=this.clock();
      if(!plan){this.pending=null;this.store.set('titleSync',{checkedAt:new Date(now).toISOString(),status:'inactive',reason:context.publicationOwner==='manual'?'personal_stream_preserved':'automod_not_active'});return;}
      if(this.pending?.key!==plan.key){this.pending={key:plan.key,since:now};return;}
      if(now-this.pending.since<this.debounceMs)return;
      const previous=this.store.get('titleSync',{}),results={...previous.platforms};
      for(const p of ['kick','twitch']){
        if(now<(this.retryAt[p]||0))continue;
        try{
          results[p]=await this.apis[p].setTitle(plan.titles[p],{stillAllowed:async()=>titlePlan(await this.context())?.key===plan.key});
          this.retryAt[p]=now+60_000;
        }catch(e){
          const error=/^[a-z0-9_]+$/.test(e.message)?e.message:'title_sync_failed';
          results[p]={status:error==='title_authorization_required'?'authorization_required':'error',error};
          this.retryAt[p]=now+(error==='title_authorization_required'?300_000:60_000);
        }
      }
      // Rumble's public Live API is read-only. No undocumented write is guessed.
      results.rumble={status:'editor_session_required',title:plan.titles.rumble};
      this.store.set('titleSync',{checkedAt:new Date(now).toISOString(),status:'active',mode:plan.key,platforms:results});
    }finally{this.busy=false;}
  }
}
