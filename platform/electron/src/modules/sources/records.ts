import {WorldletError} from '../../files.ts';
import {swiftJSON} from '../../store/swift-json.ts';
import type {Row} from '../../host/types.ts';
import type {WorldStore} from '../../store/world-store.ts';
// Agent record → immutable original (Mac SourceRecord.swift, GoogleSource.swift).
export interface Original {title:string;text:string;raw:string;kind:string}
const prefix=(text:string,count:number)=>Array.from(text).slice(0,count).join('');

/** Gmail MIME text/plain parts, base64url-decoded and joined. */
export function mailText(payload:Row):string {
 if(payload?.mimeType==='text/plain'&&typeof payload.body?.data==='string'){
  try{return Buffer.from(payload.body.data.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8');}catch{return '';}
 }
 return (Array.isArray(payload?.parts)?payload.parts:[]).map(mailText).filter(Boolean).join('\n');
}

/** Headers and attachment names for the page's mail view; never bodies. */
export function mailPresentation(raw:string):Row {
 let doc:Row;try{doc=JSON.parse(raw);}catch{return {};}
 const payload=doc?.payload;
 if(!payload||typeof payload!=='object')return {};
 const headers:Record<string,string>={},attachments:Row[]=[];
 for(const header of Array.isArray(payload.headers)?payload.headers:[]){
  const key=typeof header?.name==='string'?header.name.toLowerCase():'';
  if(['from','to','cc','date','subject'].includes(key)&&typeof header.value==='string')headers[key]=header.value;
 }
 const visit=(part:Row,depth:number)=>{
  if(depth>=20||attachments.length>=100)return;
  if(typeof part?.filename==='string'&&part.filename)attachments.push({name:part.filename,size:Number.isInteger(part.body?.size)?part.body.size:0});
  for(const child of Array.isArray(part?.parts)?part.parts:[])visit(child,depth+1);
 };
 visit(payload,0);
 return {headers,attachments};
}

export function sourceOriginal(provider:string,model:string,input:Row):Original {
 // Cursor/timestamps describe transport, not a new version of the user's content.
 const data={...input};delete data._nango_metadata;
 const raw=swiftJSON(data);
 const id=String(data.id??'');
 let title:string,text:string;
 switch(provider){
  case 'gmail':{
   const payload=data.payload??{},headers:Row[]=Array.isArray(payload.headers)?payload.headers:[];
   const header=(name:string)=>{const row=headers.find(h=>typeof h?.name==='string'&&h.name.toLowerCase()===name);return typeof row?.value==='string'?row.value:'';};
   title=header('subject')||'No subject';
   text=`Subject: ${title}\nFrom: ${header('from')}\nTo: ${header('to')}\nDate: ${header('date')}\n\n`+mailText(payload);
   break;
  }
  case 'google-calendar':title=typeof data.summary==='string'?data.summary:'Untitled event';text=title+'\n'+raw;break;
  case 'google-drive':title=typeof data.name==='string'?data.name:'Untitled file';text=title+'\nDrive file metadata (file contents are not imported)\n'+raw;break;
  case 'notion':
   title=typeof data.title==='string'?data.title:'Notion Page';
   if(data.object_type==='page'){
    if(typeof data.markdown!=='string')throw new WorldletError('Notion The body has not synced yet. The index was not saved in its place.');
    text=title+'\n\n'+data.markdown;
   }else text=title+'\nData source index (subpages sync separately)\n'+raw;
   break;
  case 'github':title=typeof data.title==='string'?data.title:typeof data.message==='string'?data.message:`${model} · ${prefix(id,12)}`;text=title+'\n'+raw;break;
  default:throw new WorldletError('Unsupported source.');
 }
 return {title:prefix(title,240),text,raw,kind:provider};
}

/** Present exactly the foreground read used by Fox, without fetching a different inbox. */
export function presentMailRead(store:WorldStore,records:Row[],accumulate=false):Row[] {
 const pages=records.map(row=>{
  const key='live:gmail:'+(typeof row.id==='string'?row.id:'');
  const title=typeof row.title==='string'?row.title:'Email',text=typeof row.text==='string'?row.text:'';
  store.liveAppOriginals[key]={title,text,raw:text,kind:'text'};
  const header=(name:string)=>{const line=text.split('\n').slice(0,20).find(line=>line.toLowerCase().startsWith(name+':'));return line?line.slice(name.length+1).trim():'';};
  return {id:key,sourceId:key,title,threadId:row.threadId??'',labelIds:row.labelIds??[],messageCount:row.messageCount??1,url:row.url??'',unread:row.unread??false,from:row.from??header('from'),date:row.date??header('date'),receivedAt:row.receivedAt??0};
 });
 const incoming=new Set(pages.map(page=>page.id));
 const combined=accumulate?[...pages,...store.mailReadPages.filter(page=>!incoming.has(page.id))].slice(0,100):pages;
 store.mailReadRevision+=1;store.mailReadPages=combined;store.liveAppRecords.gmail=combined;
 return pages;
}
