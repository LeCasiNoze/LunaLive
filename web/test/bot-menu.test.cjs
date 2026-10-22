const {test,after}=require('node:test');const assert=require('node:assert/strict');const {chromium}=require('playwright-core');
let browser;after(async()=>browser?.close());
async function page(query='',viewport={width:1366,height:900}){
 if(!browser)browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu','--disable-background-networking']});
 const p=await browser.newPage({viewport});p.on('pageerror',e=>{throw e});
 await p.goto('http://127.0.0.1:4398/test/bot-menu.html'+query,{waitUntil:'networkidle'});
 await p.getByRole('button',{name:'Hunt',exact:true}).click();await p.getByText(query.includes('opening')?'Wanted Dead or a Wild':'Sweet Bonanza',{exact:true}).first().waitFor();return p;
}
test('channel dock stays above the toolbar and outside transformed ancestors; header is draggable',async()=>{
 const p=await page();const grip=p.getByTitle('Glisse pour déplacer');const a=await grip.boundingBox();assert.ok(a.y>=64);
 await p.mouse.move(a.x+60,a.y+24);await p.mouse.down();await p.mouse.move(a.x-240,a.y+115,{steps:8});await p.mouse.up();const b=await grip.boundingBox();assert.ok(b.x<a.x-150);assert.ok(b.y>a.y+50);
 assert.equal(await grip.evaluate(el=>el.closest('main')),null);assert.equal(await p.getByRole('button',{name:'Fermer LunaBot'}).isVisible(),true);await p.close();
});
test('automatic navigation appears only in owner hunt settings',async()=>{
 const p=await page();assert.equal(await p.getByRole('switch').count(),0);await p.getByRole('button',{name:'Paramètres du Hunt'}).click();await p.getByRole('switch').waitFor();assert.equal(await p.getByRole('switch').getAttribute('aria-checked'),'false');await p.screenshot({path:'.runtime/hunt-settings.png'});await p.close();
 for(const q of ['?uid=99','?slug=other','?uid=99&mod=false']){const p=await page(q);if(await p.getByRole('button',{name:'Paramètres du Hunt'}).count())await p.getByRole('button',{name:'Paramètres du Hunt'}).click();assert.equal(await p.getByRole('switch').count(),0);assert.equal(await p.getByText('Extension navigateur').count(),0);await p.close();}
});
test('opening shows opened count and caller instead of provider; unknown gain is not zero',async()=>{
 const p=await page('?opening');await p.getByText('1 / 2',{exact:true}).waitFor();assert.ok(await p.getByText('@Bob',{exact:true}).count());assert.equal(await p.getByText('(Hacksaw)',{exact:true}).count(),0);assert.equal(await p.getByText(/Gain\s*0[.,]00€/).count(),0);await p.screenshot({path:'.runtime/hunt-opening.png'});await p.close();
});
test('viewer has no moderator controls; mobile dock remains inside viewport and wheel stays concise',async()=>{
 const p=await page('?uid=99&mod=false',{width:390,height:844});assert.equal(await p.getByRole('button',{name:'Paramètres du Hunt'}).count(),0);await p.getByRole('button',{name:'Roue',exact:true}).click();await p.getByRole('button',{name:'Rejoindre la roue'}).waitFor();assert.equal(await p.getByText(/TODO|BotMenu désactivée/).count(),0);const close=await p.getByRole('button',{name:'Fermer LunaBot'}).boundingBox();assert.ok(close.x>=0&&close.x+close.width<=390);await p.screenshot({path:'.runtime/wheel-mobile.png'});await p.close();
});
test('predictions show readable closed status and preserve moderator creation dialog',async()=>{
 const viewer=await page('?uid=99&mod=false&prediction');await viewer.getByRole('button',{name:'Prédictions',exact:true}).click();await viewer.getByText('Le hunt sera-t-il gagnant ?').waitFor();await viewer.getByText('• Paris fermés',{exact:true}).waitFor();assert.equal(await viewer.getByRole('button',{name:/Créer une prédiction/}).count(),0);await viewer.close();
 const owner=await page();await owner.getByRole('button',{name:'Prédictions',exact:true}).click();await owner.getByRole('button',{name:/Créer une prédiction/}).click();await owner.getByRole('dialog').waitFor();await owner.getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(await owner.getByRole('dialog').count(),0);await owner.close();
});
test('rain shows reward and participation without redundant scheduling details',async()=>{
 const p=await page('?uid=99&mod=false');await p.getByRole('button',{name:'Rain',exact:true}).click();await p.getByRole('button',{name:'Rejoindre la rain'}).waitFor();assert.equal(await p.getByText(/Fréquence:/).count(),0);assert.ok(await p.getByText(/20 rubis/).count());await p.close();
});
test('detached chat modal escapes transformed content and remains reachable',async()=>{
 const p=await page('?modal&uid=99&mod=false',{width:390,height:844});const close=p.getByRole('button',{name:'Fermer LunaBot'});assert.equal(await close.evaluate(el=>el.closest('main')),null);const b=await close.boundingBox();assert.ok(b.y>=0&&b.y+b.height<844);await p.close();
});
test('floating launcher can be dragged away from the toolbar and restores its position',async()=>{
 const p=await page();await p.route('https://lunalive-api.onrender.com/**',route=>route.abort());await p.routeWebSocket('wss://lunalive-api.onrender.com/**',socket=>socket.close());
 await p.evaluate(()=>localStorage.setItem('lunalive:floating-bot-position:v2',JSON.stringify({xRatio:0,yRatio:0})));
 await p.goto('http://127.0.0.1:4398/test/bot-menu.html?floating');const fab=p.getByRole('button',{name:/Ouvrir le menu LunaBot/});await fab.waitFor();const a=await fab.boundingBox();assert.ok(a.y<64);assert.equal(await fab.evaluate(el=>el.closest('main')),null);
 await p.mouse.move(a.x+28,a.y+28);await p.mouse.down();await p.mouse.move(a.x+280,a.y+260,{steps:8});await p.mouse.up();const b=await fab.boundingBox();assert.ok(b.x>a.x+200&&b.y>a.y+200);
 await p.reload();await fab.waitFor();const c=await fab.boundingBox();assert.ok(Math.abs(c.x-b.x)<3&&Math.abs(c.y-b.y)<3);await fab.click();await p.getByRole('button',{name:'Hunt',exact:true}).waitFor();await p.close();
});
