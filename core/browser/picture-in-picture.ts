import {getApp} from '../applets/index.ts';
import {appletSite} from './page-resume.ts';
import type {SurfaceRect} from '../../contracts/browser-surface.ts';

/**
 * Picture in picture for website Applets (#919, #950): while the page plays a video the person
 * may choose it, return to the World and keep watching in a 16:9 window in the World's right
 * third, only the video showing. Pressing the window returns to the Applet with the same page;
 * closing it leaves the page kept and paused like any page left behind. There is one window:
 * choosing it on another page moves it there and leaves the previous page kept and paused.
 *
 * - It shows only in the World (`pictureInPictureShows`). Inside an Applet, content or search it
 *   waits out of sight and keeps playing. One page plays sound at a time: a page that starts
 *   audible media pauses the window's (the host's audio focus).
 * - Its frame takes `share` of the World's width with `margin` all round: the right third, or what
 *   the person resized it to, up to `maxShare`, its video never under `minWidth`. It moves up past
 *   anything it would cover (Fox, its dialogue, the footer, an open panel), `gap` apart. Where that
 *   leaves no room it narrows, down to `minWidth`; below that it draws nothing until room returns.
 * - The page counts as live: it takes one of PAGE_RESUME.livePages (livePagePlan).
 */
export const PICTURE_IN_PICTURE=Object.freeze({share:1/3,minWidth:240,maxShare:0.5,aspect:16/9,margin:16,gap:12});

/** Applets whose own view is their website offer it; the host reports whether a video plays. */
export function pictureInPictureApplet(key:string):boolean {
 const view:any=getApp(key)?.fullView;
 return view?.kind==='web'&&!!appletSite(key);
}

/** Whether the window shows at this World depth: the World itself, not an Applet, content or search. */
export function pictureInPictureShows(depth:string):boolean {
 return ['overview','area','building','place','room'].includes(depth);
}

/** A remembered size the person chose, as a share of the World's width; anything else is the default. */
export function pictureInPictureShare(value:unknown):number {
 const {share,maxShare}=PICTURE_IN_PICTURE;
 return typeof value==='number'&&Number.isFinite(value)&&value>0?Math.min(maxShare,Math.max(0.1,value)):share;
}

/** Room the window's own controls take around the video, in the same units as the viewport. */
export interface PictureInPictureChrome {top:number;right:number;bottom:number;left:number}

/**
 * Where the window goes: its frame (the video plus `chrome`) at the viewport's bottom-right,
 * `share` of its width, moved up past each box in `avoid` it would otherwise cover, and narrower
 * only when that is what it takes. Null when even the narrowest window has no room.
 */
export function pictureInPicturePlacement({viewport,avoid=[],chrome={top:0,right:0,bottom:0,left:0},share=PICTURE_IN_PICTURE.share,aspect=PICTURE_IN_PICTURE.aspect}:{viewport:{width:number;height:number};avoid?:readonly SurfaceRect[];chrome?:PictureInPictureChrome;share?:number;aspect?:number}):{frame:SurfaceRect;video:SurfaceRect}|null {
 const {minWidth,margin}=PICTURE_IN_PICTURE;
 if(!(viewport.width>0&&viewport.height>0))return null;
 const boxes=avoid.filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>0&&b.height>0);
 const wanted=Math.round(viewport.width*pictureInPictureShare(share)-2*margin-chrome.left-chrome.right);
 for(let width=Math.max(minWidth,wanted);width>=minWidth;width=width>minWidth?Math.max(minWidth,width-20):0){
  const spot=place(width,viewport,boxes,chrome,aspect);
  if(spot)return spot;
 }
 return null;
}
function place(width:number,viewport:{width:number;height:number},boxes:readonly SurfaceRect[],chrome:PictureInPictureChrome,aspect:number){
 const {margin,gap}=PICTURE_IN_PICTURE,height=Math.round(width/aspect);
 const frameWidth=width+chrome.left+chrome.right,frameHeight=height+chrome.top+chrome.bottom;
 const x=Math.floor(viewport.width-margin-frameWidth);
 if(x<margin)return null;
 // Each pass clears at least one box for good, since the window only moves up.
 let bottom=viewport.height-margin;
 for(let pass=0;pass<=boxes.length;pass++){
  const y=Math.floor(bottom-frameHeight);
  if(y<margin)return null;
  const hits=boxes.filter(b=>b.x<x+frameWidth+gap&&b.x+b.width>x-gap&&b.y<y+frameHeight+gap&&b.y+b.height>y-gap);
  if(!hits.length)return {frame:{x,y,width:frameWidth,height:frameHeight},video:{x:x+chrome.left,y:y+chrome.top,width,height}};
  bottom=Math.min(...hits.map(b=>b.y))-gap;
 }
 return null;
}

/**
 * Task picture in picture (#1175, owner decision 2026-10-01). While Fox drives a website page, the
 * page leaves the Applet for a window at the World's bottom-right, so the person keeps using the
 * World while Fox works. The window is placed like the video window above, in the page's own
 * shape (`taskPictureInPictureAspect`).
 * - The page keeps its layout size and only shows smaller, so Fox's element references stay valid.
 * - It takes no input there: pressing the window returns to the Applet with the page, and Fox keeps
 *   working. Once the person is back on the page (pressing the window or opening the Applet), it
 *   stays in the panel for the rest of that turn; leaving the Applet again while Fox works puts it
 *   back in the window. It is never hidden under Fox.
 * - A page Fox opens in the panel moves to the window as soon as it shows.
 * - The page renders at the window's lower frame rate (`pageFrameRate`).
 * - While the World window is closed or minimized (the desktop Companion), the page waits in a window
 *   of its own beside the Companion instead (`desktopTaskPictureInPicturePlacement`), still Fox's.
 * - It closes only once Fox's turn has ended; until the person opens or closes it, it keeps showing
 *   the page Fox ended on.
 * - Hosts that draw pages as textures offer it (`browserTaskPictureInPicture`). Elsewhere Fox works in
 *   the Applet's panel as before.
 */
export const TASK_PICTURE_IN_PICTURE=Object.freeze({minAspect:1,maxAspect:2.2,fps:Object.freeze({panel:60,display:120,scaled:15,waiting:4}),desktop:Object.freeze({width:360,gap:12,margin:16})});
/** Frames per second for a page the host draws: full rate where the person works with it, about 15
 * shown smaller in the task window, and low but never zero while the window waits out of sight
 * (zero-size), so the page's animation-frame callbacks, which Fox's steps wait on, keep running.
 * Full rate is the display's refresh rate when the host gives it (`refresh`, Hz): 120 on a
 * ProMotion or 120 Hz screen, as in the person's own browser, never below 60 or above 120. */
export function pageFrameRate({width,height,scaled,refresh}:{width:number;height:number;scaled:boolean;refresh?:number}):number {
 const {fps}=TASK_PICTURE_IN_PICTURE;
 if(width<1||height<1)return fps.waiting;
 if(scaled)return fps.scaled;
 return typeof refresh==='number'&&Number.isFinite(refresh)?Math.min(fps.display,Math.max(fps.panel,Math.round(refresh))):fps.panel;
}
/** The task window beside the desktop Companion, in screen coordinates: `desktop.width` wide (less on
 * a narrow screen) in the page's shape, bottom-aligned with the Companion's window on its left, or
 * on its right when the left has no room, and always inside the work area. Without the Companion's
 * window it takes the work area's bottom-right corner. */
export function desktopTaskPictureInPicturePlacement({area,companion,aspect}:{area:SurfaceRect;companion:SurfaceRect|null;aspect:number}):SurfaceRect {
 const {width:wanted,gap,margin}=TASK_PICTURE_IN_PICTURE.desktop;
 const width=Math.max(1,Math.round(Math.min(wanted,area.width-2*margin))),height=Math.max(1,Math.round(width/aspect));
 const left=area.x+margin,right=area.x+area.width-margin-width,top=area.y+margin,bottom=area.y+area.height-margin-height;
 let x=companion?companion.x-gap-width:right,y=companion?companion.y+companion.height-height:bottom;
 if(companion&&x<left)x=companion.x+companion.width+gap;
 x=Math.min(Math.max(x,left),right);y=Math.min(Math.max(y,top),bottom);
 return {x:Math.round(x),y:Math.round(y),width,height};
}
/** The window's shape: the page's own, kept between square and a wide 2.2:1. */
export function taskPictureInPictureAspect(page:{width:number;height:number}):number {
 const {minAspect,maxAspect}=TASK_PICTURE_IN_PICTURE;
 const aspect=page.width>0&&page.height>0?page.width/page.height:PICTURE_IN_PICTURE.aspect;
 return Math.min(maxAspect,Math.max(minAspect,aspect));
}
