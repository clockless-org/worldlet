import type {PageView} from './page.ts';
import type {CefPageView} from './engine/page.ts';
/** A website page on either engine: Electron's own views (page.ts) or the CEF engine (engine/page.ts).
 * Both keep the same contract, so the panel's rules never depend on the engine. */
export type WebPage=PageView|CefPageView;
/** Where a page reports what happens on it, when the World records it (recorder.ts). */
export interface WebRecordLink {event(method:string,params:Record<string,any>):void;observed(value:Record<string,any>):void;
 /** Saves what is waiting, so a read right after sees everything up to now. */
 flush?():void;
 /** The id of the visit this page is on now, or ''. */
 openVisit?():string;
 /** A record the host adds to the page's visit (a meeting transcript line). */
 note?(kind:'transcript',body:string,meta:Record<string,any>):void}
