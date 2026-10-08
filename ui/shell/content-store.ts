// Browser-local overlay. The imported snapshot is never modified or uploaded.
// Compare JSON records without serializing unchanged long bodies on every wake.
// Undefined object fields are omitted by the store's existing JSON copy format.
function sameRecord(a:any,b:any):boolean{
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
  if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameRecord(v??null,b[i]??null));
  if(Object.getPrototypeOf(a)!==Object.prototype||Object.getPrototypeOf(b)!==Object.prototype)return JSON.stringify(a)===JSON.stringify(b);
  const keys=Object.keys(a).filter(k=>a[k]!==undefined),other=Object.keys(b).filter(k=>b[k]!==undefined);
  return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&sameRecord(a[k],b[k]));
}
export function createContentStore({pages,sections,key,storage,aliases={}}: {pages: Map<string,any>;sections: any[];key: string;storage?: any;aliases?: Record<string,string>}) {
  const copy=value=>JSON.parse(JSON.stringify(value));
  let basePages=copy([...pages.values()]),baseSections=copy(sections);
  let saved=null,blocked='',state={version:1,created:{},edits:{},trash:{},receipts:{},undo:null};
  try{storage ??= globalThis.localStorage;saved=storage.getItem(key);if(saved){const value=JSON.parse(saved);if(value.version!==1||!value.created||!value.edits||!value.trash||!value.receipts)throw Error();
      for(const [id,p]of Object.entries<any>(value.created))if(!id.startsWith('local-')||p.id!==id||typeof p.title!=='string'||typeof p.markdown!=='string'||!Array.isArray(p.children)||!Array.isArray(p.paths))throw Error();
      for(const p of Object.values(value.edits))if(Object.keys(p).some(k=>!['title','markdown','revision','modifiedLocally'].includes(k)))throw Error();
      state=value}}catch{blocked='Could not read local content. Editing is paused; original records are preserved.'}
  const validText=(v,max)=>typeof v==='string'&&v.length<=max;
  let reconciled=false;
  function reconcile(){
    // Build the desired shallow projection first. Only changed records need a
    // detached deep copy; compare live values too, so optimistic UI mutations
    // cannot survive an authoritative snapshot that contradicts them.
    const next=new Map<string,any>(basePages.map(p=>[p.id,{...p}]));
    for(const [id,p]of Object.entries<any>(state.created))next.set(id,{...p,parent:aliases[p.parent]||p.parent});
    for(const [id,edit]of Object.entries<any>(state.edits)){const p=next.get(id);if(p)Object.assign(p,edit)}
    for(const id of Object.keys(state.trash))next.delete(id);
    sections.splice(0,sections.length,...copy(baseSections));
    for(const s of sections){
      s.children=s.children.filter(id=>next.has(id));
      for(const p of Object.values<any>(state.created))if((aliases[p.parent]||p.parent)===s.id&&next.has(p.id)&&!s.children.includes(p.id))s.children.push(p.id);
      if(s.virtual)next.set(s.id,s);
    }
    for(const p of next.values()){
      p.children=(p.children||[]).filter(id=>next.has(id));
      if(!p.virtual){p.revision=p.revision||'source';if(p.local||Object.hasOwn(state.edits[p.id]||{},'markdown'))p.text=(p.markdown||'')+(p.table?'\n'+p.table.rows.map(r=>r.join(' ')).join('\n'):'');else p.text=p.text||p.markdown||''}
    }
    for(const [id,p] of next){if(p.virtual)continue;const old=pages.get(id);next.set(id,reconciled&&old&&sameRecord(old,p)?old:copy(p));}
    pages.clear();for(const [id,p]of next)pages.set(id,p);
    reconciled=true;
  }
  if(!blocked){try{reconcile()}catch{blocked='Local content is incomplete. Editing is paused.';pages.clear();basePages.forEach(p=>pages.set(p.id,copy(p)));sections.splice(0,sections.length,...copy(baseSections))}}
  function persist(next){
    if(blocked)throw Error(blocked);
    if(storage.getItem(key)!==saved)throw Error('Content changed in another tab. Refresh before editing.');
    const text=JSON.stringify(next);if(text.length>2000000)throw Error('Local edits reached the sample storage limit. Export a backup first.');
    try{storage.setItem(key,text)}catch{throw Error('Local storage is full or unavailable. Changes were not saved.')}
    saved=text;state=next;reconcile();
  }
  function revision(id){return pages.get(id)?.revision||'source'}
  function placeFor(id){
    const all=new Map<string,any>([...basePages,...Object.values<any>(state.created)].map(p=>[p.id,p]));let p=all.get(id),seen=new Set();
    while(p&&!seen.has(p.id)){seen.add(p.id);const s=baseSections.find(s=>s.id===p.id||s.children.includes(p.id));if(s)return s.id;p=all.get(p.parent)}
    return baseSections[0]?.id;
  }
  function commit(kind,id,next,operationId){
    const place=next.created[id]?.parent||placeFor(id);
    next.undo={created:copy(state.created),edits:copy(state.edits),trash:copy(state.trash),kind,id,place};
    next.receipts={...state.receipts,[operationId]:{ok:true,kind,id,place}};
    const keys=Object.keys(next.receipts);for(const old of keys.slice(0,Math.max(0,keys.length-100)))delete next.receipts[old];
    persist(next);return {ok:true,kind,id,place};
  }
  function mutate(name: string,args: any,{operationId}: any={}){
    if(blocked)return {error:blocked};
    if(!operationId)return {error:'Missing operation ID. No changes made.'};
    if(state.receipts[operationId])return {...state.receipts[operationId],duplicate:true};
    const next=copy(state);
    try{
      if(name==='create_content'){
        if(!sections.some(s=>s.id===args.place_id))throw Error('Target scene not found.');
        if(!validText(args.title,100)||!args.title.trim()||!validText(args.body,12000))throw Error('Invalid title or body format.');
        const id='local-'+crypto.randomUUID();
        next.created[id]={id,title:args.title.trim(),markdown:args.body,text:args.body,parent:args.place_id,children:[],paths:[],path:id+'.md',kind:'note',local:true,revision:crypto.randomUUID()};
        return commit('create',id,next,operationId);
      }
      if(name==='undo_content'){
        if(!state.undo)throw Error('Nothing to undo.');
        const previous=state.undo;next.created=previous.created;next.edits=previous.edits;next.trash=previous.trash;next.undo=null;
        // Keep receipts: retrying a request after Undo must never reapply it.
        const result={ok:true,kind:'undo',id:previous.id,previous:previous.kind,place:previous.place};next.receipts[operationId]=result;persist(next);return result;
      }
      if(name==='restore_content'){
        if(!state.trash[args.id])throw Error('Content not found in trash.');
        delete next.trash[args.id];return commit('restore',args.id,next,operationId);
      }
      const p=pages.get(args.id);
      if(!p||p.virtual||sections.some(s=>s.id===p.id))throw Error('Select a note. Scenes and source directories cannot be deleted or edited.');
      if(args.revision!==revision(p.id))throw Error('This content has changed. Read it again before editing.');
      if(name==='delete_content'){
        if(p.children.length)throw Error('This content has subpages. Handle each separately; the entire directory cannot be deleted at once.');
        next.trash[p.id]={title:p.title,deletedAt:new Date().toISOString()};return commit('delete',p.id,next,operationId);
      }
      if(name==='patch_content'){
        if(!['title','body'].includes(args.field)||!validText(args.old_text,12000)||!validText(args.new_text,12000))throw Error('Invalid edit field or text.');
        const field=args.field==='title'?'title':'markdown',before=p[field]||'';let after;
        if(args.field==='title'&&args.old_text!==before)throw Error('The original title does not match. Read it again.');
        if(args.old_text===''){if(args.field==='title')throw Error('Title cannot be empty');after=before+(before?'\n':'')+args.new_text}
        else {const at=before.indexOf(args.old_text);if(at<0||before.indexOf(args.old_text,at+args.old_text.length)>=0)throw Error('The original text was not found or matches multiple places. Provide a unique excerpt.');after=before.slice(0,at)+args.new_text+before.slice(at+args.old_text.length)}
        if(after.length>(field==='title'?100:200000)||field==='title'&&!after.trim())throw Error('Edited content is too long or the title is empty.');
        next.edits[p.id]={...next.edits[p.id],[field]:after,revision:crypto.randomUUID(),modifiedLocally:true};return commit('update',p.id,next,operationId);
      }
      throw Error('Unsupported edit');
    }catch(error){return {error:error.message}}
  }
  return {reloadStored(){const value=storage.getItem(key);if(value){state=JSON.parse(value);saved=value;reconcile()}},replaceBase(newPages,newSections,owned=false){basePages=owned?newPages:copy(newPages);baseSections=owned?newSections:copy(newSections);reconcile()},mutate,revision,get canUndo(){return !!state.undo},get error(){return blocked},deleted(){return Object.entries<any>(state.trash).slice(-30).map(([id,v])=>({id,title:v.title}))}};
}
