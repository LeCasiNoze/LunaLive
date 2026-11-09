const CHANNEL = '24912362';
export const MODERATION_SCOPES = ['moderation:ban', 'moderation:chat_message:manage'];

export function normalizedText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').toLowerCase()
    .replace(/[аα]/g,'a').replace(/[іιı]/g,'i').replace(/[сϲ]/g,'c')
    .replace(/[ѕ]/g,'s').replace(/[м]/g,'m').replace(/[ø]/g,'o').replace(/[’‘]/g,"'");
}

export function spamSignature(text) {
  const clean = normalizedText(text);
  // Reports about the campaign are not advertisements for it. Sellers also
  // write "don't get ripped off", so only a warning verb exempts "don't".
  if (/\b(?:scam|spam|arnaque|attention|report|avoid)\b|don't (?:click|buy|trust|pay)|ne cliquez/.test(clean)) return null;
  if (/\b(?:views?|viewers?|follows?|followers?)\b.{0,40}\bchat\s*b[o0]ts?\b/.test(clean)
    || /\bkick\s*\.\s*co\s+m\b/.test(clean)) return 'chat_bot_seller';
  if (clean.replace(/[^a-z]/g,'').includes('botliva') || /\btype\W{0,4}!noads\b|your chat stays online 24\/7/.test(clean)) return 'ai_chat_service';
  const compact = clean.replace(/[14$]/g,c=>({'1':'i','4':'a','$':'s'}[c])).replace(/[^a-z0-9]/g,'');
  if (compact.includes('kivasmm') && /\b(?:make|create|bring|boost|grow|buy|visit|check|try|join|get|increase|promote)\b/.test(clean)) return 'kivasmm_promotion';
  if (/ai[- ]powered viewers.{0,120}(?:daily|24\/7|around the clock)/.test(clean)
    || /manage your channel growth like a pro with 24\/7 automated stream tools/.test(clean)
    || /dominate your streaming category with non-stop viewer support/.test(clean)
    || /keep your chat moving non-stop.{0,80}ai-driven stream engagement/.test(clean)
    || /boost your overall channel visibility and audience engagement with cutting-edge automation/.test(clean)
    || /stand out in the directory with reliable viewer counts and automated chat activity/.test(clean)) return 'fake_viewer_campaign';
  return null;
}

const OPENERS = new Set([
  "What's up boss, wishing you a massive stream today",
  'Hey legend, hope the stream is going amazing today',
  'Wsup boss, hope your day is full of wins because you deserve them',
  'Hey there streamer, wishing you a super successful broadcast',
  'Wassup fam, hope the grind is paying off big time today',
  'Hello boss, stopping by to wish you high views and great chat',
  'What is good legend, love the setup and the chill vibes',
  'Yo champ, the stream energy is looking incredible today',
  'Hello friend, tuning in to catch the great vibes today',
  'Hey creator, your broadcast quality is top notch today',
  'Hey mate, hope you are having a blast on stream today',
  'Greetings, dropping by to support the awesome stream',
].map(value=>normalizedText(value).replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim()));
export const campaignOpener = text => OPENERS.has(normalizedText(text).replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim());

export function welcomeText(username) {
  const name=String(username).replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,50) || 'toi';
  return `👋 @${name} Bienvenue chez LeCasiNoze ! Là, c'est l'Auto Mode : propose ta machine avec !call NOM COMPLET. Le meilleur multiplicateur gagne le giveaway en fin de mois à 10 h (Paris). Lâche le follow et repasse pour mes vrais lives ! Tape !discord pour rejoindre la commu et recevoir les notifs.`;
}

export class KickCommunity {
  constructor({store,api,pool=null,onStatus=()=>{},now=Date.now}) {
    Object.assign(this,{store,api,pool,onStatus,now});
    store.db.exec(`CREATE TABLE IF NOT EXISTS kick_spam_accounts(
      user_id TEXT PRIMARY KEY,username TEXT NOT NULL,reason TEXT NOT NULL,detected INTEGER NOT NULL,
      ban_status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE TABLE IF NOT EXISTS kick_spam_messages(
      message_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,error TEXT);`);
  }
  eligible(event) {
    return event?.platform==='kick' && event.kind!=='follow' && String(event.channelId)===CHANNEL
      && /^\d+$/.test(String(event.userId)) && String(event.userId)!==CHANNEL;
  }
  known(event) { return this.eligible(event) && !!this.store.db.prepare('SELECT 1 FROM kick_spam_accounts WHERE user_id=?').get(String(event.userId)); }
  isOwnWelcome(event) {
    return event?.platform==='kick' && String(event.userId)===CHANNEL && !!this.store.db.prepare(
      "SELECT 1 FROM outbox WHERE platform='kick' AND id LIKE 'kick-welcome:%' AND text=? LIMIT 1"
    ).get(String(event.text||''));
  }
  flag(event,reason) {
    const id=String(event.userId);
    this.store.db.prepare(`INSERT INTO kick_spam_accounts(user_id,username,reason,detected) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET username=excluded.username`).run(id,event.username,reason,this.now());
    const remember=this.store.db.prepare('INSERT OR IGNORE INTO kick_spam_messages(message_id,user_id) VALUES(?,?)');
    if(event.messageId)remember.run(String(event.messageId),id);
    // Suppress the whole queued sequence, including its innocent-looking opener.
    const rows=this.store.db.prepare("SELECT id,event FROM inbox WHERE json_extract(event,'$.platform')='kick' AND CAST(json_extract(event,'$.userId') AS TEXT)=?").all(id);
    for(const row of rows){
      const previous=JSON.parse(row.event);if(previous.messageId)remember.run(String(previous.messageId),id);
      this.store.db.prepare("UPDATE inbox SET status='ignored',error='kick_ad_spam' WHERE id=? AND status IN ('pending','processing','blocked','held')").run(row.id);
    }
    this.store.db.prepare("UPDATE outbox SET status='ignored',error='kick_ad_spam' WHERE platform='kick' AND id LIKE ? AND status='pending'").run('kick-welcome:%:'+id);
    this.onStatus({kickLastSpam:{username:event.username,reason,at:new Date(this.now()).toISOString()}});
  }
  inspect(event) {
    if(!this.eligible(event))return {blocked:false,hold:false};
    const reason=spamSignature(event.text);
    if(reason || this.known(event)){this.flag(event,reason || 'known_spam_account');return {blocked:true,hold:false};}
    return {blocked:false,hold:campaignOpener(event.text)};
  }
  hold(id) {this.store.db.prepare("UPDATE inbox SET status='held' WHERE id=? AND status='pending'").run(id);}
  beforeRelay(item) {
    const result=this.inspect(item.event);
    if(result.blocked){this.store.finishInbox(item.id,'ignored','kick_ad_spam');return true;}
    return false;
  }
  autoMode() {
    const state=this.store.get('videoHealth',{});
    const age=this.now()-Date.parse(state.checkedAt);
    return state.mode==='automod' && state.sourceActive===true && age>=0 && age<90_000;
  }
  greet(event,receivedAt) {
    if(!this.eligible(event) || this.known(event) || !this.autoMode() || this.now()-receivedAt>120_000
      || /^(?:botrix|nightbot|streamelements|streamlabs|lunalive_bot)$/i.test(event.username))return false;
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(this.now()));
    const id=`kick-welcome:${day}:${event.userId}`;
    const inserted=this.store.enqueue(id,'kick',welcomeText(event.username));
    if(inserted)this.store.db.prepare('UPDATE outbox SET due=? WHERE id=?').run(this.now()+15_000,id);
    return inserted;
  }
  shouldSend(row) {
    if(!row.id.startsWith('kick-welcome:'))return true;
    const id=row.id.split(':').at(-1);
    return row.platform==='kick' && this.autoMode()
      && !this.store.db.prepare('SELECT 1 FROM kick_spam_accounts WHERE user_id=?').get(id);
  }
  async tick() {
    if(this.busy)return;
    this.busy=true;
    try{
      this.store.db.prepare("UPDATE inbox SET status='pending' WHERE status='held' AND created<=?").run(this.now()-15_000);
      if(!this.api?.vault)return;
      const credential=await this.api.vault.get('kick');
      if(String(credential.channelId)!==CHANNEL || String(credential.userId)!==CHANNEL)return;
      const scopes=credential.scopes || [];
      this.onStatus({kickModeration:MODERATION_SCOPES.every(scope=>scopes.includes(scope))?'ready':'authorization_required'});
      // A missing API table must not stop the automatic spam bans below.
      if(scopes.includes('moderation:ban'))await this.lunaliveBans().catch(()=>this.onStatus({kickModerationError:'lunalive_bans_unavailable'}));
      if(scopes.includes('moderation:ban')){
        const row=this.store.db.prepare("SELECT * FROM kick_spam_accounts WHERE ban_status='pending' AND due<=? ORDER BY detected LIMIT 1").get(this.now());
        if(row){
          try{
            const manual=row.reason==='lunalive_moderator_ban';
            await this.api.request('/moderation/bans',{method:'POST',body:JSON.stringify({broadcaster_user_id:Number(CHANNEL),user_id:Number(row.user_id),reason:manual?'Banni depuis le chat LunaLive':'Spam publicitaire automatise : faux viewers / bots'})});
            this.store.db.prepare("UPDATE kick_spam_accounts SET ban_status='done',error=NULL WHERE user_id=?").run(row.user_id);
            if(manual)await this.report(row.user_id,'done',null);
          }catch(error){
            this.retry('kick_spam_accounts','user_id',row.user_id,'ban_status',row,error);
            const failed=this.store.db.prepare("SELECT ban_status,error FROM kick_spam_accounts WHERE user_id=?").get(row.user_id);
            if(row.reason==='lunalive_moderator_ban'&&failed?.ban_status==='failed')await this.report(row.user_id,'failed',failed.error);
          }
        }
      }
      if(scopes.includes('moderation:chat_message:manage')){
        const row=this.store.db.prepare("SELECT * FROM kick_spam_messages WHERE status='pending' AND due<=? ORDER BY rowid LIMIT 1").get(this.now());
        if(row){
          try{
            await this.api.request('/chat/'+encodeURIComponent(row.message_id),{method:'DELETE'});
            this.store.db.prepare("UPDATE kick_spam_messages SET status='done',error=NULL WHERE message_id=?").run(row.message_id);
          }catch(error){
            if(error.status===404)this.store.db.prepare("UPDATE kick_spam_messages SET status='done',error=NULL WHERE message_id=?").run(row.message_id);
            else this.retry('kick_spam_messages','message_id',row.message_id,'status',row,error);
          }
        }
      }
    }finally{this.busy=false;}
  }
  // Bans decided by LunaLive moderators (API table external_chat_bans).
  async lunaliveBans() {
    if(!this.pool)return;
    const rows=(await this.pool.query(`SELECT b.external_user_id,b.username FROM external_chat_bans b JOIN streamers s ON s.id=b.streamer_id
      WHERE s.slug='lecasinoze' AND b.platform='kick' AND b.platform_status='pending' LIMIT 20`)).rows;
    for(const row of rows){
      const id=String(row.external_user_id);
      if(!/^\d+$/.test(id)||id===CHANNEL){await this.report(id,'failed','not_bannable');continue;}
      this.store.db.prepare(`INSERT INTO kick_spam_accounts(user_id,username,reason,detected) VALUES(?,?,'lunalive_moderator_ban',?)
        ON CONFLICT(user_id) DO UPDATE SET reason='lunalive_moderator_ban',ban_status=CASE WHEN ban_status='done' THEN 'done' ELSE 'pending' END,attempts=0,due=0`).run(id,row.username||id,this.now());
      this.flag({userId:id,username:row.username||id},'lunalive_moderator_ban');
      // Messages already relayed (and expired from the local inbox) are deleted on Kick too.
      const messages=(await this.pool.query("SELECT message_id FROM multichat_bridge_events WHERE platform='kick' AND user_id=$1 AND created_at>NOW()-INTERVAL '1 day'",[id])).rows;
      const remember=this.store.db.prepare('INSERT OR IGNORE INTO kick_spam_messages(message_id,user_id) VALUES(?,?)');
      for(const m of messages)remember.run(String(m.message_id),id);
      const done=this.store.db.prepare("SELECT ban_status FROM kick_spam_accounts WHERE user_id=?").get(id)?.ban_status==='done';
      await this.report(id,done?'done':'queued',null);
    }
  }
  async report(userId,status,error) {
    if(!this.pool)return;
    await this.pool.query(`UPDATE external_chat_bans SET platform_status=$2,platform_error=$3,platform_done_at=CASE WHEN $2='done' THEN NOW() ELSE platform_done_at END
      WHERE platform='kick' AND external_user_id=$1 AND streamer_id=(SELECT id FROM streamers WHERE slug='lecasinoze')`,[String(userId),status,error]).catch(()=>{});
  }
  retry(table,key,id,status,row,error) {
    const attempts=row.attempts+1;
    const retryable=!error.status || [401,403,429].includes(error.status) || error.status>=500;
    this.store.db.prepare(`UPDATE ${table} SET ${status}=?,attempts=?,due=?,error=? WHERE ${key}=?`)
      .run(retryable && attempts<5?'pending':'failed',attempts,this.now()+Math.max(30_000,error.retryAfter||0),error.status?'http_'+error.status:'network_error',id);
  }
}
