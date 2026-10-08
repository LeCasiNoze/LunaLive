import type {Pool} from 'pg';
import {reservePurchaseUpgrade} from './purchase-upgrades.js';
import {validRumbleIdentity} from './rules.js';
import {resolveSlot} from '../calls/catalog.js';
import {keyText} from '../calls/normalize.js';
import {normalizeProvider} from '../calls/provider_aliases.js';
import {automodProviderAllowed} from '../calls/automod_provider_policy.js';
import {getCallsSettings,isUserBannedFromCalls,isSlotBanned,isProviderBanned,isProviderAllowedByPolicy} from '../calls/queue.js';

export async function handleUpgradeChat(pool:Pool,m:{streamerId:number;userId:string;username:string;messageId:string;text:string;createdAt:Date}){
 if(!/^!upgrade(?:\s|$)/i.test(m.text.trim()))return null;
 if(!validRumbleIdentity(m.userId)||Math.abs(Date.now()-m.createdAt.getTime())>120000)return null;
 const parsed=/^!upgrade\s+(serie|offert)\s+B:([a-zA-Z0-9_-]{1,100})\s+(.{1,160})$/i.exec(m.text.trim());
 if(!parsed)return `@${m.username} — Prépare l’upgrade sur !shop : la commande choisit un bonus supérieur à la place d’un achat, sans achat supplémentaire.`;
 const control=(await pool.query('SELECT runtime_status FROM automod_control WHERE streamer_id=$1',[m.streamerId])).rows[0];
 if(!control?.runtime_status?.supportedFeatures?.includes('purchase-upgrade'))return `@${m.username} — Les upgrades ne sont pas encore disponibles sur cette session.`;
 const slot=await resolveSlot(pool,parsed[3]!);
 if(!slot||keyText(slot.name)!==keyText(parsed[3]!))return `@${m.username} — Machine non reconnue. Utilise le nom complet depuis !shop.`;
 const provider=String(normalizeProvider(slot.provider)??'').toLowerCase();
 const family=automodProviderAllowed(provider,['hacksaw'])?'hacksaw':automodProviderAllowed(provider,['pragmatic'])?'pragmatic':null;
 const settings=await getCallsSettings(pool,m.streamerId);
 if(!family||!settings.enabled||await isUserBannedFromCalls(pool,m.streamerId,0,m.username)||await isSlotBanned(pool,m.streamerId,keyText(slot.name))||await isProviderBanned(pool,m.streamerId,provider)||!await isProviderAllowedByPolicy(pool,m.streamerId,provider))return `@${m.username} — Ce call n’est pas autorisé.`;
 try{
  const result=await reservePurchaseUpgrade(pool,m.streamerId,{userId:m.userId,username:m.username},{messageId:m.messageId,kind:parsed[1]!.toLowerCase()==='serie'?'series':'weekly',offerId:parsed[2]!,slotName:slot.name,slotKey:keyText(slot.name),provider:family});
  return result.created?`@${m.username} — ${slot.name} : upgrade réservé pour ${result.points} points. Il remplace un seul achat ; prix revérifié sur la machine.`:null;
 }catch(e){
  const key=e instanceof Error?e.message:'';
  const messages:Record<string,string>={upgrade_mode_changed:'Le mode a changé. Reprépare ta commande sur !shop.',upgrade_free_entry_required:'Enregistre d’abord ton achat offert avec !offert + nom complet de la slot.',upgrade_already_set:'Un upgrade est déjà prévu pour cet achat.',upgrade_menu_unknown:'Le menu n’a pas encore été découvert à cette mise. Réessaie après une visite de la machine.',upgrade_not_higher:'Ce bonus n’est pas un upgrade disponible à cette mise.',call_limit:'Tu as déjà deux calls en attente.',call_already_started:'Ce call a déjà commencé : choisis ton upgrade avant son passage.',insufficient_points:'Ton solde disponible ne suffit pas. !points pour le consulter.',automod_disabled:'L’Automod est arrêté.',automod_bonus_pending:'Cette machine a un bonus de hunt en attente.'};
  return `@${m.username} — ${messages[key]??'Upgrade non enregistré, réessaie dans un instant.'} Aucun point réservé.`;
 }
}
