import crypto from 'node:crypto';
import {WEB_RECORD,webSearchPlan,webTranscript,clip,cleanHeaders,cleanMessage,cleanRequestBody,cleanResponseBody,cleanWebAddress,continuesVisit,keptRequest,keptResponse,privateWebAddress,scrubCards,secretField,webSite,type WebRecord,type WebRecordKind} from '../../../../../core/browser/index.ts';
import {WorldletError} from '../../files.ts';
import type {Row} from '../../host/types.ts';

const pageKey=(url:string)=>String(url??'').split('#')[0];

/** The page a recorder follows: its visible document and a DevTools command to it. */
export interface RecordedPage {readonly url:string;readonly title:string;cdp(method:string,params?:Row,timeoutSeconds?:number):Promise<Row>}
export interface RecordedVisit {id:string;site:string;url:string;title:string;applet:string;startedAt:number;endedAt:number}
export type RecordSink=(visits:RecordedVisit[],records:(WebRecord&{visit:string})[])=>void;

/** What one website page does, kept as it happens (core/browser/web-record.ts decides what is kept):
 * network responses and requests, WebSocket and event-stream messages from DevTools, and the page's
 * text, typing and clicks from the isolated observer (`web-record.js`). Records join a visit, one stay
 * on one site; they are saved in small batches and never hold up the page. Native IO only. */
export class WebRecorder {
 private visit:(RecordedVisit&{lastAt:number})|null=null;
 private requests=new Map<string,Row>();
 private sockets=new Map<string,string>();
 private queue:(WebRecord&{visit:string})[]=[];
 private touched=new Map<string,RecordedVisit>();
 private reading=0;
 // The page (address without fragment) whose observer found a password, card or code field: nothing
 // more is kept from it until the page navigates elsewhere.
 private privatePage:string|null=null;
 private timer:NodeJS.Timeout|null=null;
 private closed=false;
 private readonly page:RecordedPage;
 private readonly sink:RecordSink;
 private readonly options:{applet:string;now?:()=>number;onError?:(error:unknown)=>void};
 constructor(page:RecordedPage,sink:RecordSink,options:{applet:string;now?:()=>number;onError?:(error:unknown)=>void}){this.page=page;this.sink=sink;this.options=options;}
 private now(){return this.options.now?.()??Date.now()/1000;}

 /** Whether records about `url` are kept at all. */
 private allowed(url:string){
  const site=webSite(url);
  return !!site&&!privateWebAddress(url);
 }
 private visitFor(url:string,title=''):RecordedVisit|null {
  const at=this.now(),site=webSite(url);
  if(!this.allowed(url))return null;
  if(!continuesVisit(this.visit,site,at)){
   this.visit={id:crypto.randomUUID(),site,url:cleanWebAddress(url),title:title.slice(0,300),applet:this.options.applet,startedAt:at,endedAt:at,lastAt:at};
  }
  const visit=this.visit!;
  visit.endedAt=visit.lastAt=at;if(title)visit.title=title.slice(0,300);
  const {lastAt:_,...row}=visit;this.touched.set(visit.id,row);
  return row;
 }
 private add(kind:WebRecordKind,url:string,meta:Row,body:string,pageURL=this.page.url){
  if(this.closed)return;
  if(this.privatePage!==null&&(pageKey(pageURL)===this.privatePage||pageKey(this.page.url)===this.privatePage))return;
  const visit=this.visitFor(pageURL,this.page.title);if(!visit)return;
  this.queue.push({visit:visit.id,at:this.now(),kind,url:cleanWebAddress(url)||visit.url,meta,body});
  if(this.queue.length>=200)this.flush();
  else this.timer??=setTimeout(()=>this.flush(),1000);
 }
 flush(){
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(!this.queue.length&&!this.touched.size)return;
  const records=this.queue.splice(0),visits=[...this.touched.values()];this.touched.clear();
  try{this.sink(visits,records);}catch(error){this.options.onError?.(error);}
 }
 /** A record the host itself adds to the page's visit, such as a meeting transcript line; kept like
  * the page's own records (never on a page that showed a password, card or code field). */
 note(kind:WebRecordKind,body:string,meta:Row){this.add(kind,this.page.url,meta,body);this.flush();}
 /** The visit the page is on now ('' when the page is somewhere nothing is kept). */
 openVisit(){return !this.closed&&this.visit&&this.visit.site===webSite(this.page.url)?this.visit.id:'';}
 close(){this.flush();this.closed=true;this.requests.clear();this.sockets.clear();}
 /** Before the person deletes recordings on `site` (or every site): what is waiting is saved first so
  * it goes too, and the next record on that site starts a new visit instead of reviving a deleted one. */
 forget(site=''){
  this.flush();
  if(this.visit&&(!site||this.visit.site===site||this.visit.site.endsWith('.'+site)))this.visit=null;
 }

 /** A DevTools event from the page. */
 event(method:string,params:Row){
  if(this.closed)return;
  try{
   switch(method){
    case 'Network.requestWillBeSent':{
     const request=params.request??{},url=String(request.url??''),type=String(params.type??'');
     if(this.requests.size>=WEB_RECORD.openRequests)this.requests.delete(this.requests.keys().next().value!);
     this.requests.set(String(params.requestId),{url,type,method:String(request.method??'GET'),at:this.now()});
     if(keptRequest(type)&&request.method!=='GET'&&request.method!=='HEAD'&&this.allowed(url)&&this.allowed(this.page.url)){
      const headers=cleanHeaders(request.headers),contentType=headers['content-type']??'';
      if(typeof request.postData==='string')this.add('request',url,{method:String(request.method),type,headers},cleanRequestBody(request.postData,contentType));
      else if(request.hasPostData){
       void this.page.cdp('Network.getRequestPostData',{requestId:params.requestId},5).then(value=>{
        if(typeof value.postData==='string')this.add('request',url,{method:String(request.method),type,headers},cleanRequestBody(value.postData,contentType));
       },()=>this.add('request',url,{method:String(request.method),type,headers},''));
      }else this.add('request',url,{method:String(request.method),type,headers},'');
     }
     break;
    }
    case 'Network.responseReceived':{
     const entry=this.requests.get(String(params.requestId));if(!entry)break;
     const response=params.response??{};
     entry.status=Number(response.status)||0;entry.mime=String(response.mimeType??'');entry.type=String(params.type??entry.type);
     entry.headers=cleanHeaders(response.headers);
     break;
    }
    case 'Network.loadingFinished':{
     const id=String(params.requestId),entry=this.requests.get(id);this.requests.delete(id);
     if(!entry||!keptResponse(entry.type,entry.mime)||!this.allowed(entry.url)||!this.allowed(this.page.url))break;
     const meta:Row={method:entry.method,status:entry.status,mime:entry.mime,type:entry.type,size:Number(params.encodedDataLength)||0};
     // Bodies are read a few at a time; under a burst the rest keep only their address and size.
     if(this.reading>=6){this.add('response',entry.url,{...meta,skipped:'busy'},'');break;}
     this.reading++;
     const pageURL=this.page.url;
     void this.page.cdp('Network.getResponseBody',{requestId:id},10).then(value=>{
      const raw=value.base64Encoded?Buffer.from(String(value.body??''),'base64').toString('utf8'):String(value.body??'');
      const body=clip(cleanResponseBody(raw,entry.mime),WEB_RECORD.bodyLimit);
      this.add('response',entry.url,{...meta,size:raw.length,...body.truncated?{truncated:true}:{}},body.text,pageURL);
     },()=>this.add('response',entry.url,{...meta,skipped:'unavailable'},'',pageURL)).finally(()=>{this.reading--;});
     break;
    }
    case 'Network.loadingFailed':this.requests.delete(String(params.requestId));break;
    case 'Network.webSocketCreated':this.sockets.set(String(params.requestId),String(params.url??''));break;
    case 'Network.webSocketClosed':this.sockets.delete(String(params.requestId));break;
    case 'Network.webSocketFrameReceived':case 'Network.webSocketFrameSent':{
     // A socket opened before recording started has no known address; it is the page's own.
     const url=this.sockets.get(String(params.requestId))??this.page.url,frame=params.response??{};
     if(!this.allowed(this.page.url)||privateWebAddress(url))break;
     const kind=method==='Network.webSocketFrameReceived'?'ws-in':'ws-out';
     if(Number(frame.opcode)!==1){this.add(kind,url,{binary:true,size:String(frame.payloadData??'').length},'');break;}
     const body=clip(cleanMessage(String(frame.payloadData??''),kind==='ws-out'),WEB_RECORD.messageLimit);
     this.add(kind,url,body.truncated?{truncated:true}:{},body.text);
     break;
    }
    case 'Network.eventSourceMessageReceived':{
     const entry=this.requests.get(String(params.requestId)),url=entry?.url??this.page.url;
     if(privateWebAddress(url))break;
     const body=clip(cleanMessage(String(params.data??''),false),WEB_RECORD.messageLimit);
     this.add('sse',url,{event:String(params.eventName??'').slice(0,80),...body.truncated?{truncated:true}:{}},body.text);
     break;
    }
   }
  }catch(error){this.options.onError?.(error);}
 }

 /** What the page's observer reported: text, typing, clicks or an address change inside the page. */
 observed(value:Row){
  if(this.closed||!value||typeof value!=='object')return;
  const url=typeof value.url==='string'?value.url:this.page.url;
  // A sign-in, card or code field appeared: this page keeps nothing more until it navigates.
  if(value.kind==='private'){this.privatePage=pageKey(url);return;}
  if(value.kind==='page'&&this.privatePage!==null&&pageKey(url)!==this.privatePage)this.privatePage=null;
  if(!this.allowed(url))return;
  const text=(raw:unknown,limit:number)=>clip(typeof raw==='string'?raw:'',limit);
  switch(value.kind){
   case 'page':this.add('page',url,{title:text(value.title,300).text},'',url);break;
   case 'text':case 'text-more':{const body=text(value.text,WEB_RECORD.textLimit);if(body.text)this.add(value.kind,url,body.truncated?{truncated:true}:{},body.text,url);break;}
   case 'input':{if(secretField(value.field))break;const body=text(typeof value.value==='string'?scrubCards(value.value):'',WEB_RECORD.inputLimit);if(body.text)this.add('input',url,{field:text(value.field,120).text},body.text,url);break;}
   case 'click':this.add('click',url,typeof value.href==='string'&&value.href?{href:cleanWebAddress(value.href)}:{},text(value.label,200).text,url);break;
   case 'submit':{const fields=Array.isArray(value.fields)?value.fields.filter((f:unknown)=>typeof f==='string'&&!secretField(f.split(': ')[0])).slice(0,40).map((f:string)=>scrubCards(f)):[];this.add('submit',url,{},clip(fields.join('; '),WEB_RECORD.inputLimit).text,url);break;}
  }
 }
}

/** What the person's recording control needs of the World ledger (store/ledger.ts). */
export interface RecordingLedger {webSites():{site:string;visits:number}[];deleteWeb(range:{site?:string}):number}

/** The person's own control over what was recorded (Settings › General): `recordings` lists the sites
 * that hold recordings, `deleteRecordings` deletes one site's (and its subdomains') or, with `all`,
 * every site's. Fox can neither list nor delete them this way. Open pages' recorders save what is
 * waiting first, so nothing recorded before the delete lands after it. */
export function manageRecordings(op:'recordings'|'deleteRecordings',args:Row,{agent,sample,ledger,recorders}:{agent:boolean;sample:boolean;ledger:RecordingLedger;recorders:Iterable<unknown>}):Row {
 if(agent)throw new WorldletError('Only the person can manage browsing recordings.');
 if(sample)throw new WorldletError('Browsing recordings are unavailable in the practice world.');
 if(op==='recordings')return {sites:ledger.webSites().map(({site,visits})=>({site,visits}))};
 const named=typeof args.site==='string'?args.site.trim():'';
 const site=args.all===true?'':webSite(named.includes('://')?named:'https://'+named);
 if(args.all!==true&&!site)throw new WorldletError('Choose a site to delete recordings for.');
 for(const recorder of new Set(recorders))if(recorder instanceof WebRecorder)recorder.forget(site);
 return {site,deleted:ledger.deleteWeb({site})};
}

/** What Fox's recording reads need of the World ledger (store/ledger.ts). */
export interface RecordingReader {
 webVisits(plan:ReturnType<typeof webSearchPlan>):{total:number;visits:(RecordedVisit&{counts:Record<string,number>;found?:string})[]};
 webVisit(id:string):RecordedVisit|null;
 webRecords(visit:string,options:{offset:number;limit:number;kinds:string[];term:string}):{total:number;after:number;records:{index:number;at:number;kind:string;url:string;meta:Row;body:string}[]};
 webPages(visit:string):{index:number;url:string;title:string;at:number}[];
}

/** Fox's two reads of the recordings: `records` finds visits (words, site, dates), `record` reads one
 * visit page by page from a record number, optionally only its network or page records or those
 * holding `query`. `onScreen` is the visit open on screen now; `now` is in seconds. */
export function readRecordings(op:'records'|'record',args:Row,{ledger,onScreen,now,offsetMinutes}:{ledger:RecordingReader;onScreen:string;now:number;offsetMinutes:number}):Row {
 if(op==='records'){
  const plan=webSearchPlan(args,now);
  const found=ledger.webVisits(plan);
  const local=(at:number)=>new Date((at+offsetMinutes*60)*1000).toISOString().slice(0,19).replace('T',' ');
  return {visits:found.visits.map(v=>({id:v.id,site:v.site,title:v.title,url:v.url,applet:v.applet,started:local(v.startedAt),...v.id===onScreen?{onScreen:true,ended:'still open'}:{ended:local(v.endedAt)},recorded:v.counts,...v.found?{found:v.found}:{}})),total:found.total,offset:plan.offset,
   untrustedContent:true,scope:'Visits recorded in Worldlet’s built-in browser, or on the paired phone for an applet starting phone: (local time). Read one with operation record and its id. A visit marked onScreen is the page open now and keeps growing; its newest records are at the end.'};
 }
 const visit=typeof args.id==='string'?ledger.webVisit(args.id):null;
 if(!visit)throw new WorldletError('No recorded visit has that id. Search with operation records first.');
 const offset=Number.isInteger(args.offset)&&args.offset>0?Number(args.offset):0;
 const only=args.only==='network'?['response','request','ws-in','ws-out','sse']:args.only==='page'?['page','text','text-more','input','click','submit']:args.only==='transcript'?['transcript']:[];
 const term=typeof args.query==='string'?args.query.trim().slice(0,200):'';
 const {records,total,after}=ledger.webRecords(visit.id,{offset,limit:400,kinds:only,term});
 const full=args.full===true;
 const read=webTranscript(visit,records as (WebRecord&{index:number})[],{offset,offsetMinutes,total,after,full,pages:offset===0&&!only.length&&!term?ledger.webPages(visit.id):[]});
 return {id:visit.id,text:read.text,...read.nextOffset!==null?{next_offset:read.nextOffset}:{},total,untrustedContent:true};
}
