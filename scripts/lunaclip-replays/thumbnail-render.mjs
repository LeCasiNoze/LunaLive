// Native HTML template: real frame inserts remain unaltered; only layout/type
// change. No generated payout or fabricated game is ever added to a replay.
import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright-core';
const [requestFile]=process.argv.slice(2);const r=JSON.parse(fs.readFileSync(requestFile,'utf8'));
const root=path.dirname(path.resolve(requestFile));
const image=(p)=>{const f=path.resolve(p);if(!f.startsWith(root+path.sep))throw Error('thumbnail_image_outside_folder');return 'data:image/jpeg;base64,'+fs.readFileSync(f).toString('base64');};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(!Number.isSafeInteger(r.number)||r.number<1)throw Error('invalid_vod_number');
const face=r.face?`<div class="face"><img src="${image(r.face)}"></div>`:'';
const html=`<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;overflow:hidden;background:#0f071b;color:white;font-family:Arial,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(ellipse at 90% 12%,#a51b4b80,transparent 55%),linear-gradient(125deg,#17071f,#41143d 52%,#080915)}
.slash{position:absolute;width:900px;height:850px;transform:rotate(22deg);background:linear-gradient(160deg,#ff003075,#6318da22);left:660px;top:-100px;border-left:5px solid #ffbc43}
.game{position:absolute;left:38px;top:128px;width:${r.face?785:1200}px;height:445px;border:4px solid #ffb73d;border-radius:22px;overflow:hidden;box-shadow:0 0 45px #fa60444a;transform:rotate(-3deg)}
.game img{width:100%;height:100%;object-fit:cover}.second{position:absolute;bottom:34px;left:40px;width:290px;height:165px;border:3px solid white;border-radius:14px;overflow:hidden;transform:rotate(3deg);box-shadow:0 5px 20px #000}.second img{width:100%;height:100%;object-fit:cover}
.face{position:absolute;right:22px;top:92px;width:435px;height:542px;border:4px solid #fff1c8;border-radius:30px;overflow:hidden;transform:rotate(3deg);box-shadow:0 0 36px #ffb12a88;background:#170921}.face img{width:100%;height:100%;object-fit:cover}
.label{position:absolute;left:30px;top:18px;font-size:92px;font-weight:1000;font-style:italic;letter-spacing:-4px;text-shadow:5px 6px #120614;background:#bf123c;padding:0 24px;transform:skew(-8deg)}
.brand{position:absolute;right:24px;top:28px;font-size:30px;letter-spacing:2px;font-weight:bold}.bottom{position:absolute;left:350px;bottom:44px;font-size:46px;line-height:1;font-weight:1000;font-style:italic;text-shadow:3px 4px #1d0718;background:#16091ee8;padding:16px 22px;border-left:7px solid #ffb73d}.date{position:absolute;bottom:10px;right:30px;font-size:24px;letter-spacing:3px;color:#ffe1a7}
</style><div class="bg"></div><div class="slash"></div><div class="game"><img src="${image(r.game)}"></div>${face}${r.second?`<div class="second"><img src="${image(r.second)}"></div>`:''}<div class="label">VOD #${r.number}</div><div class="brand">LeCasiNoze</div><div class="bottom">LA REDIFF<br>COMPLÈTE</div><div class="date">${esc(r.date)}</div>`;
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});await page.setContent(html);await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()));await document.fonts.ready;});await page.screenshot({path:path.join(root,'thumbnail.jpg'),type:'jpeg',quality:94});}finally{await browser.close();}
