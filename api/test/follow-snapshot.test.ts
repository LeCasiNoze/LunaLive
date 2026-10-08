import test from 'node:test';
import assert from 'node:assert/strict';
import {followSnapshot} from '../src/automod-shop/follow-snapshot.js';

test('accepts the native public account ID and preserves the new follow',()=>{
 const data={type:'user',username:'LeCasiNoze',user_id:'4p6wxa',followers:{num_followers_total:36,recent_followers:[{username:'NewFollower',followed_on:'2026-10-08T08:04:35-04:00'}]}};
 assert.equal(followSnapshot(data,'LeCasiNoze')?.ownerId,'4p6wxa');
 assert.equal(followSnapshot(data,'LeCasiNoze')?.recent[0].username,'NewFollower');
 assert.equal(followSnapshot({...data,username:'Other'},'LeCasiNoze'),null);
 assert.equal(followSnapshot({...data,type:'channel'},'LeCasiNoze'),null);
 for(const user_id of ['', 'bad/id', 'a'.repeat(21)])assert.equal(followSnapshot({...data,user_id},'LeCasiNoze'),null);
 assert.equal(followSnapshot(data,'Other'),null);
 assert.equal(followSnapshot({...data,user_id:'12345'},'LeCasiNoze')?.ownerId,'12345');
});
