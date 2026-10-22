const {test,after}=require("node:test");const assert=require("node:assert/strict");const path=require("node:path");const {chromium}=require("playwright-core");
let browser;
after(async()=>{await browser?.close();});
async function fixture(html,casino="shuffle"){
 if(!browser)browser=await chromium.launch({executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-background-networking","--disable-gpu"]});
 const page=await browser.newPage();
 const host=casino==="shuffle"?"shuffle.com":"celsiuscasino.co";
 await page.route("**/*",route=>route.fulfill({contentType:"text/html; charset=utf-8",body:html}));
 await page.goto("https://"+host+"/games/old");
 await page.evaluate(()=>{window.chrome={runtime:{sendMessage:async()=>({ok:true}),onMessage:{addListener:fn=>{window.receiveSlot=fn;}}}};window.selected=[];document.addEventListener("click",e=>{const a=e.target.closest("a");if(a){e.preventDefault();window.selected.push(a.getAttribute("href"));}});});
 await page.addScriptTag({path:path.join(__dirname,"../core.js")});await page.addScriptTag({path:path.join(__dirname,"../casino.js")});
 const message=slot=>page.evaluate(slot=>new Promise(resolve=>window.receiveSlot({type:"open",slot},{},resolve)),slot);
 const prepare=options=>page.evaluate(options=>new Promise(resolve=>window.receiveSlot({type:"prepare-shuffle",slot:{name:"Gems Bonanza",callId:"1"},expectedUrl:location.href,playMode:"real",...options},{},resolve)),options||{});
 return {page,message,prepare};
}
const slot={name:"Gems Bonanza",callId:"1"};
test("Shuffle: opens search, fills the React-style input and selects one exact card",async()=>{
 const f=await fixture('<button aria-label="Rechercher des jeux">Loupe</button><div id="content"></div><script>document.querySelector("button").onclick=()=>{document.querySelector("#content").innerHTML=\'<div role="dialog"><input placeholder="Chercher un jeu"><a href="/games/wrong"><img alt="Gems Bonanza 1000"></a></div>\';document.querySelector("input").addEventListener("input",e=>{window.query=e.target.value;const a=document.createElement("a");a.href="/games/gems-bonanza";a.innerHTML=\'<img alt="Gems Bonanza">\';document.querySelector("[role=dialog]").append(a);});};</script>');
 assert.equal((await f.message(slot)).ok,true);
 assert.equal(await f.page.evaluate(()=>window.query),"Gems Bonanza");
 assert.deepEqual(await f.page.evaluate(()=>window.selected),["/games/gems-bonanza"]);await f.page.close();
});
test("Celsius: finds existing search and data-game-name result, no coordinate clicks",async()=>{
 const f=await fixture('<input type="search"><a href="/casino/gems" data-game-name="Gems Bonanza">Gems Bonanza</a>',"celsius");
 assert.equal((await f.message(slot)).ok,true);assert.deepEqual(await f.page.evaluate(()=>window.selected),["/casino/gems"]);await f.page.close();
});
test("two exact different game cards fail instead of picking the first",async()=>{
 const f=await fixture('<input type="search"><a href="/games/a">Gems Bonanza</a><a href="/games/b">Gems Bonanza</a>');
 assert.equal((await f.message(slot)).ok,false);assert.deepEqual(await f.page.evaluate(()=>window.selected),[]);await f.page.close();
});
test("duplicate thumbnail and title links to the same game count as one result",async()=>{
 const f=await fixture('<input type="search"><a href="/games/a"><img alt="Gems Bonanza"></a><a href="/games/a">Gems Bonanza</a>');
 assert.equal((await f.message(slot)).ok,true);assert.deepEqual(await f.page.evaluate(()=>window.selected),["/games/a"]);await f.page.close();
});
test("OFF during delayed results prevents all navigation",async()=>{
 const f=await fixture('<input type="search"><a href="/games/a">Gems Bonanza</a>');
 const result=f.message(slot);await f.page.waitForTimeout(80);
 await f.page.evaluate(()=>window.receiveSlot({type:"cancel"},{},()=>{}));
 assert.equal((await result).ok,false);assert.deepEqual(await f.page.evaluate(()=>window.selected),[]);await f.page.close();
});
test("missing search fails without clicking unrelated play or account buttons",async()=>{
 const f=await fixture('<button>Jouer</button><button>Acheter le bonus</button><input placeholder="Montant du dépôt"><a href="/account/Gems-Bonanza">Gems Bonanza</a>');
 assert.equal((await f.message(slot)).ok,false);assert.deepEqual(await f.page.evaluate(()=>window.selected),[]);await f.page.close();
});

function launcher({ars=true,currency='ARS',delay=0,expanded=false,fullscreen=true}={}){
 return `<h1>Gems Bonanza</h1><div role="dialog" id="launcher"><select name="currency"><option value="EUR">EUR</option>${ars?'<option value="ARS">ARS</option>':''}</select><button id="real">Jeu réel</button><button id="fun">Jeu amusant</button></div>${fullscreen?'<button id="expand" aria-label="Plein écran">Agrandir</button>':''}<button id="spin">Spin</button><button id="buy">Acheter le bonus</button><script>
 window.steps=[];document.querySelector('#real').onclick=()=>{window.steps.push('confirm:'+document.querySelector('select').value);document.querySelector('#launcher').remove();setTimeout(()=>{let f=document.createElement('iframe');f.id='game';f.src='https://provider.pragmaticplay.net/game?gameid=fixture&currency=${currency}';${expanded?"f.style='position:fixed;inset:0;width:100vw;height:100vh';":''}document.body.append(f);},${delay});};
 document.querySelector('#fun').onclick=()=>window.steps.push('fun');document.querySelector('#spin').onclick=()=>window.steps.push('spin');document.querySelector('#buy').onclick=()=>window.steps.push('buy');
 if(document.querySelector('#expand'))document.querySelector('#expand').onclick=()=>{window.steps.push('expand');document.querySelector('#game').style='position:fixed;inset:0;width:100vw;height:100vh';};</script>`;
}
test('Shuffle prepares ARS, confirms the requested real-play launcher and enlarges only the game',async()=>{
 const f=await fixture(launcher());const result=await f.prepare();assert.equal(result.ok,true,result.error);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS','expand']);await f.page.close();
});
test('missing ARS never launches or enlarges the game',async()=>{
 const f=await fixture(launcher({ars:false}));const result=await f.prepare();assert.equal(result.ok,false);assert.match(result.error,/ARS indisponible/);assert.deepEqual(await f.page.evaluate(()=>window.steps),[]);await f.page.close();
});
test('React rejecting ARS prevents launcher confirmation',async()=>{
 const f=await fixture(launcher());await f.page.evaluate(()=>document.querySelector('select').addEventListener('change',e=>e.target.value='EUR'));const result=await f.prepare();assert.equal(result.ok,false);assert.match(result.error,/ARS non confirmée/);assert.deepEqual(await f.page.evaluate(()=>window.steps),[]);await f.page.close();
});
test('provider currency mismatch never enlarges the game',async()=>{
 const f=await fixture(launcher({currency:'EUR'}));const result=await f.prepare();assert.equal(result.ok,false);assert.match(result.error,/fournisseur/);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS']);await f.page.close();
});
test('already enlarged game is not toggled back to normal',async()=>{
 const f=await fixture(launcher({expanded:true}));const result=await f.prepare();assert.equal(result.ok,true,result.error);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS']);await f.page.close();
});
test('OFF while the game is loading prevents the later enlargement',async()=>{
 const f=await fixture(launcher({delay:500}));const result=f.prepare();await f.page.waitForFunction(()=>window.steps.length===1);await f.page.evaluate(()=>window.receiveSlot({type:'cancel'},{},()=>{}));assert.equal((await result).ok,false);await f.page.waitForTimeout(600);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS']);await f.page.close();
});
test('a different game URL cannot receive the pending setup',async()=>{
 const f=await fixture(launcher());const result=await f.prepare({expectedUrl:'https://shuffle.com/games/another'});assert.equal(result.ok,false);assert.deepEqual(await f.page.evaluate(()=>window.steps),[]);await f.page.close();
});
test('missing game expansion control reports incomplete setup without other clicks',async()=>{
 const f=await fixture(launcher({fullscreen:false}));const result=await f.prepare();assert.equal(result.ok,false);assert.match(result.error,/agrandissement/);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS']);await f.page.close();
});
test('an active Shuffle expansion toggle is left on even with a smaller iframe',async()=>{
 const f=await fixture(launcher());await f.page.evaluate(()=>document.querySelector('#expand').setAttribute('aria-pressed','true'));const result=await f.prepare();assert.equal(result.ok,true,result.error);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS']);await f.page.close();
});
test('an ARS game preloaded hidden is accepted when the launcher reveals it',async()=>{
 const f=await fixture(launcher());await f.page.evaluate(()=>{
  const frame=document.createElement('iframe');frame.id='game';frame.src='https://provider.pragmaticplay.net/game?gameid=fixture&currency=ARS';frame.style.display='none';document.body.append(frame);
  document.querySelector('#real').onclick=()=>{window.steps.push('confirm:'+document.querySelector('select').value);document.querySelector('#launcher').remove();frame.style.display='';};
 });const result=await f.prepare();assert.equal(result.ok,true,result.error);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS','expand']);await f.page.close();
});
test('a hidden duplicate launcher control does not block the visible confirmation',async()=>{
 const f=await fixture(launcher());await f.page.evaluate(()=>{const clone=document.createElement('button');clone.textContent='Jeu réel';clone.style.display='none';document.querySelector('#launcher').append(clone);});const result=await f.prepare();assert.equal(result.ok,true,result.error);assert.deepEqual(await f.page.evaluate(()=>window.steps),['confirm:ARS','expand']);await f.page.close();
});
