const {test,after}=require("node:test");const assert=require("node:assert/strict");const {chromium}=require("playwright-core");
let browser;
after(async()=>browser?.close());
async function fixture(){
 if(!browser)browser=await chromium.launch({executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true,args:["--disable-background-networking","--disable-gpu"]});
 const page=await browser.newPage();await page.goto(process.env.HUNT_NAV_TEST_URL || "http://127.0.0.1:4397/test/hunt-slot-navigation.html",{waitUntil:"domcontentloaded",timeout:60000});await page.getByRole("button",{name:"Pass",exact:true}).waitFor();await page.getByRole("button",{name:"Paramètres du Hunt",exact:true}).click();return page;
}
test("OFF is the default and a successful Pass does not navigate",async()=>{
 const p=await fixture();assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"false");await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText("Gems Bonanza",{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.navigations.length),0);await p.close();
});
test("ON then Pass opens the next confirmed call, not the removed one",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText("Ouverture demandée : Gems Bonanza",{exact:true}).waitFor();assert.deepEqual(await p.evaluate(()=>window.navigations.map(n=>[n.callId,n.name])),[["2","Gems Bonanza"]]);await p.close();
});
test("Bonus waits for bet confirmation before opening the next call",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();await p.getByRole("button",{name:"Bonus",exact:true}).click();assert.equal(await p.evaluate(()=>window.navigations.length),0);
 await p.getByPlaceholder("Ex. 0,30 €").fill("0.2");await p.getByRole("button",{name:"Valider",exact:true}).click();await p.getByText("Ouverture demandée : Gems Bonanza",{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.navigations.length),1);await p.close();
});
test("API failure never changes the casino",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();await p.evaluate(()=>window.fail=true);await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText(/test_failure/).waitFor();assert.equal(await p.evaluate(()=>window.navigations.length),0);await p.close();
});
test("switching OFF while the server confirms Pass prevents late navigation",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();await p.evaluate(()=>window.delay=450);await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByRole("switch").click();await p.getByText("Gems Bonanza",{exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.navigations.length),0);assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"false");await p.close();
});

test("a stale state containing the removed call never opens that slot again",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 await p.evaluate(()=>window.staleCall=window.queue[0]);await p.getByRole("button",{name:"Pass",exact:true}).click();
 await p.waitForFunction(()=>window.queue.length===2);await p.waitForFunction(()=>[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Pass"&&!b.disabled));
 assert.equal(await p.evaluate(()=>window.navigations.length),0);await p.close();
});

async function remount(p){
 await p.evaluate(()=>window.setMounted(false));
 await p.getByRole("button",{name:"Paramètres du Hunt",exact:true}).waitFor({state:"detached"});
 await p.evaluate(()=>window.setMounted(true));
 await p.getByRole("button",{name:"Paramètres du Hunt",exact:true}).click();
}
test("ON survives closing settings and remounting the Hunt menu",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 await p.getByRole("button",{name:"Paramètres du Hunt",exact:true}).click();await p.getByRole("button",{name:"Paramètres du Hunt",exact:true}).click();
 assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"true");
 await remount(p);await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"true");
 assert.equal(await p.evaluate(()=>window.navigations.length),0);
 await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText("Ouverture demandée : Gems Bonanza",{exact:true}).waitFor();await p.close();
});
test("opening retains the switch and explicit OFF stays OFF after remount",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 await p.evaluate(()=>window.opening=true);await remount(p);
 assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"true");
 assert.equal(await p.evaluate(()=>window.navigations.length),0);
 await p.getByRole("switch").click();assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"false");
 await remount(p);assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"false");await p.close();
});
test("a casino error preserves ON and the next Pass can retry",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 await p.evaluate(()=>window.navigationFail=true);await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText("Ouverture demandée : Gems Bonanza",{exact:true}).waitFor();
 assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"true");
 await p.evaluate(()=>window.navigationFail=false);await p.getByRole("button",{name:"Pass",exact:true}).click();await p.getByText("Ouverture demandée : Starlight Princess",{exact:true}).waitFor();
 assert.equal(await p.evaluate(()=>window.navigations.length),2);await p.close();
});
test("ON survives a page reload without opening a slot on its own",async()=>{
 const p=await fixture();await p.getByRole("switch").click();await p.getByText("Shuffle prêt.",{exact:true}).waitFor();
 await p.reload({waitUntil:"domcontentloaded"});await p.getByRole("button",{name:"Paramètres du Hunt",exact:true}).click();
 await p.getByText("Shuffle prêt.",{exact:true}).waitFor();assert.equal(await p.getByRole("switch").getAttribute("aria-checked"),"true");
 assert.equal(await p.evaluate(()=>window.navigations.length),0);await p.close();
});
