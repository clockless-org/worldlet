// Compile-only contract regression. Never sends a request.
import type {HostCall} from '../contracts/platform.ts';
import {callHost} from '../platform/bridge/host.ts';
import {withProductAnalytics} from '../ui/shell/product-analytics.ts';
async function check(call:HostCall){
 void call('agentChat',{id:'turn',text:'Hello'});
 void call('agentCancel');
 void call('browserHide');
 void call('worldItemStatus',{id:'item',status:'done'});
 // @ts-expect-error local status does not send to the source service
 void call('worldItemStatus',{id:'item',status:'sent'});
 // @ts-expect-error only status requests carry a snooze
 void call('worldItemRead',{id:'item',snoozedUntil:'tomorrow'});
 void call('browserLayout',{rect:{x:0,y:0,width:400,height:300}});
 void call('browserPip',{applet:'youtube',rect:{x:0,y:0,width:336,height:189},live:['youtube']});
 void call('browserPip',{applet:'youtube'});
 void call('browserOutcomeAction',{id:'receipt',done:true});
 const surface=await call('browserHide');
 const success:true=surface.ok;
 const steering=await call('agentSteer',{id:'turn',text:'Also check this'});
 const accepted:boolean=steering.accepted;
 const receipt=await call('browserOutcomeAction',{id:'receipt',done:true});
 const status:'unverified'|'user_confirmed'|'not_completed'=receipt.status;
 // @ts-expect-error surface reply cannot be used as a model answer
 surface.message;
 // @ts-expect-error steering acceptance is not a string
 const label:string=steering.accepted;
 // @ts-expect-error cancellation has no acceptance field
 (await call('agentCancel')).accepted;
 // @ts-expect-error receipt status is not an unchecked string
 const completed:'sent'=receipt.status;
 void success;void accepted;void status;void label;void completed;
 // @ts-expect-error chat requires its body
 void call('agentChat');
 // @ts-expect-error chat requires text
 void call('agentChat',{id:'turn'});
 // @ts-expect-error confirmation must be a boolean
 void call('browserOutcomeAction',{id:'receipt',done:'true'});
 // @ts-expect-error callers cannot manufacture inspection evidence
 void call('browserOutcomeAction',{id:'receipt',done:true,inspectedAt:'now'});
 // @ts-expect-error geometry cannot be a string
 void call('browserLayout',{rect:'all'});
 // @ts-expect-error hide does not accept an arbitrary URL
 void call('browserHide',{url:'https://example.com'});
 // @ts-expect-error the window always names its Applet
 void call('browserPip',{rect:{x:0,y:0,width:336,height:189}});
}
// The analytics wrapper must preserve the public signature.
const instrumented=withProductAnalytics(callHost).call;
const typed:HostCall=instrumented;
void check;void typed;
