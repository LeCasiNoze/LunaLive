import assert from 'node:assert/strict';
import test from 'node:test';
import { createSyncChanges } from './sync_changes.js';
test('unchanged data is skipped only after acknowledgement and gets a heartbeat', () => {
  let now = 0;
  const sync = createSyncChanges<{ id: string; live: boolean; updatedAt: number }>(r => r.id, r => JSON.stringify({live:r.live}), 900_000, () => now);
  const row = {id:'one',live:true,updatedAt:1};
  assert.equal(sync.pending([row]).length, 1);
  assert.equal(sync.pending([row]).length, 1); // failed request, no ack
  sync.acknowledge([row]);
  assert.equal(sync.pending([{...row,updatedAt:2}]).length, 0);
  assert.equal(sync.pending([{...row,live:false}]).length, 1);
  now = 900_000;
  assert.equal(sync.pending([row]).length, 1);
});
