import {CONNECTORS} from '../accounts/index.ts';

/** What Settings › Context shows (issue #674): everything this World keeps, in one place, each kind with how much it holds
 * in plain words. The host reads the sizes (`worldContext`, WorldLedger.contextSizes); memory is read where it lives (Fox's
 * own and the Agents'). Only past conversations are counted; everything else says how much room it takes. */
export interface WorldContextSizes {
 conversations:{count:number;bytes:number};
 services:{provider:string;bytes:number}[];
 journal:{bytes:number};
 agentOutputs:{bytes:number};
 board:{bytes:number};
}
export type WorldContextKind='conversations'|'memory'|'services'|'journal'|'agent-outputs'|'board';
export interface WorldContextRow {id:WorldContextKind;title:string;line:string;amount:string;empty:boolean}
export interface WorldContextService {provider:string;name:string;amount:string}

const UNITS=['KB','MB','GB','TB'];
/** "Nothing yet", "Under 1 KB", "12 KB", "3.4 MB": how much room something takes, in words anyone reads. */
export function contextAmount(bytes:number):string {
 const value=Number.isFinite(bytes)&&bytes>0?bytes:0;
 if(!value)return 'Nothing yet';
 if(value<1024)return 'Under 1 KB';
 let size=value/1024,unit=0;
 while(size>=1024&&unit<UNITS.length-1){size/=1024;unit++;}
 return `${size<10&&unit>0?Math.round(size*10)/10:Math.round(size)} ${UNITS[unit]}`;
}
const total=(list:readonly {bytes:number}[])=>list.reduce((sum,item)=>sum+(Number.isFinite(item.bytes)&&item.bytes>0?item.bytes:0),0);
/** A connected Service's name for its provider ("github" → "GitHub"); the provider itself when no connector names it. */
export function contextServiceName(provider:string):string {
 return CONNECTORS.find(item=>item.providers.includes(provider))?.name??provider;
}
/** Each Service's synced context, the largest first. */
export function worldContextServices(sizes:WorldContextSizes|null):WorldContextService[] {
 return [...sizes?.services??[]].filter(item=>item.bytes>0).sort((a,b)=>b.bytes-a.bytes)
  .map(item=>({provider:item.provider,name:contextServiceName(item.provider),amount:contextAmount(item.bytes)}));
}
/** The rows of Settings › Context, in the order a person thinks of them. `memoryBytes` is what Fox and the Agents
 * remember, read where each keeps it. */
export function worldContextRows(sizes:WorldContextSizes|null,memoryBytes:number):WorldContextRow[] {
 const count=Math.max(0,Math.floor(sizes?.conversations.count??0));
 const row=(id:WorldContextKind,title:string,line:string,bytes:number,amount=contextAmount(bytes)):WorldContextRow=>({id,title,line,amount,empty:!(bytes>0)});
 return [
  row('conversations','Conversations','What you and Fox said, and the conversations your Agents brought in.',sizes?.conversations.bytes??0,
   count?`${count} past ${count===1?'conversation':'conversations'}`:'None yet'),
  row('memory','Memory','What Fox and your Agent remember about you and your work.',memoryBytes),
  row('services','From your services','The latest from the services you connected, kept up to date in your World.',total(sizes?.services??[])),
  row('journal','Journal','The cards Fox made for you, kept day by day.',sizes?.journal.bytes??0),
  row('agent-outputs','What your Agents saved','Reports and pages your Agents saved to your Journal.',sizes?.agentOutputs.bytes??0),
  row('board','Board','The numbers your board tracks and where it reads them.',sizes?.board.bytes??0,sizes?.board.bytes?contextAmount(sizes.board.bytes):'Not set up'),
 ];
}
/** The host's answer, checked: null when it keeps no context of the person's own (the practice world) or said nothing. */
export function readWorldContextSizes(value:unknown):WorldContextSizes|null {
 const v=value as any;
 if(!v||typeof v!=='object'||v.available!==true)return null;
 const n=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&x>0?x:0;
 return {conversations:{count:n(v.conversations?.count),bytes:n(v.conversations?.bytes)},
  services:Array.isArray(v.services)?v.services.filter((s:any)=>typeof s?.provider==='string'&&s.provider).map((s:any)=>({provider:s.provider,bytes:n(s.bytes)})):[],
  journal:{bytes:n(v.journal?.bytes)},agentOutputs:{bytes:n(v.agentOutputs?.bytes)},board:{bytes:n(v.board?.bytes)}};
}
