import type { ChatMsgLike } from './ChatMessageBubble';

export type OverlayMessage = ChatMsgLike & {type?: string; data?: Record<string, any>; isBot?: boolean};
export const ACTIONABLE_TYPES = new Set(['rain','wheel','predict','chest']);
export const CELEBRATION_TYPES = new Set(['raid','follow','combo','sub','don','boss','level']);

export function normalizeOverlayMessage(input: any, slug: string): OverlayMessage | null {
  const p=input?.msg??(typeof input?.message==='object'?input.message:input);
  if(!p||typeof p!=='object')return null;
  const channel=String(input?.slug??p.slug??input?.streamerSlug??p.streamerSlug??input?.channelSlug??'').trim().toLowerCase();
  if(channel&&channel!==slug.toLowerCase())return null;
  const username=String(p.username??p.user?.username??p.user?.displayName??p.user?.name??'user');
  const createdAt=String(p.createdAt??p.created_at??p.ts??new Date().toISOString());
  const userId=Number(p.userId??p.user_id??p.user?.id??0)||0;
  return {id:p.id??p.messageId??`${createdAt}-${userId}-${username}`,userId,username,
    body:String(p.body??p.text??p.message??p.content??''),createdAt,
    avatarUrl:p.avatarUrl??p.avatar_url??p.user?.avatarUrl??null,
    cosmetics:p.cosmetics??p.user?.cosmetics??null,role:p.role??p.user?.role??null,
    isBot:!!p.isBot,rumble:!!p.rumble,rumbleLinked:!!p.rumbleLinked,
    type:typeof p.type==='string'?p.type:undefined,
    data:p.data&&typeof p.data==='object'&&!Array.isArray(p.data)?p.data:undefined};
}
export function mergeOverlayMessages(previous: OverlayMessage[],incoming: OverlayMessage[],max: number) {
  const result=new Map(previous.map(m=>[String(m.id),m]));
  for(const m of incoming)result.set(String(m.id),m);
  return [...result.values()].slice(-max);
}
export function recoverOverlayHistory(history:OverlayMessage[],current:OverlayMessage[],deleted:Set<string>,max:number){
 const merged=mergeOverlayMessages(history,current,Number.MAX_SAFE_INTEGER).filter(message=>!deleted.has(String(message.id)));
 return merged.sort((a,b)=>(Date.parse(a.createdAt)||0)-(Date.parse(b.createdAt)||0)).slice(-max);
}
