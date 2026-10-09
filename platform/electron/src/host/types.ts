import type {BaseWindow,WebContentsView,WebContents} from 'electron';
import type {Profile} from '../profile.ts';
import type {Preferences} from '../preferences.ts';
import type {WorldStore} from '../store/world-store.ts';
import type {HostRequest} from '../../../../contracts/platform.ts';

export type Row=Record<string,any>;
export interface RequestContext {requestId:string;sender:WebContents}
export type ActionHandler=(request:HostRequest&Row,context:RequestContext)=>unknown|Promise<unknown>;

/** Host → trusted World page. Mirrors the earlier native hosts' page globals and events. */
export interface PageBridge {
 /** `window[name]?.(...args)`; resolves with the page function's (awaited) result. */
 call<T=unknown>(name:string,...args:unknown[]):Promise<T|undefined>;
 /** `window.dispatchEvent(new CustomEvent(name,{detail}))`, or a plain Event without detail. */
 event(name:string,detail?:unknown):void;
 /** Dispatched on `document` instead of window. */
 documentEvent(name:string,detail?:unknown):void;
 ready():boolean;
}

/** What a domain module gets. Modules register actions and services; they never reach each other's internals. */
export interface Host {
 profile:Profile;
 preferences:Preferences;
 store:WorldStore;
 page:PageBridge;
 window:()=>BaseWindow|null;
 worldView:()=>WebContentsView|null;
 register(actions:Record<string,ActionHandler>):void;
 /** Shared services other modules may use (agent, browser, audio, desktop companion...). */
 provide<T>(name:string,service:T):T;
 use<T>(name:string):T;
 optional<T>(name:string):T|undefined;
 /** Called when the World page reloads or the app quits. */
 onPageReload(listener:()=>void):void;
 onQuit(listener:()=>void|Promise<void>):void;
 /** Called once the World page finished loading. */
 onPageLoaded(listener:()=>void):void;
 /** `recent`: the last failures this process recorded, with their error text, from memory only (host/diagnostics.ts). */
 diagnostics:{record(error:unknown,operation?:string,requestId?:string):void;log(line:string):void;recent?():{at:string;operation:string;requestId:string;message:string}[]};
}
