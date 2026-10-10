// Shared picture-in-picture rule for website Applets (#919, #950, core/browser/picture-in-picture.ts):
// which Applets offer it, where the window shows and goes, its size and how it counts against live pages.
import assert from 'node:assert/strict';
import {FOX_COPY,PAGE_RESUME,PICTURE_IN_PICTURE,foxCopyPlacement,TASK_PICTURE_IN_PICTURE,desktopTaskPictureInPicturePlacement,livePagePlan,pageFrameRate,pictureInPictureApplet,pictureInPicturePlacement,pictureInPictureShare,pictureInPictureShows,taskPictureInPictureAspect} from '../core/browser/index.ts';

// Applets whose own view is their website; not local Applets, meetings or a scene Applet's Web mode.
for(const key of ['youtube','tiktok','x','netflix','twitch','bilibili','browser'])assert.equal(pictureInPictureApplet(key),true,key+' offers it');
for(const key of ['gmail','notion','weather','meetings','apple-notes','nope'])assert.equal(pictureInPictureApplet(key),false,key+' does not');
// It shows in the World and waits out of sight inside an Applet, content or search.
for(const depth of ['overview','area','building','place','room'])assert.equal(pictureInPictureShows(depth),true,depth);
for(const depth of ['object','note','search','',undefined as any])assert.equal(pictureInPictureShows(depth),false,String(depth));

const {share,minWidth,maxShare,margin,gap}=PICTURE_IN_PICTURE,chrome={top:38,right:6,bottom:6,left:6};
const place=(width:number,height:number,avoid=[],chosen?:number)=>pictureInPicturePlacement({viewport:{width,height},avoid,chrome,share:chosen});
// By default the frame is the World's right third, with the margin all round, and 16:9.
let spot=place(1440,840);
assert.deepEqual(spot.frame,{x:1440-margin-448,y:840-margin-(245+44),width:448,height:245+44});
assert.deepEqual(spot.video,{x:spot.frame.x+6,y:spot.frame.y+38,width:436,height:245});
assert.equal(spot.frame.x,1440*2/3+margin,'the right third');
assert.equal(place(1920,1080).frame.width,1920/3-2*margin);
// The person's chosen size, kept as a share of the World, within the bounds.
assert.equal(pictureInPictureShare(undefined),share);assert.equal(pictureInPictureShare('0.4'),share);assert.equal(pictureInPictureShare(NaN),share);
assert.equal(pictureInPictureShare(0.9),maxShare);assert.equal(pictureInPictureShare(0.4),0.4);
assert.equal(place(1440,840,[],0.45).frame.width,Math.round(1440*0.45-2*margin));
assert.equal(place(1440,840,[],0.9).frame.width,1440*maxShare-2*margin,'never wider than the maximum share');
assert.equal(place(1440,840,[],0.1).video.width,minWidth,'never narrower than the minimum');
// It moves up past what it would cover, as far as needed, keeping `gap` clear.
const footer={x:1020,y:786,width:408,height:48},dialogue={x:960,y:520,width:470,height:100};
spot=place(1440,840,[footer]);
assert.equal(spot.frame.y+spot.frame.height,footer.y-gap,'just above the footer');
spot=place(1440,840,[footer,dialogue]);
assert.equal(spot.frame.y+spot.frame.height,dialogue.y-gap,'above a dialogue in its way');
const fox={x:500,y:658,width:440,height:174},greeting={x:490,y:555,width:460,height:95};
assert.equal(place(1440,840,[fox,greeting,footer]).frame.y+place(1440,840,[fox,greeting,footer]).frame.height,footer.y-gap,'Fox in the middle third leaves the right third free');
assert.equal(place(1440,840,[{x:0,y:0,width:0,height:900},{x:1300,y:700,width:NaN,height:50}]).frame.y,840-margin-289,'empty and broken boxes do not count');
// Where the size has no room, it narrows only as far as it must; below the minimum it waits.
const smallFox={x:230,y:468,width:440,height:174},smallGreeting={x:300,y:339,width:300,height:121},controls={x:693,y:40,width:183,height:92};
spot=place(900,650,[smallFox,smallGreeting,controls,{x:480,y:596,width:408,height:48}],0.45);
assert.ok(spot.video.width<Math.round(900*0.45-2*margin-12)&&spot.video.width>=minWidth,'a narrower window in the smallest World: '+spot.video.width);
assert.equal(place(1440,840,[{x:900,y:100,width:540,height:740}]),null);
assert.equal(place(minWidth+2*margin+11,600),null);
assert.equal(place(0,0),null);

// The window's page is live while it shows and takes one of the live places.
const minute=60_000,now=100*minute,hidden=new Map([['x',now-minute],['netflix',now-2*minute],['youtube',now-3*minute]]);
assert.deepEqual(livePagePlan(hidden,now,'youtube'),{live:['youtube','x'],nextCheck:now-minute+PAGE_RESUME.liveMs});
assert.deepEqual(livePagePlan(new Map(),now,'youtube'),{live:['youtube'],nextCheck:null},'it does not expire');
assert.deepEqual(livePagePlan(hidden,now).live,['x','netflix'],'without a window nothing changes');
console.log(`PASS picture in picture: website Applets offer it; in the World only, a 16:9 window in the right third (or the person's size, ${minWidth} px to ${maxShare*100}% of the World) moves up past what it would cover, narrows only when it must, or waits; it holds one of ${PAGE_RESUME.livePages} live places.`);

// Task picture in picture (#1175): the window keeps the page's own shape between square and 2.2:1, renders
// fewer frames shown smaller and never none out of sight, and beside the desktop Companion it sits on the
// Companion's left (right when the left has no room), bottom-aligned, inside the work area.
assert.equal(taskPictureInPictureAspect({width:1000,height:600}),1000/600);
assert.equal(taskPictureInPictureAspect({width:500,height:900}),TASK_PICTURE_IN_PICTURE.minAspect,'a tall page shows square');
assert.equal(taskPictureInPictureAspect({width:3000,height:600}),TASK_PICTURE_IN_PICTURE.maxAspect,'a very wide page shows at most 2.2:1');
assert.equal(taskPictureInPictureAspect({width:0,height:0}),PICTURE_IN_PICTURE.aspect,'no size yet: 16:9');
const {fps,desktop}=TASK_PICTURE_IN_PICTURE;
assert.deepEqual([pageFrameRate({width:800,height:600,scaled:false}),pageFrameRate({width:320,height:240,scaled:true}),pageFrameRate({width:0,height:0,scaled:true})],[fps.panel,fps.scaled,fps.waiting]);
// The panel follows the display's refresh rate, 60 to 120 (owner Order 2026-10-06: the browser felt laggy).
assert.deepEqual([120,119.88,144,59.94,30,0,Number.NaN].map(refresh=>pageFrameRate({width:800,height:600,scaled:false,refresh})),[120,120,fps.display,60,fps.panel,fps.panel,fps.panel]);
assert.equal(pageFrameRate({width:320,height:240,scaled:true,refresh:120}),fps.scaled);
assert.ok(fps.panel>fps.scaled&&fps.scaled>fps.waiting&&fps.waiting>0,'out of sight is the lowest rate, never none');
const area={x:0,y:25,width:1512,height:920},companion={x:1100,y:620,width:380,height:300};
const beside=desktopTaskPictureInPicturePlacement({area,companion,aspect:1.6});
assert.deepEqual(beside,{x:companion.x-desktop.gap-desktop.width,y:companion.y+companion.height-225,width:desktop.width,height:225},'left of the Companion, bottom-aligned: '+JSON.stringify(beside));
const atLeft=desktopTaskPictureInPicturePlacement({area,companion:{x:20,y:620,width:380,height:300},aspect:1.6});
assert.equal(atLeft.x,20+380+desktop.gap,'no room on the left: on the right');
const high=desktopTaskPictureInPicturePlacement({area,companion:{x:1100,y:30,width:380,height:120},aspect:1});
assert.equal(high.y,area.y+desktop.margin,'never above the work area');
const corner=desktopTaskPictureInPicturePlacement({area,companion:null,aspect:2});
assert.deepEqual(corner,{x:area.x+area.width-desktop.margin-desktop.width,y:area.y+area.height-desktop.margin-180,width:desktop.width,height:180},'without the Companion: the bottom-right corner');
const narrow=desktopTaskPictureInPicturePlacement({area:{x:0,y:0,width:300,height:500},companion:null,aspect:1.5});
assert.ok(narrow.width===300-2*desktop.margin&&narrow.x===desktop.margin,'a narrow screen narrows it to fit');
console.log('PASS task picture in picture: the page\'s own shape (square to 2.2:1), frame rates by place (never none), and the window beside the desktop Companion inside the work area');
// Fox's copy of the page (owner request 2026-10-09): the panel's top-right corner, in the page's shape.
{
 const panel={x:100,y:60,width:1200,height:760},spot=foxCopyPlacement({panel,page:panel})!;
 assert.equal(spot.width,Math.round(1200*FOX_COPY.share),'a share of the panel\'s width');
 assert.equal(spot.x+spot.width,panel.x+panel.width-FOX_COPY.margin,'at its right edge');
 assert.equal(spot.y,panel.y+FOX_COPY.margin,'at its top');
 assert.equal(spot.height,Math.round(spot.width/(1200/760)),'in the page\'s shape');
 assert.equal(foxCopyPlacement({panel:{...panel,width:2400},page:panel})!.width,FOX_COPY.maxWidth,'never wider than maxWidth');
 assert.equal(foxCopyPlacement({panel:{...panel,width:800},page:panel})!.width,FOX_COPY.minWidth,'never narrower than minWidth');
 assert.equal(foxCopyPlacement({panel:{...panel,width:FOX_COPY.minPanel-1},page:panel}),null,'a narrow panel keeps Fox on the person\'s page');
 assert.equal(foxCopyPlacement({panel:{...panel,height:100},page:{width:900,height:900}}),null,'no room for its height');
 assert.equal(foxCopyPlacement({panel,page:{width:0,height:0}}),null);
 console.log('PASS Fox\'s copy: the panel\'s top-right corner, a share of its width within limits, in the page\'s shape, none in a small panel');
 // Owner Order 2026-10-10: at the window's top right, above Fox's conversation box, not over the page.
 const page={width:1030,height:720},aspect=1030/720,left={x:20,y:130,width:1030,height:740};
 const dialogue={x:1140,y:330,width:385,height:440},above=foxCopyPlacement({panel:left,page,dialogue})!;
 assert.equal(above.y,FOX_COPY.margin,'at the window\'s top');
 assert.equal(above.x+above.width,dialogue.x+dialogue.width,'right-aligned with the conversation box');
 assert.equal(above.width,dialogue.width,'as wide as the box');
 assert.ok(above.y+above.height<=dialogue.y-FOX_COPY.gap,'clear of the box');
 assert.equal(above.height,Math.floor(above.width/aspect),'in the page\'s shape');
 const low=foxCopyPlacement({panel:left,page,dialogue:{...dialogue,y:240}})!;
 assert.ok(low.width<dialogue.width&&low.width>=FOX_COPY.minAbove&&low.y+low.height<=240-FOX_COPY.gap,'a tall box narrows it to fit above: '+JSON.stringify(low));
 assert.equal(foxCopyPlacement({panel:left,page,dialogue:{...dialogue,y:500,width:900}})!.width,FOX_COPY.maxWidth,'never wider than maxWidth');
 const corner=foxCopyPlacement({panel:left,page})!;
 assert.deepEqual(foxCopyPlacement({panel:left,page,dialogue:{...dialogue,y:120}}),corner,'no room above the box: the panel\'s corner');
 assert.deepEqual(foxCopyPlacement({panel:left,page,dialogue:{...dialogue,width:0,height:0}}),corner,'no box showing: the panel\'s corner');
 assert.equal(foxCopyPlacement({panel:{...left,width:FOX_COPY.minPanel-1},page,dialogue}),null,'a narrow panel still keeps Fox on the person\'s page');
 console.log('PASS Fox\'s copy above the conversation box: window top, right-aligned with it, clear of it, the panel\'s corner without room');
}
