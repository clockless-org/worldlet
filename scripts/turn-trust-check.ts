import assert from 'node:assert/strict';
import {type HostTurnTrust,turnBrowserAdmission,turnTrustInherit,turnTrustObserve,turnWriteAdmission,turnWriteNotice,worldItemRestore,worldItemSnapshot} from '../core/agent/turn-trust.ts';
import {invoke as invokeSharedCore} from '../core/index.ts';
import {browserElementPolicy,browserEffectDecision,browserFinalStep,browserFollowThrough} from '../core/browser/agent-browser.ts';

const fold=(events:object[])=>events.reduce<HostTurnTrust>((state,event)=>turnTrustObserve(state,event),{untrusted:false,sources:[]});
const write={type:'tool',name:'archive_world_items',args:{ids:['a']}};

// A direct request, including looking up Worldlet's own items, executes without confirmation.
const direct=fold([{type:'tool',name:'query_world_items',args:{}},{type:'progress',name:'query_world_items'}]);
assert.deepEqual(turnWriteAdmission(direct,write),{guarded:true,allowed:true,tool:'archive_world_items'});
assert.deepEqual(turnWriteAdmission(direct,{type:'tool',name:'_world_authorize',args:{name:'configure_world_check'}}),{guarded:true,allowed:true,tool:'configure_world_check'});
assert.equal(turnWriteAdmission({untrusted:true,sources:['x']},{type:'tool',name:'query_world_items',args:{}}).allowed,true,'reads are never guarded');

// Every untrusted read makes later guarded writes in the same turn auto-deny.
for(const event of [
 {type:'tool',name:'_world_authorize',args:{name:'read_world_source'}},
 {type:'tool',name:'_world_authorize',args:{name:'read_connected_google',provider:'gmail'}},
 {type:'tool',name:'_source_result',args:{provider:'gmail',records:[]}},
 {type:'tool',name:'read_content',args:{}},
 {type:'tool',name:'read_world_history',args:{}},
 // Past conversations hold imported third-party text (other people's chat and mail lines).
 {type:'tool',name:'read_companion_archive',args:{query:'trip'}},
 {type:'tool',name:'_world_authorize',args:{name:'read_companion_archive'}},
 {type:'tool',name:'browse_web',args:{operation:'read'}},
 {type:'tool',name:'automate_browser',args:{operation:'snapshot'}},
 {type:'progress',name:'mcp_notion_search'},
 {type:'progress',name:'web_extract'},
 {type:'tool',name:'custom',args:{},result:{untrustedContent:true}},
]){
 const state=fold([event,{type:'tool',name:'query_world_items',args:{}}]);
 for(const tool of ['update_world_item','archive_world_items','configure_world_check']){
  const denied=turnWriteAdmission(state,{type:'tool',name:tool,args:{}});
  assert.equal(denied.allowed,false,JSON.stringify(event));
  assert.match(denied.error!,/Worldlet blocked this write.*untrusted content.*Nothing was changed/);
 }
 assert.equal(turnWriteAdmission(state,{type:'tool',name:'_world_authorize',args:{name:'update_world_item'}}).allowed,false);
}
assert.equal(fold([{type:'tool',name:'_source_result',args:{failed:true}}]).untrusted,false,'a failed read carried no text');
assert.equal(fold([{type:'tool',name:'browse_web',args:{operation:'open'}}]).untrusted,false);
// Hermes-internal progress follows the shared fail-closed policy; host-routed World tools defer to their tool events.
assert.equal(fold([{type:'progress',name:'memory'},{type:'progress',name:'call_world_tool'}]).untrusted,false);
assert.equal(fold([{type:'progress',name:'terminal'}]).untrusted,true);

// Routines (#404): scheduling unattended work follows turn intent; pause/remove always run.
const routine=(action?:string)=>({type:'tool',name:'_world_authorize',args:{name:'manage_routines',...(action?{action}:{})}});
const tainted=fold([{type:'tool',name:'_world_authorize',args:{name:'read_connected_google',provider:'gmail'}}]);
for(const action of ['create','update','resume',undefined]){
 assert.deepEqual(turnWriteAdmission(direct,routine(action)),{guarded:true,allowed:true,tool:'manage_routines'});
 const refused=turnWriteAdmission(tainted,routine(action));
 assert.equal(refused.allowed,false,`unconfirmed ${action} after an email read must be rejected`);
 assert.match(refused.error!,/does not create, change or resume scheduled routines.*Nothing was scheduled/);
}
for(const action of ['pause','remove','list','result'])assert.deepEqual(turnWriteAdmission(tainted,routine(action)),{guarded:false,allowed:true});
assert.equal(fold([routine('list'),routine('pause')]).untrusted,false,'listing Worldlet routines is not untrusted');
assert.equal(turnWriteAdmission(fold([routine('result')]),routine('create')).allowed,false,'a saved run output is untrusted');

// Durable writes without a host notice (#672): note edits, how Fox speaks and DoorDash cart changes.
const read=fold([{type:'tool',name:'read_content',args:{id:'page'}}]);
for(const event of [
 {type:'tool',name:'patch_content',args:{id:'n'}},
 {type:'tool',name:'create_content',args:{}},
 {type:'tool',name:'set_worldlet_preference',args:{setting:'companion_style',value:'x'}},
 {type:'tool',name:'use_doordash',args:{operation:'cart_add'}},
 {type:'tool',name:'_world_authorize',args:{name:'use_doordash',operation:'cart_remove'}},
 {type:'tool',name:'_world_authorize',args:{name:'use_doordash'}},
]){
 assert.deepEqual(turnWriteAdmission(direct,event),{guarded:true,allowed:true},'a trusted turn is unchanged and takes no host notice');
 const refused=turnWriteAdmission(read,event);
 assert.equal(refused.allowed,false,JSON.stringify(event));assert.equal(refused.tool,undefined);
 assert.match(refused.error!,/Worldlet blocked this write.*untrusted content/);
}
for(const event of [
 {type:'tool',name:'set_worldlet_preference',args:{setting:'text_size',value:'large'}},
 {type:'tool',name:'use_doordash',args:{operation:'search'}},
 {type:'tool',name:'_world_authorize',args:{name:'use_doordash',operation:'cart_list'}},
 {type:'tool',name:'read_content',args:{}},
])assert.deepEqual(turnWriteAdmission(read,event),{guarded:false,allowed:true},JSON.stringify(event));
assert.equal(fold([{type:'tool',name:'_world_authorize',args:{name:'use_doordash',operation:'search'}}]).untrusted,true,'DoorDash results stay untrusted');

// A background Applet task never starts trusted after untrusted content: starting one is not
// refused (owner decision 2026-10-08), but every task inherits the starting turn's taint.
const applet={type:'tool',name:'start_applet_task',args:{applet:'app-youtube',task:'x'}};
assert.deepEqual(turnWriteAdmission(direct,applet),{guarded:false,allowed:true});
assert.deepEqual(turnWriteAdmission(read,applet),{guarded:false,allowed:true});
assert.equal(turnWriteAdmission(read,{type:'tool',name:'_world_authorize',args:{name:'start_applet_task'}}).allowed,true);
const child=turnTrustInherit(read);
assert.deepEqual(child,{untrusted:true,sources:['read_content']});
child.sources.push('later');assert.deepEqual(read.sources,['read_content'],'the child holds its own copy');
for(const event of [{type:'tool',name:'delete_content',args:{id:'n'}},{type:'tool',name:'patch_content',args:{id:'n'}},routine('create'),write])
 assert.equal(turnWriteAdmission(turnTrustInherit(read),event).allowed,false,'a tainted parent’s child is refused '+JSON.stringify(event));
assert.deepEqual(turnTrustInherit(direct),{untrusted:false,sources:[]},'a trusted parent’s child starts trusted');
assert.deepEqual(turnTrustInherit(undefined),{untrusted:false,sources:[]});
assert.deepEqual(turnTrustInherit({untrustedSource:'browse_web'}),{untrusted:true,sources:['browse_web']},'the per-turn TurnTrust shape carries over too');

// Undo restores exact prior state, including candidate which the update path cannot set.
const before={id:'a',status:'candidate',statusOrigin:'agent',snoozedUntil:'2026-10-01T00:00:00Z',title:'T'};
const notice=turnWriteNotice('archive_world_items',{ids:['a']},[before]);
assert.match(notice.text,/Archived 1 item\./);
assert.deepEqual(notice.undo,{kind:'items',items:[worldItemSnapshot(before)]});
const archived={...before,status:'dismissed',statusOrigin:'user',updatedAt:'x'};delete (archived as any).snoozedUntil;
assert.deepEqual(worldItemRestore(archived,notice.undo.kind==='items'?notice.undo.items[0]:null as any,'2026-09-28T00:00:00Z'),{...before,updatedAt:'2026-09-28T00:00:00Z'});
assert.throws(()=>worldItemRestore({id:'b'},worldItemSnapshot(before),'now'),/no longer matches/);
const check=turnWriteNotice('configure_world_check',{provider:'gmail',enabled:false},{id:'gmail',provider:'gmail',enabled:true,intervalMinutes:45});
assert.deepEqual(check.undo,{kind:'check',request:{provider:'gmail',enabled:true,intervalMinutes:45}});
assert.deepEqual(turnWriteNotice('configure_world_check',{provider:'gmail',enabled:true},null).undo,{kind:'check',request:{provider:'gmail',enabled:false}});

// Hosts reach the same rule through the shared-core registry.
const call=(operation:string,value:object)=>JSON.parse(invokeSharedCore(operation,JSON.stringify(value))).value;
const state=call('turnTrustObserve',{state:{},event:{type:'progress',name:'browser_snapshot'}});
assert.equal(call('turnWriteAdmission',{state,event:write}).allowed,false);
assert.equal(call('turnTrustInherit',{state}).untrusted,true,'hosts start an Applet task with its parent turn’s trust');
assert.equal(call('turnWriteNotice',{tool:'update_world_item',args:{id:'a',status:'done'},before:[before]}).text.startsWith('Marked the item done.'),true);
// #671: page content never authorizes a browser effect. After an untrusted automate_browser
// snapshot, click/fill/submit are checked; the snapshot itself and scrolling are not.
const act=(operation:string,extra={})=>({type:'tool',name:'automate_browser',args:{operation,documentId:'d1',ref:'e1',...extra}});
const snapshot={...act('snapshot'),result:{ok:true,documentId:'d1',untrustedContent:true}};
assert.equal(turnBrowserAdmission(fold([]),act('click')).check,false,'a trusted turn acts directly');
const paged=fold([snapshot]);
for(const operation of ['click','fill','submit'])assert.equal(turnBrowserAdmission(paged,act(operation)).check,true,operation+' after an untrusted snapshot is checked');
for(const operation of ['snapshot','scroll','open','receipts'])assert.equal(turnBrowserAdmission(paged,act(operation)).check,false,operation+' is unchanged');
assert.equal(turnWriteAdmission(paged,act('click')).guarded,false,'browser actions are checked by element, not denied wholesale');
const shop='https://shop.example/cart',element=(role:string,name:string,type='',url=shop)=>browserElementPolicy({role,name,type,url});
const decide=(operation:string,prepared:any)=>browserEffectDecision({operation,prepared});
// Fox never decides these on its own. Money, paid plans, access grants and deletion are held
// back (and ask the person, below); request wording is not an input, so no request can approve them.
for(const name of ['Place order','Buy now','Pay $40','Checkout','Transfer funds','Subscribe','Authorize app','Grant access','Delete account','立即购买','确认付款'])
 assert.equal(decide('click',element('button',name)).allowed,false,'refused automatically: '+name);
assert.match(decide('click',element('button','Place order')).error!,/Not done: "Place order".*nothing was clicked/);
for(const request of ['Do not buy anything on shop.example; only compare prices','Buy the socks in my cart on shop.example'])
 assert.equal(browserEffectDecision({operation:'click',prepared:element('button','Place order'),request} as any).allowed,false,'request text never approves: '+request);
// The tasks Fox is asked to do run directly and leave a receipt.
for(const name of ['Cancel free trial','Confirm cancellation','Unsubscribe','Cancel subscription','Book appointment','Send message','Continue','Keep my trial'])
 assert.equal(decide('click',element('button',name)).allowed,true,'runs directly: '+name);
assert.equal(decide('submit',element('searchbox','Search products')).allowed,true,'a search submit runs directly');
assert.equal(decide('fill',element('searchbox','Search products')).allowed,true,'typing runs directly');
assert.equal(browserElementPolicy({role:'textbox',name:'Password',type:'password'}).error!==undefined,true,'sensitive fields stay refused');
// One question, before the last step (owner decision 2026-10-03): the step that pays, orders,
// sends, submits, books, cancels a plan, grants access or deletes asks; everything else runs.
const final=(operation:string,prepared:any,untrusted=false)=>browserFinalStep({operation,prepared,untrusted}).confirm;
for(const name of ['Place order','Pay $40','Checkout','Send message','Submit','Publish','Book appointment','Reserve','Confirm attendance','Cancel free trial','Cancel my subscription','Delete account','Grant access','发送','提交','确认付款'])
 assert.equal(final('click',element('button',name)),true,'asks before: '+name);
for(const name of ['Next page','Continue','Show more','Add to cart','Unsubscribe','Keep my trial','I agree','Search','Annual billing'])
 assert.equal(final('click',element('button',name)),false,'runs directly: '+name);
assert.equal(final('submit',element('searchbox','Search products')),false,'a search runs directly');
assert.equal(final('submit',element('textbox','Message Sam')),true,'Enter in a message box asks');
for(const operation of ['open','snapshot','fill','scroll'])assert.equal(final(operation,element('button','Place order')),false,operation+' never asks');
assert.equal(final('click',element('button','Authorize app'),true),true,'after untrusted content a held-back step asks');
assert.deepEqual(browserFinalStep({operation:'click',prepared:element('button','  Place\n order ')}),{confirm:true,label:'Place order'});
// One Go ahead also covers the site's "Are you sure?" page for that step, so a two-page
// cancellation asks once; a different action, site, task or a stale approval asks again.
const approved={label:'Cancel free trial',url:'https://streambox.example/account',taskId:'t1',at:1000};
const follows=(name:string,over:any={},url='https://www.streambox.example/cancel')=>browserFollowThrough({approved,operation:'click',prepared:element('button',name,'submit',url),taskId:'t1',now:5000,...over});
for(const name of ['Confirm cancellation','Yes, cancel','Cancel free trial','确认取消'])assert.equal(follows(name),true,'the confirmation page runs on the same Go ahead: '+name);
for(const name of ['Send message','Book appointment','Delete account','Confirm and buy','Pay $40'])assert.equal(follows(name),false,'another action asks again: '+name);
assert.equal(follows('Confirm cancellation',{},'https://other.example/cancel'),false,'another site asks again');
assert.equal(follows('Confirm cancellation',{taskId:'t2'}),false,'another task asks again');
assert.equal(follows('Confirm cancellation',{now:1000+121_000}),false,'a stale approval asks again');
assert.equal(follows('Confirm cancellation',{approved:null}),false,'without a Go ahead it asks');
assert.equal(browserFollowThrough({approved:{...approved,label:'Delete account'},operation:'click',prepared:element('button','Delete forever','',approved.url),taskId:'t1',now:5000}),true,'a held step\'s own confirmation runs on its Go ahead');
console.log('PASS browser effects: one question before the last step that pays, sends or submits, also after untrusted content, covering the site\'s own confirmation of it; other steps run directly');
console.log('PASS turn trust: direct writes run with undo, untrusted turns auto-deny guarded writes and routine scheduling');
