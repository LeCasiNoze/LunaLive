const {test,after}=require("node:test");const assert=require("node:assert/strict");const path=require("node:path");const {chromium}=require("playwright-core");
let browser;
after(async()=>{await browser?.close();});
async function fixture(html,casino="shuffle"){
 if(!browser)browser=await chromium.launch({executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-background-networking","--disable-gpu"]});
 const page=await browser.newPage();
 const host=casino==="shuffle"?"shuffle.com":"celsiuscasino.co";
 await page.route("**/*",route=>route.fulfill({contentType:"text/html",body:html}));
 await page.goto("https://"+host+"/games/old");
 await page.evaluate(()=>{window.chrome={runtime:{onMessage:{addListener:fn=>{window.receiveSlot=fn;}}}};window.selected=[];document.addEventListener("click",e=>{const a=e.target.closest("a");if(a){e.preventDefault();window.selected.push(a.getAttribute("href"));}});});
 await page.addScriptTag({path:path.join(__dirname,"../core.js")});await page.addScriptTag({path:path.join(__dirname,"../casino.js")});
 const message=slot=>page.evaluate(slot=>new Promise(resolve=>window.receiveSlot({type:"open",slot},{},resolve)),slot);
 return {page,message};
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