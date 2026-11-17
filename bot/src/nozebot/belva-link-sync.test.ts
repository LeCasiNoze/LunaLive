import test from 'node:test';
import assert from 'node:assert/strict';
import {hasTeamTag} from './belva-link-sync.js';

test('team tag BLVA is detected at the start of the Rumble name, any case',()=>{
  for(const n of ['BLVA_Tyz','blvaJul','Blva-Max',' BLVAx'])assert.equal(hasTeamTag(n),true,n);
  for(const n of ['Tyz_BLVA','BLV_A','Belva','xblva'])assert.equal(hasTeamTag(n),false,n);
});
