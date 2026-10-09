// Reviewed Notion page writes (ported from Hermes notion_writes.py). Only the native confirmation route calls commit.
// Saved reviews are bound to one Notion connection. A durable attempted marker is created before the write is sent:
// a lost response never licenses another write.
import type {McpSession} from './session.ts';
import {pyType,truthy,strip} from '../google/python.ts';
import {ValueError,OSError,isDict,dget,item,count,dumps,uuidCanonical} from './python.ts';
import {jsonSchemaValid} from './json-schema.ts';
import {notionPageId,notionPayload,notionPage} from './notion.ts';

/** The review folder `worldlet-notion-reviews` under HERMES_HOME, by file name, as Hermes keeps it: `<id>.json`
 * holds a review (Python's json.dump text) and an empty `<id>.attempt` marks a write that was sent. The Platform
 * keeps the folder owner-only, refuses linked files and folders, and replaces a file atomically (temporary file,
 * fsync, rename), so existing reviews keep working when it backs this with the same folder. */
export interface NotionReviewStore {
 /** The names of the files in the folder. */
 list():string[]|Promise<string[]>;
 /** A file's text, or null when it does not exist. */
 read(name:string):string|null|Promise<string|null>;
 exists(name:string):boolean|Promise<boolean>;
 /** Replaces a file's text atomically. */
 write(name:string,text:string):void|Promise<void>;
 /** Creates an empty file only when none exists yet (O_CREAT|O_EXCL); false when one already does. */
 create(name:string):boolean|Promise<boolean>;
 delete(name:string):void|Promise<void>;
}
/** Clock (seconds since 1970, `time.time()`) and review IDs (`uuid.uuid4()`), replaceable for fixtures. */
export interface NotionWriteOptions {now?:()=>number;uuid?:()=>string}
export const NOTION_WRITE_OPERATIONS:readonly string[]=Object.freeze(['prepare','commit','check','reviews','discard']);
export const NOTION_REVIEW_FOLDER='worldlet-notion-reviews';
const TIMEOUT=45,MAX_REVIEW_BYTES=300_000,MAX_REVIEWS=20,PUBLIC=['id','operation','target','targetTitle','title','markdown','status','url','createdAt'];
const bytes=(text:string)=>new TextEncoder().encode(text).length;
const save=(store:NotionReviewStore,review:Record<string,any>)=>store.write(review.id+'.json',dumps(review,{floats:['createdAt']}));

function reviewName(stem:string){
 try{return uuidCanonical(stem)===stem;}catch(error){if(error instanceof ValueError)return false;throw error;}
}
async function load(store:NotionReviewStore,identifier:unknown){
 if(uuidCanonical(identifier)!==identifier)throw new ValueError('Invalid review.');
 const text=await store.read(identifier+'.json');
 if(text===null)throw new OSError(`[Errno 2] No such file or directory: '${NOTION_REVIEW_FOLDER}/${identifier}.json'`);
 if(bytes(text)>MAX_REVIEW_BYTES)throw new ValueError('Invalid review file.');
 let review:any;
 try{review=JSON.parse(text);}catch(error){throw new ValueError(error.message);}
 if(dget(review,'status')==='review'&&await store.exists(identifier+'.attempt'))review.status='unconfirmed';
 return review as Record<string,any>;
}
/** The review as the shelf shows it. */
export const publicReview=(review:Record<string,any>)=>Object.fromEntries(PUBLIC.map(key=>[key,dget(review,key)]));

async function checkedArgs(session:McpSession,name:string,candidates:unknown[]){
 const listed=await session.listTools();
 const tool=(listed?.tools??[]).find(tool=>tool?.name===name);
 if(!tool)throw new ValueError('Your Notion connection does not provide this write tool. Reconnect with page editing access.');
 const schema=truthy(tool.inputSchema)?tool.inputSchema:(tool as any).input_schema??null;
 if(!isDict(schema))throw new ValueError('Notion write schema is unavailable.');
 for(const args of candidates)for(const candidate of [args,{data:args}])if(jsonSchemaValid(candidate,schema))return candidate as Record<string,unknown>;
 throw new ValueError('This Notion write format is not supported yet. Nothing was submitted.');
}

/** sha256 of the page data (not MCP's wrapper prose, which may carry a fresh fetch time), hex. */
export async function notionFingerprint(raw:Record<string,any>,target:string){
 const page=notionPage(raw,target);
 const value=Object.fromEntries(['id','title','markdown','partial','kind','lastEdited'].map(key=>[key,dget(page,key)]));
 const digest=new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(dumps(value,{sortKeys:true}))));
 return [...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function prepare(session:McpSession,body:unknown,store:NotionReviewStore,binding:string,options:NotionWriteOptions){
 const operation=dget(body,'operation');
 if(operation!=='create'&&operation!=='append')throw new ValueError('Only create and append are supported.');
 const target=notionPageId(dget(body,'target',''));
 const text=dget(body,'markdown'),title=dget(body,'title','');
 if(typeof text!=='string'||!strip(text)||bytes(text)>30_000||typeof title!=='string'||[...title].length>300)throw new ValueError('Provide a bounded Markdown draft and title.');
 const raw=notionPayload(await session.callTool('notion-fetch',{id:target},TIMEOUT));
 const page=notionPage(raw,target);
 if(page.kind!=='page'||truthy(page.partial))throw new ValueError('Read a complete page before preparing a write. Databases and partial pages are not supported.');
 let name:string,candidates:unknown[];
 if(operation==='create'){
  if(!strip(title))throw new ValueError('A new page needs a title.');
  name='notion-create-pages';
  candidates=[{parent:{page_id:target},pages:[{properties:{title},content:text}],allow_async:false}];
 }else{
  name='notion-update-page';
  // Append only: never replace a page, apply a template or change properties.
  candidates=[{page_id:target,command:'insert_content',new_str:'\n\n'+text,allow_async:false}];
 }
 const args=await checkedArgs(session,name,candidates);
 if((await store.list()).filter(file=>file.endsWith('.json')).length>=MAX_REVIEWS)throw new ValueError('Close existing Notion reviews before preparing another.');
 const review={id:(options.uuid??(()=>globalThis.crypto.randomUUID()))(),operation,target,targetTitle:page.title,title,markdown:text,binding,
  priorCount:count(page.markdown,strip(text)),url:page.url,status:'review',createdAt:(options.now??(()=>Date.now()/1000))(),tool:name,args,
  fingerprint:await notionFingerprint(raw,target)};
 await save(store,review);
 return publicReview(review);
}

function resultState(value:unknown,review:Record<string,any>){
 const task=dget(value,'async_task',value);
 if(dget(task,'object')==='async_task'){Object.assign(review,{status:'pending',task:dget(task,'id')});return;}
 // A successful MCP transport alone is not evidence that the page was written.
 const pages=dget(value,'pages')||dget(value,'results')||[];
 if(Array.isArray(pages)&&pages.length&&isDict(pages[0])){
  try{
   review.url='https://www.notion.so/'+notionPageId(dget(pages[0],'url')||dget(pages[0],'id'));
   review.status='submitted';
   return;
  }catch(error){if(!(error instanceof ValueError))throw error;}
 }
 review.status='unconfirmed';
}

/** A reviewed write (Python `handle(session, body, home)`): `prepare` a draft (`body.draft`: operation create or
 * append, target page, title, markdown), list `reviews`, `discard`, `commit` once, or `check` a sent one. */
export async function handleNotionWrite(session:McpSession,body:Record<string,any>,store:NotionReviewStore,options:NotionWriteOptions={}){
 const operation=dget(body,'operation'),binding=dget(body,'binding');
 if(typeof binding!=='string'||!binding)throw new ValueError('A connected Notion account is required.');
 if(operation==='prepare')return prepare(session,item(body,'draft'),store,binding,options);
 if(operation==='reviews'){
  const reviews:any[]=[];
  for(const file of [...await store.list()].sort()){
   if(!file.endsWith('.json'))continue;
   const stem=file.slice(0,-5);
   if(!stem||!reviewName(stem))continue;
   const review=await load(store,stem);
   if(dget(review,'binding')===binding)reviews.push(publicReview(review));
  }
  return {reviews};
 }
 const review=await load(store,dget(body,'id',''));
 if(dget(review,'binding')!==binding)throw new ValueError('This review belongs to a different Notion connection.');
 if(operation==='discard'){
  await store.delete(item(review,'id')+'.json');
  return {ok:true};
 }
 if(operation==='commit'){
  if(item(review,'status')!=='review'||(options.now??(()=>Date.now()/1000))()-item(review,'createdAt')>3600)throw new ValueError('This review was submitted or expired. Check Notion before preparing another.');
  const raw=notionPayload(await session.callTool('notion-fetch',{id:item(review,'target')},TIMEOUT));
  if(await notionFingerprint(raw,review.target)!==item(review,'fingerprint'))throw new ValueError('The destination changed. Review a fresh draft before writing.');
  // Revalidate against today's server schema before any mutation.
  const args=await checkedArgs(session,item(review,'tool'),[item(review,'args')]);
  if(!await store.create(review.id+'.attempt'))throw new ValueError('This write was already attempted. Check its result instead.');
  review.status='unconfirmed';
  await save(store,review);
  try{
   const value=notionPayload(await session.callTool(review.tool,args,TIMEOUT));
   resultState(value,review);
   await save(store,review);
  }catch{
   return publicReview(review);
  }
 }else if(operation==='check'){
  if(item(review,'status')==='review')return publicReview(review);
  if(truthy(dget(review,'task'))){
   const value=notionPayload(await session.callTool('notion-get-async-task',{task_id:review.task},TIMEOUT));
   const status=dget(value,'status');
   if(status==='failed')review.status='failed';
   else if(status==='succeeded'){resultState(dget(value,'result',{}),review);delete review.task;}
   else review.status='pending';
  }
  if(!truthy(dget(review,'task'))&&(item(review,'operation')==='append'||item(review,'url')!=='https://www.notion.so/'+item(review,'target'))){
   const raw=notionPayload(await session.callTool('notion-fetch',{id:notionPageId(review.url)},TIMEOUT));
   // Bounded text verification, not a guarantee for arbitrary enhanced Markdown transformations.
   const markdown=item(review,'markdown');
   if(typeof markdown!=='string')throw new TypeError(`'${pyType(markdown)}' object has no attribute 'strip'`);
   if(count(notionPage(raw,notionPageId(review.url)).markdown,strip(markdown))>(review.operation==='append'?dget(review,'priorCount',0):0))review.status='verified';
  }
  await save(store,review);
 }else throw new ValueError('Unsupported review action.');
 return publicReview(review);
}
