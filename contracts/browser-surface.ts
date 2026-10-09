/** Host protocol v1: coordinates are CSS pixels relative to the World viewport. */
export interface SurfaceRect {x:number;y:number;width:number;height:number}
/** How many website pages stay live at once and how many Fox browser tasks may drive pages at the
 * same time (core/browser/budget.ts). Hosts send it with their capabilities (`browserBudget`). */
export interface BrowserBudget {livePages:number;foxTasks:number}
/** A page's own layout size, in CSS pixels, when it shows scaled into a smaller `rect`. */
export interface SurfacePageSize {width:number;height:number}
/** While Fox drives the page, the host glows the frame `colors` inward over the page edge, equally
 * deep all round, and draws Fox's pointer and the page's one status over the page: a small card grown from the top edge headed by `label`, with its `colors` as an accent, listing
 * Fox's latest `steps` (ticked when done; `earlier` counts older ones not listed) and, once
 * `finished`, the `result` in the same place without the glow (core/browser/fox-steps.ts, #1619).
 * Absent means none of it.
 * The page keeps its rect; the overlay never takes input. `turnSeconds` 0 is static;
 * `phaseSeconds` is how far the frame's turn already is, so the glow starts in step. */
export interface BrowserFoxStep {text:string;done:boolean}
export interface BrowserFoxGlow {label:string;colors:string[];turnSeconds:number;phaseSeconds:number;steps?:BrowserFoxStep[];earlier?:number;result?:string;finished?:boolean}
/**
 * `applet` names the website Applet that owns the page. With `resume`, a live hidden page
 * of that Applet is shown as it is, and `url` loads only when none is alive. `hold` marks
 * `url` as the Applet's remembered page: a newly loaded one keeps site-started media paused
 * until the person interacts, as a returning live page does. `live` lists the Applets whose
 * hidden pages may stay alive; the host releases the rest. Without `live` the host keeps
 * its previous behavior.
 *
 * `browserPip` makes `applet`'s page the World's picture-in-picture window (rule in
 * core/browser/picture-in-picture.ts). With `rect` the page shows there, still playing, only
 * its video visible: it enters from the visible page of that Applet, or moves; a zero-size
 * `rect` keeps it playing without drawing it. Without `rect` the window ends and the page is
 * kept or released as `live` says, like a page left with browserHide. browserShow of the same
 * Applet takes the page back into the panel as it is, still playing. `live` never releases
 * the window itself.
 *
 * Task picture in picture (#1175, hosts that declare `browserTaskPictureInPicture`): with `page`,
 * browserShow/browserLayout show the visible page scaled into `rect` while it keeps `page` as its
 * own layout size, so Fox keeps working on it unchanged. `press` means the page takes no input
 * there, and a press on it is reported (`{phase:'task-pip',event:'press'}`). Without `page` the page
 * takes `rect`'s size, as before.
 *
 * Fox's copy (same hosts, core/browser/picture-in-picture.ts `foxCopyPlacement`): browserLayout with
 * `copy` gives Fox a copy of the visible page, made at its address in the same engine the first time,
 * shown scaled into `copy.rect` at `copy.page` as its own size and taking no input. Fox's steps and
 * the `fox` glow then go to the copy, while `rect` stays the person's page. The host reports a press
 * on the copy (`{phase:'fox-copy',event:'press'}`), a press on its close control
 * (`{event:'close'}`), and that it has no copy (`{event:'ended'}`, also when the visible page is
 * not on that engine). Every browserShow and browserLayout carries the copy while it lasts; one
 * without `copy` closes it; with `takeCopy` the copy becomes
 * the visible page at `rect` instead, and the person's page closes. Hiding or switching the page
 * closes the copy too.
 */
export interface BrowserFoxCopy {rect:SurfaceRect;page:SurfacePageSize}
export interface BrowserSurfaceBodies {
 browserShow:{rect:SurfaceRect;platform:string;url?:string;applet?:string;resume?:boolean;hold?:boolean;live?:string[];fox?:BrowserFoxGlow;page?:SurfacePageSize;press?:boolean;copy?:BrowserFoxCopy};
 browserLayout:{rect:SurfaceRect;fox?:BrowserFoxGlow;page?:SurfacePageSize;press?:boolean;copy?:BrowserFoxCopy;takeCopy?:boolean};
 browserHide:{live?:string[]};
 browserPip:{applet:string;rect?:SurfaceRect;live?:string[]};
}
export type BrowserSurfaceAction=keyof BrowserSurfaceBodies;
export type BrowserSurfaceRequest={
 [K in BrowserSurfaceAction]:{action:K}&BrowserSurfaceBodies[K]
}[BrowserSurfaceAction];
export interface BrowserSurfaceReply {ok:true}
export type BrowserSurfaceCall=<K extends BrowserSurfaceAction>(action:K,body:BrowserSurfaceBodies[K])=>Promise<BrowserSurfaceReply>;
export function isBrowserSurfaceAction(action:unknown):action is BrowserSurfaceAction {
 return action==='browserShow'||action==='browserLayout'||action==='browserHide'||action==='browserPip';
}
function object(value:unknown):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid browser surface request');
 return value as Record<string,unknown>;
}
function keys(value:Record<string,unknown>,allowed:string[]){
 if(Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unknown browser surface field');
}
function readFoxSteps(input:unknown):BrowserFoxStep[] {
 if(!Array.isArray(input)||input.length>8)throw Error('Invalid browser Fox steps');
 return input.map(item=>{
  const step=object(item);keys(step,['text','done']);
  if(typeof step.text!=='string'||!step.text||step.text.length>80||typeof step.done!=='boolean')throw Error('Invalid browser Fox step');
  return {text:step.text,done:step.done};
 });
}
function readFox(input:unknown):BrowserFoxGlow {
 const value=object(input);keys(value,['label','colors','turnSeconds','phaseSeconds','steps','earlier','result','finished']);
 if(typeof value.label!=='string'||!value.label||value.label.length>80)throw Error('Invalid browser Fox label');
 if(!Array.isArray(value.colors)||value.colors.length<2||value.colors.length>12||!value.colors.every(color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color)))throw Error('Invalid browser Fox colors');
 if(typeof value.turnSeconds!=='number'||!Number.isFinite(value.turnSeconds)||value.turnSeconds<0||value.turnSeconds>60)throw Error('Invalid browser Fox motion');
 if(typeof value.phaseSeconds!=='number'||!Number.isFinite(value.phaseSeconds)||value.phaseSeconds<0||value.phaseSeconds>60)throw Error('Invalid browser Fox motion');
 if(value.earlier!==undefined&&(!Number.isInteger(value.earlier)||(value.earlier as number)<0||(value.earlier as number)>999))throw Error('Invalid browser Fox steps');
 if(value.result!==undefined&&(typeof value.result!=='string'||value.result.length>240))throw Error('Invalid browser Fox result');
 if(value.finished!==undefined&&typeof value.finished!=='boolean')throw Error('Invalid browser Fox finish');
 return {label:value.label,colors:[...value.colors as string[]],turnSeconds:value.turnSeconds,phaseSeconds:value.phaseSeconds,
  ...value.steps!==undefined?{steps:readFoxSteps(value.steps)}:{},...value.earlier!==undefined?{earlier:value.earlier as number}:{},
  ...value.result!==undefined?{result:value.result as string}:{},...value.finished!==undefined?{finished:value.finished as boolean}:{}};
}
const appletKey=(value:unknown)=>typeof value==='string'&&/^[-a-z0-9]{1,64}$/.test(value);
function live(value:unknown):string[]{
 if(!Array.isArray(value)||value.length>8||!value.every(appletKey))throw Error('Invalid browser surface live pages');
 return [...value] as string[];
}
function readPage(input:unknown):SurfacePageSize {
 const value=object(input);keys(value,['width','height']);
 if(![value.width,value.height].every(size=>typeof size==='number'&&Number.isFinite(size)&&size>0&&size<=16384))throw Error('Invalid browser surface page size');
 return {width:value.width as number,height:value.height as number};
}
function readRect(input:unknown):SurfaceRect {
 const value=object(input);keys(value,['x','y','width','height']);
 for(const key of ['x','y','width','height'])if(typeof value[key]!=='number'||!Number.isFinite(value[key]))throw Error('Invalid browser surface geometry');
 const rect={x:value.x as number,y:value.y as number,width:value.width as number,height:value.height as number};
 if(rect.width<0||rect.height<0)throw Error('Invalid browser surface size');
 return rect;
}
/** Same wire validator runs in the shared UI and both native receivers.
 * Validation is not authorization: URL policy and native grants still apply. */
export function readBrowserSurfaceRequest(input:unknown):BrowserSurfaceRequest {
 const request=object(input),action=request.action;
 if(!isBrowserSurfaceAction(action))throw Error('Unknown browser surface action');
 keys(request,action==='browserShow'?['action','rect','platform','url','applet','resume','hold','live','fox','page','press','copy']:action==='browserLayout'?['action','rect','fox','page','press','copy','takeCopy']:action==='browserPip'?['action','applet','rect','live']:['action','live']);
 const kept=request.live!==undefined?{live:live(request.live)}:{};
 if(action==='browserHide')return {action,...kept};
 if(action==='browserPip'){
  if(!appletKey(request.applet))throw Error('Invalid browser surface Applet');
  return {action,applet:request.applet as string,...request.rect!==undefined?{rect:readRect(request.rect)}:{},...kept};
 }
 const rect=readRect(request.rect);
 const fox=request.fox===undefined?{}:{fox:readFox(request.fox)};
 if(request.press!==undefined&&typeof request.press!=='boolean')throw Error('Invalid browser surface press');
 if(request.press&&request.page===undefined)throw Error('Only a scaled page takes presses');
 const scaled={...request.page!==undefined?{page:readPage(request.page)}:{},...request.press!==undefined?{press:request.press as boolean}:{}};
 let copy={};
 if(request.copy!==undefined){const value=object(request.copy);keys(value,['rect','page']);copy={copy:{rect:readRect(value.rect),page:readPage(value.page)}};}
 if(action==='browserLayout'){
  if(request.takeCopy!==undefined&&typeof request.takeCopy!=='boolean')throw Error('Invalid browser surface copy');
  if(request.takeCopy&&request.copy!==undefined)throw Error('A taken copy is no longer a copy');
  return {action,rect,...fox,...scaled,...copy,...request.takeCopy!==undefined?{takeCopy:request.takeCopy as boolean}:{}};
 }
 if(typeof request.platform!=='string'||!request.platform||request.platform.length>128)throw Error('Invalid browser surface platform');
 if(request.url!==undefined&&(typeof request.url!=='string'||request.url.length>32768))throw Error('Invalid browser surface URL');
 if(request.applet!==undefined&&!appletKey(request.applet))throw Error('Invalid browser surface Applet');
 if(request.resume!==undefined&&typeof request.resume!=='boolean')throw Error('Invalid browser surface resume');
 if(request.resume&&request.applet===undefined)throw Error('Resuming needs the page\'s Applet');
 if(request.hold!==undefined&&(typeof request.hold!=='boolean'||request.hold&&(!request.resume||request.url===undefined)))throw Error('Invalid browser surface hold');
 return {action,rect,platform:request.platform,...request.url!==undefined?{url:request.url as string}:{},
  ...request.applet!==undefined?{applet:request.applet as string}:{},...request.resume!==undefined?{resume:request.resume as boolean}:{},...request.hold!==undefined?{hold:request.hold as boolean}:{},
  ...kept,...fox,...scaled,...copy};
}
