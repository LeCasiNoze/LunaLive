import React from "react";
import {createRoot} from "react-dom/client";
import {HuntTabs} from "../src/components/botmenu/HuntTabs";
const fixture=window as any;
fixture.queue=[{id:"1",slotName:"Wanted Dead or a Wild",provider:"Hacksaw"},{id:"2",slotName:"Gems Bonanza",provider:"Pragmatic"},{id:"3",slotName:"Starlight Princess",provider:"Pragmatic"}];
fixture.bonuses=[];fixture.navigations=[];fixture.fail=false;fixture.delay=0;fixture.requests=[];
window.fetch=async(input,init)=>{
 const path=new URL(String(input),location.href).pathname;fixture.requests.push({path,method:init?.method});
 if(fixture.delay && init?.method==="POST")await new Promise(r=>setTimeout(r,fixture.delay));
 if(fixture.fail && path.endsWith("/pass"))return new Response(JSON.stringify({error:"test_failure"}),{status:500});
 let result:any={ok:true};
 if(path.endsWith("/pass") && init?.method==="POST")result.removedId=fixture.queue.shift()?.id;
 if(path.endsWith("/bonus") && init?.method==="POST"){const bonus=fixture.queue.shift();if(bonus){fixture.bonuses.push({...bonus,betEur:0.2,payEur:null});result.bonusId=bonus.id;}}
 if(path.endsWith("/state"))result={ok:true,mode:fixture.opening?"open":"farm",currentCall:fixture.staleCall || fixture.queue[0]||null,queue:fixture.queue,bonusDrops:fixture.bonuses,startEur:500,callsCount:fixture.queue.length};
 return new Response(JSON.stringify(result),{status:200,headers:{"Content-Type":"application/json"}});
};
window.addEventListener("message",event=>{
 const m=event.data;if(m?.channel!=="lunalive-hunt-slots-v1" || m.direction!=="request")return;
 if(m.type==="open")fixture.navigations.push(m.slot);
 window.postMessage({channel:m.channel,direction:"response",id:m.id,ok:!(fixture.navigationFail && m.type==="open"),message:m.type==="enable"?"Shuffle prêt.":m.type==="open"?"Ouverture demandée : "+m.slot.name:"Désactivé."},location.origin);
});
function Fixture(){
 const [mounted,setMounted]=React.useState(true);
 fixture.setMounted=setMounted;
 return <div style={{maxWidth:920,margin:"30px auto"}}><h1>Hunt personnel — test local</h1>{mounted&&<HuntTabs token="fixture-not-a-real-token" streamerSlug="fixture" canModerate={true} canNavigateSlots={true}/>}</div>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Fixture/></React.StrictMode>);
