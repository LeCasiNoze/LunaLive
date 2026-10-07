import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmaticFreeSpinStartContext} from '../src/pragmatic-free-spin-start.js';
function fixture(){
 function UILabel(){};function UIPanel(){};function StageResultFreeSpin(){};
 StageResultFreeSpin.prototype.OnConfirmFSStart=function(){};
 const handler={callback:StageResultFreeSpin.prototype.OnConfirmFSStart,isEnabled:true,object:{fsStartConfirmed:false,GetStageName(){return 4}}};
 const panel={alpha:1};const labels=['YOU HAVE WON','10','FREE SPINS','PRESS ANYWHERE TO CONTINUE'].map(text=>({text,enabled:true,gameObject:{activeInHierarchy:true},transform:null as any}));
 const window={gameObject:{name:'FSStartWindow',activeInHierarchy:true},parent:null,GetComponentsInChildren(type:unknown){return type===UILabel?labels:[panel]}};
 for(const label of labels)label.transform={parent:window,gameObject:{name:'Label'}};
 const runtime={UILabel,UIPanel,StageResultFreeSpin,UHTStageName:{ResultFreeSpin:4},globalRuntime:{sceneRoots:[null,{transform:{GetComponentsInChildren(){return labels}}}]},Vars:{Evt_DataToCode_ConfirmFSStart:'confirm',FreeSpinsLeftDisplayed:'left',WaitInResultForBigWin:'win'},XT:{GetInt(){return 10},GetBool(){return false},variablesEvent:{confirm:[{OnValueChanged:[handler]}]},TriggerEvent(){throw Error('read-only helper must never trigger')}}};
 return {runtime,handler,labels,window,panel};
}
test('native introduction is read-only and recognized even when OCR misses its text',()=>assert.deepEqual(pragmaticFreeSpinStartContext(fixture().runtime),{pending:true,windowVisible:true}));
test('a confirmed stage with its still-visible introduction still requires the UI click',()=>{const f=fixture();f.handler.object.fsStartConfirmed=true;assert.equal(pragmaticFreeSpinStartContext(f.runtime).pending,true)});
for(const condition of ['hidden','transparent','no-handler','disabled','wrong-stage','no-spins','big-win','buy','no-title','not-intro','no-continue'])test('native introduction refuses '+condition,()=>{const f=fixture();switch(condition){case 'hidden':f.window.gameObject.activeInHierarchy=false;break;case 'transparent':f.panel.alpha=0;break;case 'no-handler':f.runtime.XT.variablesEvent.confirm=[];break;case 'disabled':f.handler.isEnabled=false;break;case 'wrong-stage':f.handler.object.GetStageName=()=>3;break;case 'no-spins':f.runtime.XT.GetInt=()=>0;break;case 'big-win':f.runtime.XT.GetBool=()=>true;break;case 'buy':f.labels[0]!.text='BUY FREE SPINS';break;case 'no-title':f.labels[0]!.text='TOTAL WIN';break;case 'not-intro':f.window.gameObject.name='BuyWindow';break;case 'no-continue':f.labels[3]!.text='CONTINUE';break;}assert.equal(pragmaticFreeSpinStartContext(f.runtime).pending,false)});
test('native introduction helper runs serialized in the provider frame without Node/compiler closures',()=>{const result=new Function('runtime',`return (${pragmaticFreeSpinStartContext.toString()})(runtime)`)(fixture().runtime);assert.deepEqual(result,{pending:true,windowVisible:true})});

test("shared FreeSpins container family with real native introduction labels and handler",()=>{const f=fixture();f.window.gameObject.name="FreeSpins";assert.deepEqual(pragmaticFreeSpinStartContext(f.runtime),{pending:true,windowVisible:true})});

test("final IN 10 FREE SPINS window is not misclassified as an introduction",()=>{const f=fixture();f.window.gameObject.name="FreeSpins";f.labels.push({text:"IN",enabled:true,gameObject:{activeInHierarchy:true},transform:{parent:f.window}});assert.deepEqual(pragmaticFreeSpinStartContext(f.runtime),{pending:false,windowVisible:false})});
import {pragmaticFreeSpinRecapContext} from '../src/pragmatic-free-spin-start.js';
test('visible recap stays recognizable after logical collection without a live stage handler',()=>{const f=fixture();f.window.gameObject.name='FreeSpins';f.labels.push({text:'IN',enabled:true,gameObject:{activeInHierarchy:true},transform:{parent:f.window}});f.runtime.XT.variablesEvent.confirm=[];assert.deepEqual(new Function('runtime',`return (${pragmaticFreeSpinRecapContext.toString()})(runtime)`)(f.runtime),{visible:true,played:10});f.panel.alpha=0;assert.equal(pragmaticFreeSpinRecapContext(f.runtime).visible,false)});
test('introduction is never a recap and duplicate played counts stay ambiguous',()=>{const f=fixture();f.window.gameObject.name='FreeSpins';assert.equal(pragmaticFreeSpinRecapContext(f.runtime).visible,false);f.labels.push({text:'IN',enabled:true,gameObject:{activeInHierarchy:true},transform:{parent:f.window}},{text:'20',enabled:true,gameObject:{activeInHierarchy:true},transform:{parent:f.window}});assert.equal(pragmaticFreeSpinRecapContext(f.runtime).visible,false)});
test('classic FSResult supports its formatted played count with complete final native caption',()=>{const f=fixture();f.window.gameObject.name='FSResult';f.labels[1]!.text='CONGRATULATIONS';f.labels.push({text:'IN',enabled:true,gameObject:{activeInHierarchy:true},transform:{parent:f.window}});assert.deepEqual(pragmaticFreeSpinRecapContext(f.runtime),{visible:true,played:null})});

test('shared FSEndWindow recap with exclamation caption is recognized without relying on slot name',()=>{const f=fixture();f.window.gameObject.name='FSEndWindow';f.labels[1]!.text='CONGRATULATIONS!';assert.deepEqual(new Function('runtime',`return (${pragmaticFreeSpinRecapContext.toString()})(runtime)`)(f.runtime),{visible:true,played:null});assert.equal(pragmaticFreeSpinStartContext(f.runtime).windowVisible,false)});
test('deep suffixed recap variant retains complete captions and rejects introduction',()=>{const f=fixture();f.window.gameObject.name='FSResultWindow_BuyFS';f.labels.push({text:'IN',enabled:true,gameObject:{activeInHierarchy:true},transform:null});(f.window as any).parent={...f.window,gameObject:{name:'FSResultWindow_HOFI',activeInHierarchy:true}};for(const label of f.labels){let parent:any=f.window;for(let i=0;i<8;i++)parent={parent,gameObject:{name:'Layout',activeInHierarchy:true}};label.transform=parent;}assert.deepEqual(pragmaticFreeSpinRecapContext(f.runtime),{visible:true,played:10});f.labels.pop();assert.equal(pragmaticFreeSpinRecapContext(f.runtime).visible,false)});

test('deep suffixed FSStartWindow_BuyFS family is recognized only while its labels are active',()=>{
 const f=fixture();f.window.gameObject.name='FSStartWindow_BuyFS';
 (f.window as any).parent={...f.window,gameObject:{name:'FSStartWindow_HOFI',activeInHierarchy:true}};
 for(const label of f.labels){let parent:any=f.window;for(let i=0;i<8;i++)parent={parent,gameObject:{name:'Layout',activeInHierarchy:true}};label.transform=parent;}
 assert.deepEqual(pragmaticFreeSpinStartContext(f.runtime),{pending:true,windowVisible:true});
 for(const label of f.labels)label.gameObject.activeInHierarchy=false;
 assert.deepEqual(pragmaticFreeSpinStartContext(f.runtime),{pending:false,windowVisible:false});
});
