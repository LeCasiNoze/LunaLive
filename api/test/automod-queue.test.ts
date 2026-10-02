import assert from 'node:assert/strict';
import test from 'node:test';
import { addCall } from '../src/calls/queue.js';

const requestId = 'a8cf0b80-cd8c-42f6-88df-b5b0357f40d5';
function database() {
  let queue: any[] = [], requests = new Map<string, any>(), snapshot: any;
  const log: string[] = [];
  let failJournal = false;
  const query = async (sql: string, args: any[] = []) => {
    const q = sql.replace(/\s+/g, ' ').trim(); log.push(q);
    const rows = (r: any[] = []) => ({ rows: r });
    if (q.includes('FROM automod_control')) return rows([{ desired_enabled: false }]);
    if (q.startsWith('DO $$') || q.startsWith('CREATE TABLE') || q.startsWith('INSERT INTO calls_provider_policy')) return rows();
    if (q.startsWith('SELECT enabled')) return rows([{ enabled: true, per_user_limit: 2 }]);
    if (q.includes('FROM calls_bans')) return rows();
    if (q.startsWith('SELECT mode')) return rows([{ mode: 'allow_all' }]);
    if (q === 'BEGIN') { snapshot = { queue: [...queue], requests: new Map(requests) }; return rows(); }
    if (q === 'ROLLBACK') { queue = snapshot.queue; requests = snapshot.requests; return rows(); }
    if (q === 'COMMIT' || q.startsWith('SELECT pg_advisory')) return rows();
    if (q.startsWith('SELECT r.item')) { const item = requests.get(args[1]); return rows(item ? [{ item, pending_id: queue.find(x => x.id === item.id)?.id }] : []); }
    if (q.startsWith('SELECT id FROM calls_queue')) return rows(queue.slice(0, 1));
    if (q.startsWith('SELECT COALESCE(MAX')) return rows([{ m: queue.length }]);
    if (q.startsWith('INSERT INTO calls_queue')) { const item = { id: String(queue.length + 1), createdAt: '2026-09-29T00:00:00Z' }; queue.push(item); return rows([item]); }
    if (q.startsWith('INSERT INTO calls_automod_requests')) { if (failJournal) throw Error('journal failure'); requests.set(args[1], JSON.parse(args[3])); return rows(); }
    if (q.startsWith('INSERT INTO calls_actions')) return rows();
    throw Error('Unexpected SQL: ' + q);
  };
  const client = { query, release() {} };
  return { pool: { query, connect: async () => client } as any, log, get queue() { return queue; }, clear() { queue = []; }, failJournal() { failJournal = true; } };
}
const insert = (db: ReturnType<typeof database>) => addCall(db.pool, 12, 0, 'Automod', 'Le Bandit', 'hacksaw', { bypassLimit: true, automodRequestId: requestId });

test('retry returns one queued call; removed call cannot be recreated with the same request', async () => {
  const db = database(), first = await insert(db), second = await insert(db);
  assert.deepEqual(second, first); assert.equal(db.queue.length, 1);
  assert.equal(db.log.filter(q => q.startsWith('INSERT INTO calls_queue')).length, 1);
  assert.ok(db.log.indexOf('SELECT pg_advisory_xact_lock($1)') < db.log.findIndex(q => q.startsWith('SELECT r.item')));
  assert.equal(db.log.some(q => q.startsWith('INSERT INTO calls_actions')), false);
  db.clear(); assert.deepEqual(await insert(db), { ok: false, error: 'automod_call_finished' });
  assert.equal(db.queue.length, 0);
});
test('viewer already queued keeps priority and receives normal quest credit', async () => {
  const db = database();
  assert.equal((await addCall(db.pool, 12, 42, 'Viewer', 'Wanted', 'hacksaw', { bypassLimit: true })).ok, true);
  assert.deepEqual(await insert(db), { ok: false, error: 'queue_not_empty' });
  assert.equal(db.queue.length, 1);
  assert.equal(db.log.filter(q => q.startsWith('INSERT INTO calls_actions')).length, 1);
});
test('queue insertion rolls back if idempotency record cannot be stored', async () => {
  const db = database(); db.failJournal();
  assert.deepEqual(await insert(db), { ok: false, error: 'insert_failed' });
  assert.equal(db.queue.length, 0); assert.ok(db.log.includes('ROLLBACK'));
});
test('Automod identity cannot be supplied by a viewer', async () => {
  const db = database();
  assert.deepEqual(await addCall(db.pool, 12, 42, 'Viewer', 'Wanted', 'hacksaw', { automodRequestId: requestId }), { ok: false, error: 'invalid_automod_request' });
  assert.equal(db.queue.length, 0);
});
