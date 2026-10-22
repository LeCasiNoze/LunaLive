const {test}=require("node:test");const assert=require("node:assert/strict");const vm=require("node:vm");const fs=require("node:fs");const path=require("node:path");
const context=vm.createContext({URL});vm.runInContext(fs.readFileSync(path.join(__dirname,"../core.js"),"utf8"),context);const rules=context.LunaSlotRules;
test("only the exact HTTPS casino domains and their subdomains are recognized",()=>{
 for(const [url,name] of [["https://shuffle.com/games/a","Shuffle"],["https://www.celsiuscasino.co/fr","Celsius"],["https://celsiuscasino.com/","Celsius"]])assert.equal(rules.casino(url),name);
 for(const u of ["http://shuffle.com","https://shuffle.com.evil.test","https://evilshuffle.com","https://betportal.com","invalid"])assert.equal(rules.casino(u),null);
});
test("LunaLive pages are exact trusted origins, never arbitrary onrender apps",()=>{
 assert.ok(rules.luna("https://lunalive.win/hunt"));assert.ok(rules.luna("http://localhost:5173"));
 assert.equal(rules.luna("https://attacker.onrender.com"),false);assert.equal(rules.luna("https://lunalive.win.evil.test"),false);
});
test("an explicit tab wins; ambiguity never silently picks the first casino",()=>{
 const tabs=[{id:1,url:"https://shuffle.com"},{id:2,url:"https://celsiuscasino.com"}];
 assert.equal(rules.chooseTab(tabs,2).id,2);assert.throws(()=>rules.chooseTab(tabs,99),/Plusieurs/);
 assert.equal(rules.chooseTab(tabs.slice(0,1)).id,1);assert.throws(()=>rules.chooseTab([{id:3,url:"https://example.com"}]),/Ouvre/);
});
test("slot names are normalized without fuzzy matching, bounded and tied to a call ID",()=>{
 assert.equal(rules.normalize("Géms — Bonanza!"),"gems bonanza");assert.notEqual(rules.normalize("Wanted"),rules.normalize("Wanted Dead or a Wild"));
 assert.ok(rules.validSlot({callId:"32",name:"Gems Bonanza"}));
 for(const s of [null,{}, {name:"a",callId:32},{name:"x".repeat(181),callId:"1"},{name:"",callId:"1"}])assert.equal(rules.validSlot(s),false);
});