import {DatabaseSync} from 'node:sqlite';
import {mkdirSync, chmodSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomBytes} from 'node:crypto';

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true, mode:0o700});
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, platform TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, event TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, error TEXT);
      CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, platform TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, due INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, message_id TEXT, error TEXT);
      CREATE TABLE IF NOT EXISTS own_messages (platform TEXT NOT NULL, id TEXT NOT NULL, text TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(platform,id));`);
    // A crash during a non-idempotent remote send has an unknown outcome. Never blindly duplicate it.
    this.db.prepare("UPDATE outbox SET status='uncertain',error='process_interrupted_during_send' WHERE status='sending'").run();
    this.db.prepare("UPDATE inbox SET status='pending' WHERE status='processing'").run();
  }
  get(key, fallback = null) { const row=this.db.prepare('SELECT value FROM state WHERE key=?').get(key); return row ? JSON.parse(row.value) : fallback; }
  set(key, value) { this.db.prepare('INSERT INTO state VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  oauth(platform) {
    const state=randomBytes(32).toString('base64url'), verifier=randomBytes(48).toString('base64url');
    this.db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
    this.db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?)').run(state,platform,verifier,Date.now()+10*60_000);
    return {state,verifier};
  }
  consumeOauth(state,platform) {
    const row=this.db.prepare('DELETE FROM oauth_states WHERE state=? AND platform=? RETURNING *').get(state,platform);
    if(!row || row.expires<Date.now()) throw Error('oauth_state_invalid_or_expired');
    return row || null;
  }
  receive(id,event) { return this.db.prepare('INSERT OR IGNORE INTO inbox(id,event,created) VALUES (?,?,?)').run(id,JSON.stringify(event),Date.now()).changes>0; }
  nextInbox() { const row=this.db.prepare("SELECT * FROM inbox WHERE status='pending' ORDER BY created LIMIT 1").get(); if(!row)return null; this.db.prepare("UPDATE inbox SET status='processing' WHERE id=?").run(row.id); return {...row,event:JSON.parse(row.event)}; }
  finishInbox(id,status='done',error=null) { this.db.prepare('UPDATE inbox SET status=?,error=? WHERE id=?').run(status,error,id); }
  enqueue(id,platform,text) { return this.db.prepare('INSERT OR IGNORE INTO outbox(id,platform,text,created,due) VALUES (?,?,?,?,?)').run(id,platform,text,Date.now(),Date.now()).changes>0; }
  nextOutbox(now=Date.now()) {
    this.db.prepare("UPDATE outbox SET status='expired',error='message_older_than_10_minutes' WHERE status='pending' AND created<?").run(now-10*60_000);
    const row=this.db.prepare("SELECT * FROM outbox WHERE status='pending' AND due<=? ORDER BY created LIMIT 1").get(now);
    if(row)this.db.prepare("UPDATE outbox SET status='sending',attempts=attempts+1 WHERE id=?").run(row.id);
    return row || null;
  }
  sent(row,messageId) {
    this.db.prepare("UPDATE outbox SET status='done',message_id=? WHERE id=?").run(messageId,row.id);
    this.rememberOwn(row.platform,messageId,row.text);
  }
  failed(row,code,{retry=false,delay=30_000,uncertain=false}={}) {
    const status=uncertain?'uncertain':retry&&row.attempts<5?'pending':'failed';
    this.db.prepare('UPDATE outbox SET status=?,due=?,error=? WHERE id=?').run(status,Date.now()+delay,code,row.id);
  }
  rememberOwn(platform,id,text) { this.db.prepare('INSERT OR REPLACE INTO own_messages VALUES (?,?,?,?)').run(platform,String(id),text,Date.now()); }
  own(platform,id,text) {
    return Boolean(this.db.prepare('SELECT 1 FROM own_messages WHERE platform=? AND (id=? OR (text=? AND created>?))').get(platform,String(id),text,Date.now()-30_000));
  }
  counts() { return {inbox:this.db.prepare('SELECT status,COUNT(*) AS count FROM inbox GROUP BY status').all(), outbox:this.db.prepare('SELECT platform,status,COUNT(*) AS count FROM outbox GROUP BY platform,status').all()}; }
  prune() {
    const cutoff=Date.now()-7*86400_000;
    this.db.prepare("DELETE FROM inbox WHERE created<? AND status IN ('done','ignored')").run(cutoff);
    this.db.prepare("DELETE FROM outbox WHERE created<? AND status IN ('done','expired')").run(cutoff);
    this.db.prepare('DELETE FROM own_messages WHERE created<?').run(Date.now()-86400_000);
  }
  close() { this.db.close(); }
}
