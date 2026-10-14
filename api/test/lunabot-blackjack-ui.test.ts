import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { buildBlackjackSvg } from "../src/discord/blackjack-renderer.js";
import { buildBlackjackMessage } from "../src/discord/blackjack.js";
import type { NozeBotBlackjackView } from "../src/services/nozebot_blackjack.js";

export const previewGame: NozeBotBlackjackView = {
  sessionId: "11111111-1111-4111-8111-111111111111", status: "active", mode: "classic",
  dealer: { cards: [{r:"10",s:"♣"},null], total: null },
  hands: [{cards:[{r:"A",s:"♠"},{r:"8",s:"♥"}],total:19,bet:20,doubled:false,finished:false,active:true}],
  sideBetLines: [], actions: {hit:true,stand:true,double:true,split:false}, balance:100,
  cooldownEndsAt:"2026-10-15T12:00:00Z",result:null,
};
test("renderer is copied exactly from Nozbot, with only local type imports changed",async()=>{
  const original=await readFile(new URL("../../bot/src/nozebot/blackjack-renderer.ts",import.meta.url),"utf8");
  const copy=await readFile(new URL("../src/discord/blackjack-renderer.ts",import.meta.url),"utf8");
  assert.equal(copy.replaceAll("\r\n","\n"),original.replaceAll("\r\n","\n").replace('import type { LunaLiveBlackjack, LunaLiveBlackjackCard } from "./lunalive-api.js";',
    'import type { NozeBotBlackjackView as LunaLiveBlackjack } from "../services/nozebot_blackjack.js";\nimport type { Card as LunaLiveBlackjackCard } from "./games_blackjack.js";'));
});
test("message builder and buttons are identical except their routing prefix",async()=>{
  const original=await readFile(new URL("../../bot/src/nozebot/commands.ts",import.meta.url),"utf8");
  const copy=await readFile(new URL("../src/discord/blackjack.ts",import.meta.url),"utf8");
  const expected=original.slice(original.indexOf("function blackjackButtons("),original.indexOf("\nasync function handleBlackjackCommand("))
    .replaceAll("LunaLiveBlackjack","NozeBotBlackjackView").replaceAll("`nz:b:${id}:","`bj:${id}:");
  assert.ok(copy.includes(expected));
});
test("active table masks dealer card and uses the same PNG and four action buttons",async()=>{
  const message=await buildBlackjackMessage(previewGame,"Joueur");
  const embed=message.embeds[0].toJSON();
  assert.equal(embed.title,"Faites vos jeux");
  assert.ok(embed.image?.url.startsWith("attachment://nozebot-blackjack-"));
  const buttons=message.components[0].toJSON().components;
  assert.deepEqual(buttons.map(button=>button.label),["Piocher","Rester","Doubler","Splitter"]);
  assert.deepEqual(buttons.map(button=>button.disabled),[false,false,false,true]);
  const image=message.files[0].attachment as Buffer;
  const metadata=await sharp(image).metadata();
  assert.equal(metadata.width,900);assert.equal(metadata.height,700);
  assert.ok(buildBlackjackSvg(previewGame,"Joueur").includes('>?</text>'));
  if(process.env.BJ_PREVIEW_PATH) await writeFile(process.env.BJ_PREVIEW_PATH,image);
});
test("finished plus table reveals dealer, displays winnings, XP, side bets and locks buttons",async()=>{
  const game: NozeBotBlackjackView={...previewGame,status:"finished",mode:"plus",
    dealer:{cards:[{r:"10",s:"♣"},{r:"7",s:"♦"}],total:17},sideBetLines:["Perfect Pairs : aucun gain"],
    result:{dealerTotal:17,perHand:[{i:1,bet:20,total:19,doubled:false,kind:"win",net:20}],
      mainNet:20,sideNet:-5,totalNet:15,isNaturalBlackjack:false,xpGained:2,balance:115}};
  const message=await buildBlackjackMessage(game,"Joueur");const embed=message.embeds[0].toJSON();
  assert.equal(embed.title,"La table a tranché");assert.equal(embed.color,0x45e0a8);
  assert.ok(embed.description?.includes("+15 Rubis"));assert.ok(embed.description?.includes("+2 XP"));
  assert.ok(embed.fields?.some(field=>field.name==="Side bets"));
  assert.ok(message.components[0].toJSON().components.every(button=>button.disabled));
});
import { pool } from "../src/db.js";
import { startNozeBotBlackjack } from "../src/services/nozebot_blackjack.js";
test("shared sessions cannot be resumed by another guild or linked account",async(t)=>{
  for(const [guild,user,code] of [["other",4,"session_other_guild"],["official",99,"session_forbidden"]] as const){
    await t.test(code,async(st)=>{
      const queries:string[]=[];
      st.mock.method(pool,"connect",async()=>({
        async query(sql:string){queries.push(sql);return {rows:sql.includes("SELECT * FROM nozebot")?[{
          id:previewGame.sessionId,discord_user_id:"player",discord_guild_id:"official",user_id:4,
          game:{},status:"active",mode:"classic",result:null,expires_at:new Date(Date.now()+60000),
        }]:[]};},release(){},
      }));
      await assert.rejects(startNozeBotBlackjack({discordUserId:"player",discordGuildId:guild,userId:user,mode:"classic"}),
        (error:any)=>error.code===code);
      assert.ok(queries.includes("ROLLBACK"));
      assert.ok(!queries.some(sql=>sql.includes("UPDATE users")||sql.includes("INSERT")));
    });
  }
});
