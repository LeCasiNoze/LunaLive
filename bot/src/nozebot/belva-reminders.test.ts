import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dueReminder,parisAt} from './belva-reminders.js';

const H=3600e3;
test('rappels : lancement, mi-parcours, veille', ()=>{
  const event=Date.parse('2026-11-25T09:00:00Z'),launch=Date.parse('2026-11-18T12:00:00Z');
  assert.equal(dueReminder(launch,event,{}),'launch');
  assert.equal(dueReminder(launch+H,event,{launch}),null);
  const mid=launch+(event-launch)/2;
  assert.equal(dueReminder(mid+H,event,{launch}),'mid');
  assert.equal(dueReminder(event-23*H,event,{launch,mid}),'h24');
  assert.equal(dueReminder(event-23*H,event,{launch,mid,h24:event-23*H}),null);
  assert.equal(dueReminder(event+H,event,{}),null);
  // Lancé la veille : pas de mi-parcours ni de « demain », le lancement suffit.
  assert.equal(dueReminder(event-10*H,event,{launch:event-12*H}),null);
});

test('heure de Paris', ()=>{
  assert.equal(new Date(parisAt('2026-11-25','10:00')).toISOString(),'2026-11-25T09:00:00.000Z');
  assert.equal(new Date(parisAt('2026-07-01','10:00')).toISOString(),'2026-07-01T08:00:00.000Z');
});
