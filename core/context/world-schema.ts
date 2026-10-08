import {utf8Length} from '../companion/index.ts';
export const THEMES={home:'Life & home',library:'Reading & learning',studio:'Creation & projects',factory:'Code & GitHub projects',cafe:'Friends & connections',family:'Family & growth',calendar:'Calendar & plans',finance:'Budget & planning',archive:'Sources & collections',rocket:'Travel & exploration',health:'Movement & rest',vision:'Wishes & future'};
export const EMPTY_OVERLAY=()=>({version:1,created:{},edits:{},trash:{},receipts:{},undo:null});
export function validateOverlay(s: any){
 if(!s||s.version!==1||!s.created||!s.edits||!s.trash||!s.receipts||utf8Length(JSON.stringify(s))>1500000)throw Error('Invalid local edit format or size.');
 for(const map of [s.created,s.edits,s.trash,s.receipts])if(typeof map!=='object'||Array.isArray(map)||Object.keys(map).length>1000||Object.hasOwn(map,'__proto__')||Object.hasOwn(map,'constructor'))throw Error('Invalid edit format.');
 for(const [id,p]of Object.entries<any>(s.created))if(!id.startsWith('local-')||p.id!==id||typeof p.title!=='string'||p.title.length>200||typeof p.markdown!=='string'||p.markdown.length>30000||!Array.isArray(p.children)||!Array.isArray(p.paths))throw Error('Invalid note format.');
 for(const p of Object.values<any>(s.edits))if(!p||Object.keys(p).some(k=>!['title','markdown','revision','modifiedLocally'].includes(k))||(p.markdown!==undefined&&(typeof p.markdown!=='string'||p.markdown.length>30000))||(p.title!==undefined&&(typeof p.title!=='string'||p.title.length>200)))throw Error('Invalid note edit format.');
 return s;
}
// Runtime receives data + allowlisted templates, never generated JavaScript.
export function compileWorld(workspace: any,knowledge: any[],overrides: any[]=[]){
 const choices=new Map(overrides.map(o=>[o.node_id,o])),pages=[],spaces=[],objects=[],topics=new Map();
 const root='root-'+workspace.id;
 const add=(id,title,markdown,parent,extra={})=>{const p={id,title,kind:'page',parent,children:[],paths:[id+'.md'],path:id+'.md',markdown,text:markdown,...extra};pages.push(p);return p};
 for(const k of knowledge){
  const structured=JSON.parse(k.structured),theme=Object.hasOwn(THEMES,structured.theme)?structured.theme:'archive';
  const topicKey=theme+':'+(structured.topic||THEMES[theme]).trim().toLowerCase();
  if(!topics.has(topicKey))topics.set(topicKey,{theme,title:structured.topic||THEMES[theme],items:[]});topics.get(topicKey).items.push({k,s:structured});
 }
 // A persistent home exists even before the first resource is connected.
 for(const [theme,title]of Object.entries(THEMES)){
  if(theme!=='home'&&![...topics.values()].some(t=>t.theme===theme))continue;
  spaces.push({id:'place-'+theme,theme,title,children:[]});
 }
 for(const topic of topics.values()){
  // Stable semantic ID, independent of source arrival/deletion order.
  let fingerprint=14695981039346656037n;for(const char of topic.theme+':'+topic.title.trim().toLowerCase())fingerprint=BigInt.asUintN(64,(fingerprint^BigInt(char.codePointAt(0)))*1099511628211n);
  const stable=fingerprint.toString(16);
  const tid='topic-'+stable,space=spaces.find(s=>s.theme===topic.theme);space.children.push(tid);
  const p=add(tid,topic.title,topic.items.map(({k,s})=>`## ${k.title}\n\n${s.summary}\n\n${(s.facts||[]).map(f=>'- '+f.text).join('\n')}`).join('\n\n'),root,{knowledge:true,...(topic.items.some(({s})=>Array.isArray(s.activities))?{activities:[]}:{}),revision:String(workspace.revision)});
  for(const {k,s}of topic.items){
   const sid='source-'+k.source_id;
   const source=add(sid,k.title,k.markdown,tid,{revision:k.source_revision,sourceId:k.source_id,sourceRevision:k.source_revision,evidence:s.facts||[],knowledge:true,...(Array.isArray(s.activities)?{activities:s.activities,events:s.activities.filter(a=>a.kind==='event').map((a,i)=>({...a,id:'derived-'+i}))}:{})});
   p.children.push(source.id);
   if(s.intent){
    const iid='intent-'+k.source_id+'-'+s.intent.key,override=choices.get(iid),status=override?.status||'inferred';
    if(status!=='dismissed'){
     const note=add(iid,s.intent.title,`**${status==='confirmed'?'Confirmed wish · Private':'Possible intent · Unconfirmed'}**\n\n${s.intent.reason}\n\n${override?.note||''}`,tid,{knowledge:true,intentId:iid,intentStatus:status,sourceId:k.source_id,sourceRevision:k.source_revision,revision:k.source_revision});p.children.push(note.id);
    }
   }
  }
 }
 for(const space of spaces)objects.push({id:space.id,parent:'world',template:space.theme,anchor:space.theme,contextRefs:space.children});
 for(const p of pages)objects.push({id:p.id,parent:p.parent===root?(spaces.find(s=>s.children.includes(p.id))?.id||'world'):p.parent,template:p.intentId?'wish-note':'book',contextRef:p.id,revision:p.revision,action:{type:'open_content',target:p.id}});
 pages.unshift({id:root,title:'My world',kind:'page',parent:null,children:spaces.flatMap(s=>s.children),paths:['world.md'],path:'world.md',markdown:'',text:''});
 return {version:1,cloud:true,sample:false,workspace:workspace.name,workspaceId:workspace.id,revision:workspace.revision,roots:[root],pages,spaces,assets:[],coverage:{pages:pages.length-1,databases:0,rows:0,assets:0,scope:'Private sources imported with your permission. Structure is model-generated; review originals and correct inferred intents.',problems:[]},scene:{schemaVersion:1,revision:workspace.revision,objects}};
}
