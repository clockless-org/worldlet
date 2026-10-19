// The host's Attention Center for a phone or a browser without the World page (agent/attention hostAttention,
// agent/windows/README.md#web): the same rows, in the same groups, as the desktop builds from the same World items.
import assert from 'node:assert/strict';
import {hostAttention,collectMatters,collectNativeActions,upcomingEvents} from '../agent/attention/index.ts';
import {projectNativeWorld} from '../ui/world/world-projection.ts';
import {hostAppletPlaces,threadPairs,phoneAttention} from '../agent/windows/index.ts';

// The World page reads the clock itself, so the items are placed around the real now.
const now=Date.now(),hour=3600_000;
const item=(id:string,kind:string,extra:Record<string,unknown>={})=>({id,kind,provider:'gmail',title:'Title '+id,reason:'Evidence for '+id,context:'Evidence for '+id,summary:'A fictional item.',attentionContentVersion:1,status:'open',priority:'normal',policyVersion:2,receivedAt:new Date(now-hour).toISOString(),sources:[{provider:'gmail',id:'source-'+id,quote:'Synthetic '+id}],...extra});
const items=[
 item('task-1','task',{priority:'high'}),
 item('update-1','update'),
 item('event-1','event',{provider:'google-calendar',start:new Date(now+20*hour).toISOString(),end:new Date(now+21*hour).toISOString(),sources:[{provider:'google-calendar',id:'cal-1',quote:'Synthetic meeting'}]}),
 item('later-1','task',{snoozedUntil:new Date(now+5*hour).toISOString()}),
 item('done-1','task',{status:'done'}),
];
const host=hostAttention(items,{now});
const ids=(rows:any[])=>rows.map(r=>r.worldItemId).sort();
assert.deepEqual(ids(host.now),['event-1','task-1','update-1'],'open items are Now');
assert.deepEqual(ids(host.later),['later-1'],'a snoozed item waits in Later');
assert.equal(host.later[0].snoozed,true);
assert.deepEqual(host.now.map(r=>r.state),['event','needsAction','unseen'],'Coming Up, then Worth Doing, then Worth Knowing');
assert(host.now.every(r=>Number.isInteger(r.level)&&r.actionTitle&&r.context),'each row has its level, title and context');
assert(Array.isArray(host.saved.ids),'the focus state comes back for the next call');
assert.deepEqual(hostAttention(items,{now,saved:host.saved}).now.map(r=>r.worldItemId),host.now.map(r=>r.worldItemId),'steady between calls');

// The desktop's rows for the same items (the World page's projection and ui/hud/native-hud.ts matterItems).
const world:any=projectNativeWorld({workspaceId:'host-attention-check',revision:1,sources:[],knowledge:[],onboarding:{completed:true},ongoing:[],worldItems:items,momentApplets:[],siteApplets:[]});
const pages=new Map<string,any>(world.pages.map((p:any)=>[p.id,p])),sections=world.spaces;
const desktop=collectMatters({sections,pages,activities:collectNativeActions({pages,sections}).activities,events:upcomingEvents({pages,sections,limit:Infinity}),current:null,currentSpace:null,depth:'overview',now}).filter((m:any)=>m.signalCount);
const strip=(rows:any[])=>rows.map(r=>[r.worldItemId,r.state,r.actionTitle,r.context,r.when?.label??null]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
assert.deepEqual(strip(host.now),strip(desktop),'the same rows, titles, context and times as the desktop');
console.log('PASS the host builds the Attention Center for a phone or browser from World items: the desktop\'s rows, groups, focus and Later.');

// The Applets page without the World page: the Applets kept (unlocked, less hidden), each lamp from its connection, and
// an Applet's own turns with Fox paired as the page's thread gives them.
const places=hostAppletPlaces({onboarding:{unlockedApplets:['app-gmail','app-github','app-youtube'],hiddenApplets:['app-youtube']},connections:[{provider:'gmail',connected:true,status:'connected'}]});
assert.deepEqual(places.map(p=>p.key),['gmail','github'],'the kept Applets, less the hidden one');
assert.equal(places[0].state,'ready','a connected account lights its lamp');
assert.deepEqual(threadPairs([{role:'user',text:'Any news?',createdAt:'2026-10-14T00:00:00Z'},{role:'assistant',text:'Two new mails.',createdAt:'2026-10-14T00:00:02Z'},{role:'assistant',text:'One more.',createdAt:'2026-10-14T00:01:00Z'}]),
 [{user:'Any news?',text:'Two new mails.',at:'2026-10-14T00:00:00Z'},{user:'',text:'One more.',at:'2026-10-14T00:01:00Z'}],'each line with its answer');
const applets=phoneAttention({now:[],later:[],world:{places,thread:key=>key==='gmail'?threadPairs([{role:'user',text:'Any news?',createdAt:'2026-10-14T00:00:00Z'},{role:'assistant',text:'Two new mails.',createdAt:'2026-10-14T00:00:02Z'}]):[]}},now).applets??[];
assert.deepEqual(applets.map(a=>a.key),['gmail','github']);
assert.equal(applets[0].fox?.turns[0].text,'Two new mails.','an Applet carries its own turns');
console.log('PASS the host lists the Applets page for a phone or browser: the kept Applets, their lamps and their own turns with Fox.');
