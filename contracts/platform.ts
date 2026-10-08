import type {PresentationHostBodies} from './presentation.ts';
import type {ItemHostBodies} from './item-actions.ts';
import type {FoxHostBodies} from './fox.ts';
import type {BrowserBudget,BrowserSurfaceBodies,BrowserSurfaceReply} from './browser-surface.ts';
import type {BrowserOutcomeRequest,BrowserReceipt} from './browser-receipt.ts';

/** Validated operation families. Expand this map as remaining native APIs migrate. */
export interface DevBuildStatus {supported:boolean;online?:boolean;applying?:boolean;candidate?:{id:string;revision:string;committedAt?:string;pr?:number;behind?:number};error?:string}
/** Order (core/distribution/order.ts): whether this copy shows the button, and what a sent task carried. */
export interface OrderReply {available:boolean;ready?:boolean;reason?:string;sent?:{id:string;screenshots:number;logLines:number;woke?:boolean;
 /** Why the instant post into the project failed, when it did. */
 wakeError?:string}}
export interface HostBodies extends FoxHostBodies,BrowserSurfaceBodies,ItemHostBodies,PresentationHostBodies {
 browserOutcomeAction:Omit<BrowserOutcomeRequest,'action'>;
 devBuildStatus:{};
 devBuildApply:{id:string};
 order:{operation:'status'}|{operation:'send';id:string;said:string;place?:string};
}
/** Stable reply shapes are independent of the native embedding engine. */
export interface HostReplies {
 devBuildStatus:DevBuildStatus;
 devBuildApply:{accepted:true};
 order:OrderReply;
 saveOverlay:{ok:true};
 saveSampleUI:{ok:true};
 setTextScale:{ok:true};
 worldItemRead:{ok:true};
 worldItemStatus:{ok:true};
 agentChat:Record<string,unknown>;
 agentSteer:{accepted:boolean};
 agentCancel:{ok:true};
 browserShow:BrowserSurfaceReply;
 browserLayout:BrowserSurfaceReply;
 browserHide:BrowserSurfaceReply;
 browserPip:BrowserSurfaceReply;
 browserOutcomeAction:BrowserReceipt;
}
type OptionalHostAction={[K in keyof HostBodies]:{} extends HostBodies[K]?K:never}[keyof HostBodies];
export interface HostCall {
 <K extends keyof HostBodies>(action:K,body:HostBodies[K]):Promise<HostReplies[K]>;
 <K extends OptionalHostAction>(action:K):Promise<HostReplies[K]>;
 <K extends string>(action:K extends keyof HostBodies?never:K,body?:Record<string,unknown>):Promise<any>;
}

/** Platform transport carries requests only; native hosts retain authorization. */
export type HostRequest = {action:string; [key:string]:unknown};
export interface HostTransport {
 version:1;
 platform:'macos'|'windows'|'linux';
 request(request:HostRequest):Promise<any>;
}
export interface HostFeatures {
 localDataDeletion?:boolean;
 curatedSourceRead?:boolean;
 nativeAppletLaunch:boolean;
 nativeCalendar:boolean;
 appleNotes:boolean;
 appleReminders:boolean;
 voiceMemos:boolean;
 /** Messages (iMessage): reads the local chat.db and sends through the Messages app (Mac). */
 messages?:boolean;
 /** Local music players: what the computer says is playing, with play, pause and skip (Mac MediaRemote, Windows media transport controls). */
 localMusic?:boolean;
 folderManagement:boolean;
 backgroundSourceChecks:boolean;
 cancellableOrganization:boolean;
 deferredBackupRestore:boolean;
 cancellableTransferReview:boolean;
 browserBookmarks:boolean;
 installedAppDetection:boolean;
 /** The host draws Fox's page glow over the native page (see BrowserFoxGlow). */
 browserFoxOverlay:boolean;
 /** A website Applet's page can become the World's picture-in-picture window (browserPip). */
 browserPictureInPicture:boolean;
 /** A website page shows scaled down while it keeps its own size, so Fox's page can be the
  * World's task picture-in-picture window (#1175; `page` and `press` on browserShow/browserLayout). */
 browserTaskPictureInPicture:boolean;
 /** The window's own controls (the Mac's traffic lights) sit over the World's top-left corner. */
 leadingWindowControls:boolean;
 /** Google sign-in reports its stages to the World page (GOOGLE_SIGN_IN_EVENT), `browser` only once consent opens. */
 googleSignInStages:boolean;
}
/** `browserBudget` (#1176): the host's website page budget from its memory; absent on older hosts. */
export interface HostCapabilities {version:1;features:HostFeatures;browserBudget?:BrowserBudget}
/** Host → World page while Google connects: `new CustomEvent(GOOGLE_SIGN_IN_EVENT,{detail:stage})`.
 * `browser` is sent only after the host asked the system browser to open Google consent: a still-valid
 * grant (Reconnect on a healthy connection) is reused without one. `preparing`/`verifying` follow consent.
 * `browser` may come as `{stage:'browser',url}` with the validated consent address, so the page can open
 * it again or copy it when no browser came up (owner meetings 2026-10-02/03). */
export const GOOGLE_SIGN_IN_EVENT='worldlet:google-sign-in';
export const GOOGLE_SIGN_IN_STAGES=['browser','preparing','verifying'] as const;
export type GoogleSignInStage=typeof GOOGLE_SIGN_IN_STAGES[number];
export const googleSignInStage=(detail:unknown):GoogleSignInStage|undefined=>{
 const value=detail&&typeof detail==='object'?(detail as {stage?:unknown}).stage:detail;
 return (GOOGLE_SIGN_IN_STAGES as readonly unknown[]).includes(value)?value as GoogleSignInStage:undefined;
};
