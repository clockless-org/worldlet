import crypto from 'node:crypto';
import {CHANNEL_REPLY,channelReplyText,isMigrationSource} from '../../../../../core/agent/index.ts';
import {conversationAttentionId,ongoingName} from '../../../../../core/tasks/index.ts';
import {WorldletError} from '../../files.ts';
import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';

// Replying in a channel (core/agent/PORTABILITY.md#replying-in-a-channel): Fox offers a reply in the Discord channel or
// Telegram chat a brought conversation came from (`reply_in_channel`), and the person's own Agent sends it through its
// Harness's `send` service (contracts/harness-services.ts), only after the person pressed Send on the exact text shown.
// The offer is a card in Fox (ui/companion/fox-channel-reply.ts): Send, Edit, Skip. A conversation whose Agent declares
// no `send`, or whose thread it cannot send to, is not offered. Nothing here knows a Harness by name.

type Offer={id:string;source:string;thread:string;session:string;where:string;text:string;at:number};

export function installChannelReplies(host:Host){
 const {store,page}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const offers=new Map<string,Offer>();
 const sender=(source:string)=>host.optional<AgentService>(AGENT)?.channelSend?.(source)??null;
 /** The brought conversation Fox named: its name as Attention and the archive show it, or its Attention source ID. */
 function conversation(named:string):{source:string;session:string}|null {
  const wanted=named.trim().toLowerCase();
  if(!wanted)return null;
  const all=store.ledger().broughtConversations();
  return all.find(c=>c.session.toLowerCase()===wanted||conversationAttentionId(c.source,c.session)===named.trim())
   ??all.find(c=>ongoingName(c.source,c.session).title.toLowerCase()===wanted.replace(/^[“"]|[”"]$/g,''))??null;
 }
 const settle=(offer:Offer,settled:'sent'|'skipped',extra:Row={})=>{offers.delete(offer.id);page.event('worldlet:channel-reply',{id:offer.id,settled,where:offer.where,...extra});};
 host.register({
  channelReply:async request=>{
   const operation=String(request.operation??'');
   if(operation==='prepare'){
    if(!own())throw new WorldletError('The practice world has no channels to reply in.');
    const said=channelReplyText(request.text);
    if('error' in said)return {error:said.error};
    const found=conversation(String(request.conversation??''));
    if(!found||!isMigrationSource(found.source))return {error:'No brought conversation has that name. Use the conversation’s name exactly as read_companion_archive or Attention shows it.'};
    const send=sender(found.source);
    if(!send)return {error:'This conversation’s Agent cannot send messages from Worldlet. Tell the person they can reply where the conversation is.'};
    let route=null;
    for(const thread of store.ledger().historyThreads(found.source,found.session)){route=await send.route(thread);if(route)break;}
    if(!route)return {error:'Its Agent cannot send into this conversation (it is not a channel it delivers to). Tell the person they can reply where the conversation is.'};
    const now=Date.now();
    for(const [id,offer] of offers)if(now-offer.at>CHANNEL_REPLY.waitMs)offers.delete(id);
    const name=ongoingName(found.source,found.session);
    const offer:Offer={id:'reply-'+crypto.randomUUID(),source:found.source,thread:route.thread,session:found.session,where:route.where+' · '+name.title,text:said.text,at:now};
    offers.set(offer.id,offer);
    page.event('worldlet:channel-reply',{id:offer.id,where:offer.where,text:offer.text});
    return {ok:true,status:'user_review',where:offer.where,message:'The person sees this exact reply with Send, Edit and Skip. Nothing is sent until they press Send; do not say it was sent.'};
   }
   const offer=typeof request.id==='string'?offers.get(request.id):undefined;
   if(!offer)throw new WorldletError('This reply is no longer waiting.');
   if(operation==='skip'){settle(offer,'skipped');return {ok:true};}
   if(operation!=='send')throw new WorldletError('Unknown request.');
   // The text the person sent from the card: the offer, or their edit of it.
   const said=channelReplyText(request.text);
   if('error' in said)throw new WorldletError(said.error);
   const send=sender(offer.source);
   if(!send)throw new WorldletError('This conversation’s Agent can no longer send from Worldlet.');
   const result=await send.send(offer.thread,said.text).catch(error=>{throw new WorldletError(String(error?.message||'Your Agent could not send it.').slice(0,300));});
   settle(offer,'sent');
   return {ok:true,...result};
  },
 });
 return {offers:()=>[...offers.values()]};
}
