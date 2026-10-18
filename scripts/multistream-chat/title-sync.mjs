export function titlesForMode(status,owner){
  if(owner!=='automod'||status?.phase!=='running'||status.publisherActive!==true)return null;
  const hunt=status.config?.bonusHunt?.enabled===true;
  const mode=hunt?'auto-hunt':status.config?.sessionMode;
  if(mode!=='auto-hunt'&&mode!=='classic')return null;
  return hunt?{
    mode,rumble:'Auto Hunt — Propose tes machines avec !call | Farm puis ouverture !',
    kick:'Auto Hunt — Pick the next slots with !call | Collecting bonuses, then opening!',
    twitch:'Auto Hunt — Pick the next slots with !call | Collecting bonuses, then opening!',
  }:{mode,rumble:'Automod — Vous choisissez les machines !call | Bonus joués en direct',
    kick:'Auto Mode — You pick the slots! !call | Bonuses played live',
    twitch:'Auto Mode — You pick the slots! !call | Bonuses played live'};
}
export async function syncTitles({status,owner,apis,store,now=Date.now()}){
  const desired=titlesForMode(status,owner);
  if(!desired){
    for(const p of ['kick','twitch'])store.set('titleSync:'+p,{});
    return {state:'personal_or_inactive'};
  }
  const result={mode:desired.mode,rumble:'adapter_required'};
  for(const p of ['kick','twitch']){
    const key='titleSync:'+p,old=store.get(key,{});
    if(old.title===desired[p]){result[p]='synced';continue;}
    if(old.retryAt>now){result[p]=old.error;continue;}
    try{
      await apis[p].title(desired[p]);
      store.set(key,{title:desired[p],at:now});result[p]='synced';
    }catch(error){
      const code=error.message==='title_authorization_required'?'title_authorization_required':'title_update_failed';
      store.set(key,{error:code,retryAt:now+5*60_000});result[p]=code;
    }
  }
  return result;
}
