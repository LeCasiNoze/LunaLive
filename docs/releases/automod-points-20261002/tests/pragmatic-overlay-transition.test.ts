import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserSlotExecutor} from '../src/browser-slot-executor.js';
function executor(){return Object.create(BrowserSlotExecutor.prototype) as any;}
test('unstable canvas capture yields unknown and does not terminate an otherwise readable provider',async()=>{
 const e=executor();e.pragmaticFrame=async()=>({evaluate:async()=>({pending:false,windowVisible:false,final:false,collectEvent:null})});
 const error=new Error('canvas is transitioning');error.name='TimeoutError';
 e.pragmaticOverlayCanvas=async()=>({boundingBox:async()=>{throw error}});
 assert.deepEqual(await e.readPragmaticOverlay(),{kind:'unknown',reason:'visual-capture-timeout'});
 e.pragmaticOverlayCanvas=async()=>({boundingBox:async()=>{throw new Error('page gone')}});
 await assert.rejects(e.readPragmaticOverlay(),/page gone/);
});
test('native intro disappearance plus actual counter decline proves progress without a screenshot during animation',async()=>{
 const e=executor();let reads=0,clicks=0;
 e.pragmaticWinGeneration=0;e.provider='pragmatic';e.options={onMilestone:async()=>{}};
 e.readPragmaticOverlay=async()=>{if(++reads>2)throw Error('must not capture transitioning canvas');return {kind:'intro',x:0.5,y:0.55}};
 e.readPragmatic=async()=>({freeSpinsLeft:reads===2&&clicks===0?10:9,playingFreeSpins:false,spinBusy:false,blockingDialogVisible:false,gambleActive:false,winPresentationCandidate:false});
 e.pragmaticOverlayCanvas=async()=>({boundingBox:async()=>({x:0,y:0,width:640,height:360}),click:async()=>{throw Error('Element click would scroll fullscreen canvas');},page:()=>({mouse:{click:async(x:number,y:number)=>{assert.equal(x,320);assert.ok(Math.abs(y-198)<1e-6);clicks++;}}})});
 e.pragmaticFrame=async()=>({evaluate:async()=>({windowVisible:false})});e.requireGamePage=()=>({waitForTimeout:async()=>{}});e.parkPresentationPointer=async()=>{};
 assert.equal(await e.clearPragmaticOverlay(false),true);assert.equal(clicks,1);assert.equal(reads,2);
});
test('a changing bonus intro is deferred with paid play blocked, then fails locally after its bounded 30-second wait',async()=>{
 const e=executor();let now=10000;e.now=()=>now;e.provider='pragmatic';e.expectedGamePath=null;e.pragmaticWinGeneration=0;e.pragmaticOverlayLastCheckedAt=0;e.pragmaticOverlayUnresolvedSince=null;e.previousBonus={active:true,gainCents:null};e.lastBonusGainCents=null;e.actualBaseStakeCents=20;e.roundsPlayed=0;e.options={onMilestone:async()=>{}};
 e.readPragmatic=async()=>({bonus:{active:true,gainCents:null},freeSpinsLeft:10,autoplayActive:false,autoplayRemaining:0});e.inspectPragmaticWinPresentation=async()=>({presentationActive:false,status:'idle'});e.readPragmaticOverlay=async()=>({kind:'intro',x:.5,y:.55});e.clearPragmaticOverlay=async()=>false;e.updateBonus=(state:any)=>{e.previousBonus=state;return []};
 const waiting=await e.observe();assert.equal(waiting.idle,false);assert.equal(waiting.bonusActive,true);assert.equal(waiting.roundActive,false);now+=31000;await assert.rejects(e.observe(),/30 secondes/);
});

test('OCR clear alone cannot acknowledge a Pragmatic bonus start; actual counter decline can',async()=>{
 const e=executor();let left=10;
 e.now=()=>10000;e.lastAdvanceAt=0;e.provider='pragmatic';e.pragmaticWinHolding=false;e.pragmaticOcrCandidate=null;
 e.previousBonus={active:true,gainCents:null};e.bonusStartAdvanced=false;e.lastBonusGainCents=null;
 e.lastPragmatic={freeSpinsLeft:10,playingFreeSpins:false,gambleActive:false,customBonusCollectPending:false};
 e.pragmaticFrame=async()=>({locator:()=>({all:async()=>[]}),evaluate:async()=>({active:false,triggered:null,candidates:[]})});
 e.clearPragmaticOverlay=async()=>true;e.readPragmatic=async()=>({freeSpinsLeft:left,playingFreeSpins:false,spinBusy:false});
 e.options={onMilestone:async()=>{}};
 await e.performAdvanceBonus();assert.equal(e.bonusStartAdvanced,false);assert.equal(e.lastAdvanceAt,0);
 left=9;await e.performAdvanceBonus();assert.equal(e.bonusStartAdvanced,true);assert.equal(e.lastAdvanceAt,10000);
});
