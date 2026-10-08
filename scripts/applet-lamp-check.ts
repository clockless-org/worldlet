import assert from 'node:assert/strict';
import {appletLamp,appletLampContent,lampColors,lampLabels,lampOpacity,lampDisplayState,LAMP_BREATH_MS} from '../ui/world/applet-lamp.ts';
import {appletStatus} from '../core/applets/status.ts';
import {stackLampBoxes} from '../ui/world/applet-lamp-label.ts';
assert.equal(appletLamp(),'off');
assert.equal(appletLamp({phase:'browser'}),'off','A website is not proof of login');
assert.equal(appletLamp({phase:'local'}),'off','A catalog entry is not proof of local content');
assert.equal(appletLamp({connected:true}),'ready');
assert.equal(appletLamp({},undefined,{available:true}),'ready');
// Saved findings belong to the Attention Center alone (#918): read or unread, they are content
// that leaves the lamp ready, never a state, color or notice of their own.
const finding={sourceProvider:'gmail',worldItemId:'one',worldItemStatus:'open',worldItemKind:'task',worldItemSignal:{priority:'urgent'}};
for(const worldItemStatus of ['open','read'])assert.equal(appletLamp({},undefined,appletLampContent('gmail',[{...finding,worldItemStatus}])),'ready','A saved finding only shows that the Applet holds content');
assert.equal(appletLamp({connected:true},undefined,appletLampContent('gmail',[finding])),'ready','An unread finding never lights the lamp');
assert.equal(appletLamp({failed:true},undefined,appletLampContent('gmail',[finding])),'error','A failure still shows over saved findings');
assert.equal(appletLampContent('discord',[finding]).available,false);
assert.equal(appletLampContent(undefined,[{...finding,sourceProvider:undefined}]).available,false);
assert.deepEqual(Object.keys(lampLabels),['off','ready','processing','error'],'Four states: no saved-result state');
assert.deepEqual(Object.keys(lampColors),Object.keys(lampLabels),'Every color belongs to a state, so there is no green');
for(const phase of ['reading','syncing','connecting'])assert.equal(appletLamp({phase}),'processing');
assert.equal(appletLamp({failed:true}),'error');
assert.equal(appletLamp({phase:'reading',failed:true}),'processing');
assert.equal(appletLamp({}, {sessions:[{status:'Running'}]}),'processing');
assert.equal(appletLamp({}, {sessions:[{status:'Failed'}]}),'error');
assert.equal(appletLamp({}, {sessions:[{status:'Completed'}]}),'ready');
const app={provider:'gmail'};
assert.equal(appletLamp(appletStatus(app,[{provider:'gmail',connected:true,failed:true}])),'error');
assert.equal(appletLamp(appletStatus(app,[{provider:'gmail',connected:true,failed:false}])),'ready');
assert.equal(appletLamp({usableWithoutLogin:true}),'ready');
for(const key of ['browser','youtube','google-maps','airbnb','github'])assert.equal(appletLamp(appletStatus({key,capability:'browser'})),'ready',key+' supports public use');
assert.equal(appletLamp(appletStatus({key:'netflix',capability:'browser'})),'off');
assert.equal(appletLamp(appletStatus({key:'netflix',capability:'browser'},[{provider:'netflix',connected:true}])),'ready');
assert.equal(appletLamp(appletStatus({key:'browser',capability:'planned'})),'off');
console.log('Applet lamp states passed');

assert.equal(lampColors.ready,0xffffff);
assert.equal(lampColors.processing,lampColors.ready,'Running never uses yellow');
for(const time of [0,1000,2000,4000])assert.equal(lampOpacity('ready',time),.85,'Idle is steady');
assert(LAMP_BREATH_MS>=2000&&LAMP_BREATH_MS<=3000,'Running breath is noticeable, never a flash');
assert(lampOpacity('processing',0)<=.35,'Running dims deeply between breaths, so it reads from the overview');
assert(lampOpacity('processing',0)<lampOpacity('processing',LAMP_BREATH_MS/2));
assert.equal(lampOpacity('processing',0),lampOpacity('processing',LAMP_BREATH_MS));
for(const time of [0,1000,2000,4000])assert.equal(lampOpacity('processing',time,true),1,'Reduced motion is stable');
assert.equal(lampLabels.processing,'Running','Running has a non-motion, non-color label');
assert.equal(lampDisplayState({state:'error'}),'ready','No color-only alert when no real action is available');
assert.equal(lampDisplayState({state:'error',action:{label:'Review',run(){}}}),'error');
assert.equal(lampDisplayState({state:'error',action:{label:'Review',run(){}}},false),'ready','Blurred background cannot show a color whose action is hidden');
for(const state of ['off','ready','processing'] as const)assert.equal(lampDisplayState({state}),state,'Only a failure needs an action for its color');
assert.equal(appletLamp({phase:'unknown'}),'off','Unknown is not successful or running');

// Neighbouring notices (Mail and Calendar in Home) stack instead of overlapping.
{
 const overlaps=(boxes,bottoms)=>boxes.some((a,i)=>boxes.some((b,j)=>i<j&&Math.abs(a.x-b.x)<(a.width+b.width)/2&&bottoms[i]-a.height<bottoms[j]&&bottoms[j]-b.height<bottoms[i]));
 const pair=[{x:612,bottom:365,width:164,height:58},{x:709,bottom:365,width:164,height:58}];
 assert.equal(overlaps(pair,pair.map(b=>b.bottom)),true,'Fixture reproduces the reported overlap');
 const stacked=stackLampBoxes(pair);
 assert.equal(overlaps(pair,stacked),false,'Stacked notices never overlap');
 assert.equal(stacked[0],365,'The first notice keeps its anchor');
 assert(stacked[1]<=365-58-6,'The next notice rises above it with a gap');
 const apart=[{x:200,bottom:365,width:164,height:58},{x:600,bottom:365,width:164,height:58}];
 assert.deepEqual(stackLampBoxes(apart),[365,365],'Separate notices stay at their anchors');
 const top=[{x:300,bottom:90,width:164,height:58},{x:320,bottom:90,width:164,height:58}];
 const low=stackLampBoxes(top);assert.equal(overlaps(top,low),false);assert(low.every((b,i)=>b-top[i].height>=8),'No room above: the notice drops below instead of leaving the window');
 const three=[0,40,80].map(x=>({x:400+x,bottom:300,width:164,height:58}));
 assert.equal(overlaps(three,stackLampBoxes(three)),false,'Several neighbours stack');
 assert.deepEqual(stackLampBoxes(three),stackLampBoxes(three),'Stacking is deterministic between frames');
}
console.log('Lamp notice stacking passed');
