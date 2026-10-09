import assert from 'node:assert/strict';
import {readBrowserSurfaceRequest} from '../contracts/browser-surface.ts';
import type {BrowserSurfaceCall} from '../contracts/browser-surface.ts';
import {invoke} from '../core/index.ts';
import {callHost} from '../platform/bridge/host.ts';
const rect={x:-5,y:10.5,width:640,height:480};
const fox={label:'🦊 Fox is working on this page',colors:['#ff8a3d','#ffd166','#ff8a3d'],turnSeconds:2.4,phaseSeconds:0.5};
const valid=[{action:'browserShow',rect,platform:'web',url:'https://example.com/'},{action:'browserLayout',rect},{action:'browserHide'},{action:'browserLayout',rect,fox},{action:'browserShow',rect,platform:'web',fox},
 {action:'browserShow',rect,platform:'youtube',url:'https://www.youtube.com/watch?v=abc',applet:'youtube',resume:true,hold:true,live:['netflix','x'],fox},
 {action:'browserShow',rect,platform:'web',applet:'browser',resume:false,live:[]},{action:'browserHide',live:['youtube']},
 // Picture in picture: show or move the window, a zero-size one that draws nothing, and its end.
 {action:'browserPip',applet:'youtube',rect,live:['youtube','x']},{action:'browserPip',applet:'youtube',rect:{x:0,y:0,width:0,height:0}},{action:'browserPip',applet:'youtube',live:['youtube']},{action:'browserPip',applet:'tiktok'},
 // Task picture in picture (#1175): the page keeps its own size, scaled into the rect, and takes presses only.
 {action:'browserLayout',rect,fox,page:{width:1280,height:720},press:true},{action:'browserLayout',rect,page:{width:1280,height:720}},{action:'browserShow',rect,platform:'web',page:{width:960,height:600},press:true},
 // Fox's copy: shown scaled in the panel's corner while the person keeps the page, and taken into the panel.
 {action:'browserLayout',rect,fox,copy:{rect:{x:500,y:12,width:300,height:188},page:{width:1280,height:800}}},{action:'browserLayout',rect,takeCopy:true,fox},
 {action:'browserShow',rect,platform:'web',applet:'amazon',resume:true,fox,copy:{rect:{x:500,y:12,width:300,height:188},page:{width:1280,height:800}}}];
for(const request of valid){
 assert.deepEqual(readBrowserSurfaceRequest(request),request);
 assert.deepEqual(JSON.parse(invoke('browserSurfaceRequest',JSON.stringify(request))),{ok:true,value:request});
}
for(const request of [null,[],{action:'unknown'},
 {action:'browserShow',rect},
 {action:'browserShow',rect,platform:'web',url:12},
 {action:'browserLayout',rect:{...rect,width:-1}},
 {action:'browserLayout',rect:{...rect,x:NaN}},
 {action:'browserLayout',rect:{...rect,height:'480'}},
 {action:'browserLayout',rect:{...rect,admin:true}},
 {action:'browserHide',url:'https://example.com'},
 {action:'browserShow',rect,platform:'web',agent:true},
 {action:'browserHide',fox},
 {action:'browserLayout',rect,fox:{...fox,label:''}},
 {action:'browserLayout',rect,fox:{...fox,colors:['#ff8a3d']}},
 {action:'browserLayout',rect,fox:{...fox,colors:['#ff8a3d','red']}},
 {action:'browserLayout',rect,fox:{...fox,turnSeconds:-1}},
 {action:'browserLayout',rect,fox:{...fox,phaseSeconds:Infinity}},
 {action:'browserLayout',rect,fox:{label:fox.label,colors:fox.colors,turnSeconds:0}},
 {action:'browserLayout',rect,fox:{...fox,script:'x'}},
 {action:'browserShow',rect,platform:'web',applet:'You Tube'},
 {action:'browserShow',rect,platform:'web',applet:'youtube',resume:'yes'},
 {action:'browserShow',rect,platform:'web',resume:true},
 {action:'browserShow',rect,platform:'web',applet:'netflix',resume:true,hold:true},
 {action:'browserShow',rect,platform:'web',url:'https://www.netflix.com/',applet:'netflix',hold:true},
 {action:'browserShow',rect,platform:'web',url:'https://www.netflix.com/',applet:'netflix',resume:true,hold:1},
 {action:'browserShow',rect,platform:'web',live:'youtube'},
 {action:'browserHide',live:['a','b','c','d','e','f','g','h','i']},
 {action:'browserHide',live:[1]},
 {action:'browserLayout',rect,live:[]},
 {action:'browserPip',rect},{action:'browserPip',applet:'You Tube',rect},{action:'browserPip',applet:'youtube',rect:{...rect,width:-1}},{action:'browserPip',applet:'youtube',rect:{...rect,y:Infinity}},
 {action:'browserPip',applet:'youtube',rect,fox},{action:'browserPip',applet:'youtube',url:'https://www.youtube.com/'},{action:'browserPip',applet:'youtube',live:'youtube'},{action:'browserHide',applet:'youtube'},
 {action:'browserLayout',rect,press:true},{action:'browserLayout',rect,page:{width:0,height:720}},{action:'browserLayout',rect,page:{width:1280,height:720,depth:1}},{action:'browserLayout',rect,page:{width:1280,height:720},press:'yes'},
 {action:'browserPip',applet:'youtube',rect,page:{width:1280,height:720}},{action:'browserHide',page:{width:1280,height:720}},
 {action:'browserLayout',rect,copy:{rect}},{action:'browserLayout',rect,copy:{rect,page:{width:0,height:1}}},{action:'browserLayout',rect,copy:{rect,page:{width:1280,height:720},url:'https://example.com/'}},
 {action:'browserLayout',rect,takeCopy:'yes'},{action:'browserLayout',rect,takeCopy:true,copy:{rect,page:{width:1280,height:720}}},{action:'browserShow',rect,platform:'web',takeCopy:true}])assert.throws(()=>readBrowserSurfaceRequest(request));
const sent:unknown[]=[];
(globalThis as any).window={worldletHost:{version:1,platform:'macos',request:async body=>{sent.push(body);return {ok:true};}}};
await assert.rejects(callHost('browserLayout',{rect:{...rect,width:-1}}));
assert.equal(sent.length,0,'invalid geometry must not reach native IO');
const call:BrowserSurfaceCall=callHost;
assert.deepEqual(await call('browserShow',{rect,platform:'web'}),{ok:true});
assert.equal(sent.length,1);
// Shared result is a detached DTO; native IO cannot mutate the UI source object.
const parsed=readBrowserSurfaceRequest(valid[0]);
if(parsed.action==='browserShow')parsed.rect.width=3;
assert.equal(rect.width,640);
delete (globalThis as any).window;
console.log('PASS typed browser surface requests, Fox glow, picture-in-picture and task picture-in-picture fields, malformed geometry, unknown fields, native JSON boundary and no IO before validation');
