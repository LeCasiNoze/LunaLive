import test from 'node:test';
import assert from 'node:assert/strict';
import {cnzRoleChange,hasCnzMarker} from '../src/nozebot/cnz-role.js';

test('CNZ is a standalone case-insensitive Rumble marker',()=>{
 for(const name of ['CNZ Nico','[cnz] Nico','Nico_CNZ','CNZ'])assert.equal(hasCnzMarker(name),true);
 for(const name of ['Nico','CNZaire','abcCNZ','CNZ2'])assert.equal(hasCnzMarker(name),false);
});
test('adds and removes only from a verified Rumble observation',()=>{
 const usernameVerifiedAt=new Date().toISOString();
 assert.equal(cnzRoleChange({username:'CNZ Nico',usernameVerifiedAt,hasRole:false}),'add');
 assert.equal(cnzRoleChange({username:'Nico',usernameVerifiedAt,hasRole:true}),'remove');
 assert.equal(cnzRoleChange({username:'CNZ Nico',usernameVerifiedAt,hasRole:true}),null);
 assert.equal(cnzRoleChange({username:'Nico',usernameVerifiedAt,hasRole:false}),null);
});
test('missing, invalid or future observations never mutate roles',()=>{
 for(const usernameVerifiedAt of [null,undefined,'-infinity','invalid',new Date(Date.now()+120000).toISOString()]){
  assert.equal(cnzRoleChange({username:'Nico',usernameVerifiedAt,hasRole:true}),null);
  assert.equal(cnzRoleChange({username:'CNZ Nico',usernameVerifiedAt,hasRole:false}),null);
 }
});
