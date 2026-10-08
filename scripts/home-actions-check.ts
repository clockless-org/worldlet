import assert from 'node:assert/strict';
import {homeWritePlan} from '../core/applets/index.ts';
import {worldActions,resolveAction} from '../core/tools/index.ts';
const due='2026-10-01T09:30:00-07:00';
assert.equal(homeWritePlan({provider:'apple-reminders',operation:'complete',id:'live:apple-reminders:abc'}).id,'abc');
assert.equal(homeWritePlan({provider:'google-calendar',operation:'create',title:'Meeting',start:due,end:'2026-10-01T10:30:00-07:00'}).title,'Meeting');
assert.equal(homeWritePlan({provider:'apple-notes',operation:'append',id:'n',text:'<script> & "quoted"\n正文'}).text,'<script> & "quoted"\n正文');
for(const bad of [
 {provider:'apple-reminders',operation:'complete',id:'r',title:'Ignored change'},
 {provider:'apple-notes',operation:'append',id:'n',text:''},
 {provider:'apple-reminders',operation:'reschedule',id:'r',due:'2026-10-01'},
 {provider:'google-calendar',operation:'create',title:'T',start:due,end:due},
 {provider:'apple-reminders',operation:'reschedule',id:'r',due:'2026-02-30T09:00:00Z'},
 {provider:'apple-notes',operation:'delete',id:'n'},
 {provider:'apple-notes',operation:'create',title:'T',id:'existing'},
 {provider:'apple-reminders',operation:'complete',id:'r',confirmed:true},
])assert.throws(()=>homeWritePlan(bad));
const actions=worldActions();
for(const provider of ['google-calendar','apple-reminders','apple-notes']){
 assert.equal(resolveAction(actions,'applet:'+provider,'draft',{operation:'create',title:'T'}).args.provider,provider);
 assert.throws(()=>resolveAction(actions,provider,'draft',{provider:'gmail',operation:'create'}));
 assert.ok(!worldActions({sample:true}).some(a=>a.target===provider&&a.action==='draft'));
 assert.ok(!actions.some(a=>a.target===provider&&a.action==='commit'));
}
console.log('PASS Home write plans, timezone validation, source identity, no ignored changes, fixed gateway routing and no model commit');
