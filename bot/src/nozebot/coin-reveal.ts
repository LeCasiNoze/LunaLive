export function coinRevealFrames(raw:string){
 const art=raw.replaceAll('0','O');
 const frames=['[??? ???]'];
 if(art==='MAX WIN')return [...frames,'[MAX WIN]'];
 if(!/^(O{0,6}X{0,6}|777777)$/.test(art)||art.length!==6)throw Error('bad_slot_art');
 for(let i=0;i<6;i++){
  const stopped=art[i]==='X';
  const value=art.slice(0,i+1)+(stopped?'X':'?').repeat(5-i);
  frames.push(`[${value.slice(0,3)} ${value.slice(3)}]`);
  if(stopped)break;
 }
 return frames;
}
export async function revealCoinSlot(edit:(text:string)=>Promise<unknown>,art:string,final:string,wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))){
 const frames=coinRevealFrames(art);
 for(const frame of frames.slice(0,-1)){await edit(`**${frame}**`);await wait(950);}
 await edit(final);
}
