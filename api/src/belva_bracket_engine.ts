// Bracket du tournoi de Belva : élimination directe, finale en BO3.
// Seuls le tirage (ordre mélangé des joueurs) et les gains saisis sont stockés : tout le reste se recalcule,
// donc corriger un gain sur la page staff refait automatiquement la suite du bracket.
export type Leg={a:number|null;b:number|null};
export type MatchStatus='waiting'|'ready'|'live'|'done'|'bye';
export type Match={key:string;round:number;idx:number;a:string|null;b:string|null;bestOf:number;legs:Leg[];winsA:number;winsB:number;winner:string|null;loser:string|null;status:MatchStatus};
export type Current={key:string;leg:number;side:'a'|'b';player:string;opponent:string};
export type Bracket={size:number;rounds:number;matches:Match[];current:Current|null;champion:string|null;places:Record<string,number>;wins:Record<string,number>};

export const matchKey=(round:number,idx:number)=>`${round}-${idx}`;
const nextPow2=(n:number)=>{let p=2;while(p<n)p*=2;return p;};

export function computeBracket(draw:string[],legs:Record<string,Leg[]>):Bracket{
  const n=draw.length,size=nextPow2(Math.max(2,n)),rounds=Math.log2(size),half=size/2;
  const matches:Match[]=[];const byKey=new Map<string,Match>();
  const wins:Record<string,number>={};
  for(let r=1;r<=rounds;r++){
    const count=size/2**r;
    for(let i=0;i<count;i++){
      let a:string|null,b:string|null;
      if(r===1){a=draw[i]??null;b=half+i<n?draw[half+i]!:null;}
      else{a=byKey.get(matchKey(r-1,2*i))?.winner??null;b=byKey.get(matchKey(r-1,2*i+1))?.winner??null;}
      const bestOf=r===rounds?3:1,need=Math.ceil(bestOf/2);
      const m:Match={key:matchKey(r,i),round:r,idx:i,a,b,bestOf,legs:[],winsA:0,winsB:0,winner:null,loser:null,status:'waiting'};
      if(r===1&&a&&!b){m.winner=a;m.status='bye';}
      else if(a&&b){
        for(const leg of legs[m.key]??[]){
          m.legs.push(leg);
          if(leg.a===null||leg.b===null)break;
          if(leg.a>leg.b)m.winsA++;else if(leg.b>leg.a)m.winsB++;   // égalité : on rachète, la manche ne compte pas
          if(m.winsA>=need||m.winsB>=need)break;
        }
        if(m.winsA>=need){m.winner=a;m.loser=b;}else if(m.winsB>=need){m.winner=b;m.loser=a;}
        m.status=m.winner?'done':m.legs.some(l=>l.a!==null||l.b!==null)?'live':'ready';
        if(m.winner)wins[m.winner]=(wins[m.winner]??0)+1;
      }
      matches.push(m);byKey.set(m.key,m);
    }
  }
  const final=byKey.get(matchKey(rounds,0))!;
  const places:Record<string,number>={};
  for(const m of matches)if(m.loser)places[m.loser]=m.round===rounds?2:2**(rounds-m.round)+1;
  if(final.winner)places[final.winner]=1;
  const open=matches.find(m=>m.status==='ready'||m.status==='live');
  let current:Current|null=null;
  if(open){
    const k=open.legs.findIndex(l=>l.a===null||l.b===null);
    const leg=k<0?open.legs.length:k,l=open.legs[leg];
    const side:'a'|'b'=l&&l.a!==null?'b':'a';
    current={key:open.key,leg,side,player:side==='a'?open.a!:open.b!,opponent:side==='a'?open.b!:open.a!};
  }
  return {size,rounds,matches,current,champion:final.winner,places,wins};
}

// Saisit le gain du bonus en cours et renvoie les nouveaux gains stockés.
export function applyGain(draw:string[],legs:Record<string,Leg[]>,cents:number):{legs:Record<string,Leg[]>;played:Current}|null{
  const cur=computeBracket(draw,legs).current;if(!cur)return null;
  const list=(legs[cur.key]??[]).map(l=>({...l}));
  while(list.length<=cur.leg)list.push({a:null,b:null});
  list[cur.leg]![cur.side]=cents;
  return {legs:{...legs,[cur.key]:list},played:cur};
}

export const roundName=(round:number,rounds:number)=>round===rounds?'Finale':round===rounds-1?'Demi-finales':round===rounds-2?'Quarts de finale':round===rounds-3?'Huitièmes de finale':`Tour ${round}`;
