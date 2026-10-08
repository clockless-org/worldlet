import {searchNotes} from './note-search.ts';
import {WORLD_APPS} from '../../core/applets/index.ts';
import {turnWriteAdmission} from '../../core/agent/index.ts';
// All model actions stay within this allowlist. No code evaluation or external writes.
export function createWorldTools({ pages, sections, state, home, back, next, visitSpace, open, sectionFor, contentStore, onChange, contextTree=()=>({}), visitContext, scrollBrowser, actionList=()=>[], runAction }: any) {
  const compact = p => ({ id: p.id, title: p.title, place: sectionFor(p.id), revision: p.revision||'source' });
  const read = (id,offset=0) => {
    if(!Number.isInteger(offset)||offset<0)return {error:'Invalid text offset'};
    const p = pages.get(id);
    if (!p || p.virtual) return { error: 'Note not found. Search first.' };
    const raw = p.markdown || p.text || '';
    return { ...compact(p), text: raw.slice(offset, offset+5000), offset, next_offset:raw.length>offset+5000?offset+5000:null, truncated:raw.length>offset+5000,
      ...(p.table ? { columns: p.table.columns.slice(0,12), rows: p.table.rows.slice(0,5).map(row=>row.slice(0,12).map(v=>String(v).slice(0,120))), totalRows: p.table.rows.length } : {}),
      children: (p.children || []).slice(0, 15).map(id => pages.get(id)).filter(Boolean).map(compact) };
  };
  return function execute(name: string, args: any = {}, meta: any = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return { error: 'Invalid arguments' };
    const writes=['create_content','patch_content','delete_content','restore_content','undo_content'];
    if(writes.includes(name)){
      const intent={create_content:/新增|增加|添加|创建|新建|记下|记一|记录|写一|建一|保存|create|add|write|save|\bnote\s*:/i,patch_content:/修改|改成|改为|改名|更新|替换|追加|补充|加上|改一|change|update|edit|rename|append/i,delete_content:/删除|删掉|删了|移除|扔掉|放.*回收站|delete|remove|trash/i,restore_content:/恢复|还原|找回|restore/i,undo_content:/撤销|撤回|撤消|undo/i}[name];
      // Core's untrusted-turn rule decides first (#672); edit intent only narrows an admitted write.
      const admission=turnWriteAdmission(meta.trust,{type:'tool',name,args});
      if(!admission.allowed)return {error:admission.error};
      if(!meta.request||!intent.test(meta.request))return {error:'No explicit edit was requested this turn. Ask the user what to change.'};
      if(args.id&&pages.get(args.id)?.localArchive)return {error:'This Notion original is read-only. Edit the source or create a new note.'};
      if(!contentStore)return {error:'Local editing is not enabled.'};
      const result=contentStore.mutate(name,args,meta);
      if(result.ok&&!result.duplicate){try{onChange?.(result)}catch{return {...result,warning:'Content saved, but the scene could not refresh. Reload to view it.'}}}
      return {...result,...(result.ok?{current:state(),canUndo:contentStore.canUndo,revision:contentStore.revision(result.id)}:{})};
    }
    switch (name) {
      case 'scroll_browser':
        if(!['up','down'].includes(args.direction))return {error:'Choose up or down.'};
        return scrollBrowser?scrollBrowser(args.direction):{error:'Open an Applet website first.'};
      case 'open_applet': {
        const app=WORLD_APPS.find(app=>app.id===args.id);
        if(!app)return {error:'Unknown Applet. Use an ID from the public Applet catalog.'};
        if(!visitContext)return {error:'Applet navigation is unavailable.'};
        return Promise.resolve(visitContext(app.id)).then(result=>result?.ok
          ?{ok:true,id:app.id,title:app.title}
          :{error:'Could not open this Applet.'});
      }
      case 'list_deleted': return {items:contentStore?.deleted()||[]};
      case 'inspect_world': {
        const tree=contextTree(),query=String(args.query||'').toLocaleLowerCase().slice(0,160),offset=Number.isInteger(args.offset)&&args.offset>=0?args.offset:0;
        const list=items=>{const matched=(items||[]).filter(p=>!query||String(p.title).toLocaleLowerCase().includes(query)||p.id===query);return {items:matched.slice(offset,offset+40).map(p=>({id:p.id,title:String(p.title||'').slice(0,120),...(p.room?{room:p.room}:{}),...(p.rooms?{rooms:p.rooms.slice(0,8)}:{})})),total:matched.length,next_offset:matched.length>offset+40?offset+40:null};};
        const areas=list(tree.areas),buildings=list(tree.buildings),objects=list(tree.objects),places=list(sections);
        // A query is usually someone looking for a note by name. Places and objects are
        // what this tool is for, but a note whose title matches is named here too, so
        // "find X" does not end in "there is no X" when X is a note one read away.
        const notes=query?[...pages.values()].filter(p=>!p.virtual&&String(p.title||'').toLocaleLowerCase().includes(query)).slice(0,20).map(p=>({id:p.id,title:String(p.title).slice(0,120),place:sectionFor(p.id)})):[];
        return {current:state(),...(tree.profile?{profile:tree.profile}:{}),areas:areas.items,buildings:buildings.items,objects:objects.items,places:places.items,...(notes.length?{notes}:{}),actions:actionList().slice(0,12).map(a=>({id:a.id,label:String(a.label||a.title||'').slice(0,120)})),pagination:{areas:{total:areas.total,next_offset:areas.next_offset},buildings:{total:buildings.total,next_offset:buildings.next_offset},objects:{total:objects.total,next_offset:objects.next_offset},places:{total:places.total,next_offset:places.next_offset}},hint:'Use query or offset for more places; find_content searches notes. No note bodies or note indexes are included.'};
      }
      case 'visit_context': {const result=visitContext?.(args.id);return result?{...result,actions:actionList()}:{error:'Context navigation is unavailable'};}
      case 'perform_action': return runAction?Promise.resolve(runAction(args.id,meta)).then(result=>({...result,current:state(),actions:actionList()})):{error:'Action is unavailable'};
      case 'read_content_page': return read(args.id,args.offset);
      case 'find_content': {
        if (typeof args.query !== 'string' || args.query.length > 160 || !args.query.trim()) return { error: 'Enter a short search query.' };
        const terms = args.query.toLocaleLowerCase().trim().split(/\s+/);
        const matches = searchNotes(pages,args.query,{all:args.match_all===true});
        return { total: matches.length, results: matches.slice(0, 8).map(p => {
          const raw=p.text||p.markdown||'', at=Math.max(0,raw.toLocaleLowerCase().indexOf(terms[0])-40);
          return { ...compact(p), excerpt: raw.slice(at, at+240) };
        }) };
      }
      case 'visit_place':
        if (!sections.some(s => s.id === args.id) || !['place','room','shelf'].includes(args.level)) return { error: 'Scene or level not found.' };
        visitSpace(args.id, args.level); return { ok: true, current: state() };
      case 'open_content': {
        const result = read(args.id); if (result.error) return result;
        open(args.id); return { ok: true, current: state(), content: result };
      }
      case 'read_content': return read(args.id);
      case 'move_view': {
        const fn = { overview: home, back, next }[args.direction];
        if (!Object.hasOwn({ overview: 1, back: 1, next: 1 }, args.direction)) return { error: 'Direction not found.' };
        fn(); return { ok: true, current: state() };
      }
      default: return { error: 'Unknown tool. No action taken.' };
    }
  };
}
