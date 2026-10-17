import * as React from 'react';
function eventMarkup(html:string):React.ReactNode {
 if(typeof document==='undefined')return html.replace(/<[^>]*>/g,'');
 const template=document.createElement('template');template.innerHTML=html;
 const walk=(node:Node,key:string):React.ReactNode=>{
  if(node.nodeType===3)return node.textContent;
  if(node.nodeType!==1)return null;
  const tag=(node as Element).tagName.toLowerCase();
  if(['script','style','iframe','object','svg','math'].includes(tag))return null;
  const children=Array.from(node.childNodes).map((child,index)=>walk(child,`${key}-${index}`));
  if(tag==='br')return <br key={key}/>;
  if(['b','strong','em','i','span'].includes(tag))return React.createElement(tag,{key},children);
  return <React.Fragment key={key}>{children}</React.Fragment>;
 };
 return Array.from(template.content.childNodes).map((node,index)=>walk(node,String(index)));
}
export default function ChatEventLine({kind,html}:{kind:'sys'|'recap';html:string}){
 const recap=kind==='recap';
 return <div className={`chat-event-line chat-event-line--${kind}`} style={{alignSelf:recap?'center':'stretch',fontSize:11.5,fontWeight:recap?700:600,
  color:recap?'rgba(255,255,255,.55)':'rgba(180,170,220,.82)',background:recap?'rgba(255,255,255,.04)':'rgba(124,92,252,.07)',
  border:recap?'1px solid rgba(255,255,255,.08)':'1px solid rgba(124,92,252,.14)',padding:'5px 12px',borderRadius:recap?999:9,
  width:recap?'fit-content':undefined,maxWidth:'100%',marginInline:recap?'auto':undefined,overflowWrap:'anywhere'}}>
  {!recap&&<><span style={{opacity:.6}}>🔔</span>{' '}</>}{eventMarkup(html)}
 </div>;
}
