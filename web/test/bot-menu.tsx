import React from "react";
import "../src/index.css";
import {createRoot} from "react-dom/client";
import {AuthProvider} from "../src/auth/AuthProvider";
import {BotMenu} from "../src/components/botmenu/BotMenu";
import {FloatingBot} from "../src/components/botmenu/FloatingBot";
const params=new URLSearchParams(location.search);
const uid=Number(params.get("uid")||4), slug=params.get("slug")||"lecasinoze";
const canMod=params.get("mod")!=="false", opening=params.has("opening");
localStorage.setItem("lunalive_token_v1","local-fixture");
const bonuses=[{id:"b1",slotName:"Gems Bonanza",provider:"Pragmatic",username:"Alice",betEur:1,payEur:20},{id:"b2",slotName:"Wanted Dead or a Wild",provider:"Hacksaw",username:"Bob",betEur:2,payEur:null}];
window.fetch=async(input)=>{
 const path=new URL(String(input),location.href).pathname;
 let result:any={ok:true};
 if(path==="/me")result.user={id:uid,username:uid===4?"LeCasiNoze":"Viewer",rubis:2000,role:"viewer"};
 if(path.endsWith("/hunt/state"))result={ok:true,mode:opening?"open":"farm",startEur:100,bonusDrops:bonuses,queue:[],currentCall:{id:"c1",slotName:"Sweet Bonanza",username:"Charlie",provider:"Pragmatic"},currentOpenItem:opening?bonuses[1]:null};
 if(path.includes("bot_wheel/public"))result={ok:true,isLive:true,cfg:{enroll_open:true},me:{joined:false},counts:{entries:12}};
 if(path.includes("bot_rain/public"))result={ok:true,isLive:true,phase:"open",rubiesPerUser:20,participants:7,serverNowMs:Date.now(),joinCloseAtMs:Date.now()+90000};
 if(path.startsWith("/streamers/"))result={ok:true,id:77,isLive:true};
 if(path.includes("predictions/current"))result={ok:true,prediction:params.has("prediction")?{id:1,question:"Le hunt sera-t-il gagnant ?",status:"locked",option1_label:"Oui",option2_label:"Non",total_pool_1:120,total_pool_2:80,bets_close_at:new Date().toISOString()}:null};
 return new Response(JSON.stringify(result),{headers:{"Content-Type":"application/json"}});
};
function Fixture(){const [open,setOpen]=React.useState(true);return <AuthProvider><header style={{position:"fixed",inset:"0 0 auto",height:64,zIndex:1000,background:"#34234e",paddingLeft:30}}>Barre du site — test de superposition</header><main style={{transform:"translateZ(0)",overflow:"hidden",height:200}}>{params.has("floating")?<FloatingBot slug={slug} token="local-fixture" role="streamer" canMod={canMod} onRequireLogin={()=>{}}/>:<BotMenu open={open} onClose={()=>setOpen(false)} slug={slug} token="local-fixture" role={canMod?"streamer":"viewer"} canMod={canMod} onRequireLogin={()=>{}} sendBang={()=>{}} variant={params.has("modal")?"modal":"dock"}/>}</main></AuthProvider>}
createRoot(document.getElementById("root")!).render(<Fixture/>);
