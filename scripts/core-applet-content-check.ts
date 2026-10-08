import {appletAttention,appletConnectionGuide} from '../ui/world/applet-attention.ts';
import assert from 'node:assert/strict';
import {coreAppletItems,calendarDay} from '../ui/world/applet-content.ts';
const records=[{id:'live:gmail:one',title:'Same subject'},{id:'live:gmail:two',title:'Same subject'},{id:'live:gmail:three',title:'Completed source'}];
const finding=(id,status,title)=>({worldItemId:id,sourceProvider:'gmail',worldItemStatus:status,title,sourceId:'world-item:'+id,worldItemSources:[{provider:'gmail',id}],worldItemSignal:{quote:'Needs your decision',priority:'high'}});
const items=coreAppletItems('gmail',records,[finding('one','open','Approve estimate'),finding('three','done','Done')]);
assert.equal(items.length,3,'exact source identities replace matching originals');
assert.equal(items[0].title,'Approve estimate');assert.equal(items[0].record.title,'Same subject');
assert.equal(items.filter(i=>i.status!=='done').length,2,'completed finding suppresses its raw duplicate');
assert.equal(items[2].record.id,'live:gmail:two','same-title original remains independently accessible');
assert.equal(calendarDay('2026-09-18',true),'2026-09-18');assert.equal(calendarDay('invalid'),'');
console.log('PASS core Applet source identity, curated/original separation and all-day dates');

const attention=(id,kind,status,priority)=>({worldItemId:id,sourceProvider:"gmail",worldItemKind:kind,worldItemStatus:status,worldItemSignal:{priority},title:id});
assert.equal(appletAttention("gmail",[attention("done","task","done","urgent"),attention("read","update","read","urgent")]),null);
assert.equal(appletAttention("gmail",[attention("task","task","open","normal"),attention("event","event","open","urgent")]).id,"event");
assert.equal(appletAttention("gmail",[attention("task","task","read","high")]).state,"needsAction");

for(const priority of ['normal','high','urgent']){
 const saved=attention('task','task','open',priority);
 assert.equal(coreAppletItems('gmail',[],[saved])[0].attention.state,'needsAction','saved tasks retain their source Applet content marker');
}
assert.equal(appletConnectionGuide('gmail',{phase:'connected'}),null);
assert.equal(appletConnectionGuide('gmail',{phase:'disconnected'}).hint,'Connect your account');
assert.equal(appletConnectionGuide('google-calendar',{phase:'disconnected'}).badge,'connection');
assert.equal(appletConnectionGuide('gmail',{phase:'reading'}),null);
assert.equal(appletConnectionGuide('apple-notes',{phase:'disconnected'}),null);
