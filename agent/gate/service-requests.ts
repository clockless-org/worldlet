// An Agent's first need of a Service (agent/gate/GRANTS.md#when-an-agent-first-needs-a-service): when its `read_service`
// call is refused because it may not read that Service, or the Service is not connected, the host asks the person once
// on an Attention card from provider `agents`, written with no model, at most once a day for that Agent and Service.
// Allow gives the Agent the Service's read Grant (`serviceReadGrant`); Connect signs in to the Service first. Pure
// rules; the host keeps the requests beside their items (agent-runtime/service-requests.ts).
import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import {SERVICE_PROVIDERS} from '../../contracts/services.ts';
import type {WorldItem} from '../../contracts/world.ts';

/** `pending` waits on the person; `allowed` (Allow, or Connect then Allow) and `declined` (Not now) are answered. */
export type ServiceRequestStatus='pending'|'allowed'|'declined';
/** One Agent's request for one Service. `connected`: whether the Service was connected when it asked (Allow), or not
 * (Connect). `askedAt` is when the card was last put in Attention, so the next one waits a day. */
export interface ServiceRequest {v:1;id:string;agentId:string;agentName:string;provider:string;connected:boolean;status:ServiceRequestStatus;askedAt:string;updatedAt:string}
/** A card for the same Agent and Service is put in Attention at most once in this long. */
export const SERVICE_REQUEST_EVERY_MS=86_400_000;
export const SERVICE_REQUEST_REASONS=Object.freeze({
 unknown:'That request is no longer waiting.',
 notConnected:'Connect it first, then allow it.',
});
/** The request for this Agent and Service: one per pair, answered or not. */
export const serviceRequestId=(agentId:string,provider:string)=>`${agentId}.${provider}`;
export const serviceRequestItemId=(id:string)=>'service-request:'+id;
const ITEM_STATUS:Record<ServiceRequestStatus,'open'|'done'|'dismissed'>={pending:'open',allowed:'done',declined:'dismissed'};
const name=(value:unknown,fallback:string)=>{const text=typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim():'';return [...(text||fallback)].slice(0,80).join('');};

/** A stored request as it was kept, or null. */
export function readServiceRequest(value:unknown):ServiceRequest|null {
 const v=value as ServiceRequest;
 if(!v||typeof v!=='object'||v.v!==1||typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!SERVICE_PROVIDERS.includes(v.provider)||v.id!==serviceRequestId(v.agentId,v.provider))return null;
 if(!['pending','allowed','declined'].includes(v.status)||typeof v.askedAt!=='string'||!Number.isFinite(Date.parse(v.askedAt)))return null;
 return {v:1,id:v.id,agentId:v.agentId,agentName:name(v.agentName,v.agentId),provider:v.provider,connected:v.connected===true,status:v.status,askedAt:v.askedAt,updatedAt:typeof v.updatedAt==='string'?v.updatedAt:v.askedAt};
}

/** The request to put in Attention now for this refused read, or null when none is due: one the person already
 * answered or that is still waiting counts for a day from when it was asked. A request whose Service got connected
 * meanwhile asks again as Allow. */
export function serviceRequestDue(previous:ServiceRequest|null,agent:{id:string;name:string},provider:string,connected:boolean,now:string):ServiceRequest|null {
 if(!AGENT_ID_PATTERN.test(agent.id)||!SERVICE_PROVIDERS.includes(provider))return null;
 const at=Date.parse(now);
 if(previous&&Date.parse(previous.askedAt)+SERVICE_REQUEST_EVERY_MS>at&&!(previous.status==='pending'&&!previous.connected&&connected))return null;
 return {v:1,id:serviceRequestId(agent.id,provider),agentId:agent.id,agentName:name(agent.name,agent.id),provider,connected,status:'pending',askedAt:now,updatedAt:now};
}

/** The person's answer: Allow (the Service must be connected now) or Not now. */
export function answerServiceRequest(request:ServiceRequest|null|undefined,outcome:'allow'|'decline',connected:boolean,now:string):ServiceRequest {
 if(!request||request.status!=='pending')throw new Error(SERVICE_REQUEST_REASONS.unknown);
 if(outcome==='allow'&&!connected)throw new Error(SERVICE_REQUEST_REASONS.notConnected);
 return {...request,connected:request.connected||connected,status:outcome==='allow'?'allowed':'declined',updatedAt:now};
}

/** The request's Attention card: "Claude Code wants to look at your PostHog." with Allow and Not now, or, when it is not
 * connected, "Claude Code wants to use Cloudflare. It isn't connected yet." with Connect Cloudflare. `title` is the
 * Service's own name; `signIn`: the Service connects with its own sign-in from the card (context/connectors/connectors.ts),
 * landing in `region`, where its Thing lives; otherwise the card sends the person to Settings › Connectors. */
export function serviceRequestItem(request:ServiceRequest,title:string,{signIn=true,region}:{signIn?:boolean;region?:string}={}):WorldItem {
 const agent=request.agentName,service=name(title,request.provider);
 const heading=request.connected?`${agent} wants to look at your ${service}.`:`${agent} wants to use ${service}. It isn't connected yet.`;
 const summary=request.connected
  ?`Allow lets ${agent} look at your ${service} when it needs to. Before anything is changed, Worldlet asks you. You can change this in Settings › Connectors.`
  :signIn?`Connect ${service} signs you in with ${service}'s own page, then lets ${agent} look at it. Before anything is changed, Worldlet asks you.`
  :`Connect ${service} in Settings › Connectors, then come back and allow ${agent} to look at it. Before anything is changed, Worldlet asks you.`;
 return {id:serviceRequestItemId(request.id),provider:AGENT_ASK_PROVIDER,kind:'task',status:ITEM_STATUS[request.status],title:heading,context:summary,summary,
  reason:[...`${agent} asks to look at ${service}`].slice(0,56).join(''),attentionContentVersion:1,attentionReason:summary,
  sources:[{provider:AGENT_ASK_PROVIDER,id:request.id,quote:heading}],
  agentId:request.agentId,agentName:agent,serviceRequestId:request.id,serviceRequestProvider:request.provider,serviceRequestService:service,
  serviceRequestConnected:request.connected,serviceRequestSignIn:signIn,...region&&/^[a-z][a-z0-9-]{0,31}$/.test(region)?{serviceRequestRegion:region}:{},serviceRequestStatus:request.status,createdAt:request.askedAt,updatedAt:request.updatedAt} as WorldItem;
}

/** What the refused call says after its reason, so the Agent knows the person was asked and can try again later. */
export function serviceRequestRefusal(title:string,connected:boolean,asked:boolean):string {
 const service=name(title,'this Service');
 if(!asked)return ` The person was already asked about ${service} in their Attention Center; try again after they answer.`;
 return connected?` Worldlet asked the person in their Attention Center to let you read ${service}; try again after they answer.`
  :` ${service} is not connected. Worldlet asked the person in their Attention Center to connect it; try again after they answer.`;
}
