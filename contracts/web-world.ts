// The World in a web browser (docs/UI-CORE-PLATFORM.md#the-world-in-a-web-browser): the same World page the app shows,
// served by the host on 127.0.0.1 at /world/ and talking to it over one WebSocket at /world/socket instead of the
// app's IPC. Both sides use this file: the page's transport (platform/bridge/web-host.ts) and the host's
// (platform/electron/src/host/web-page.ts, platform/electron/src/modules/phone/local-relay.ts).
import type {HostFeatures} from './platform.ts';

/** Where the host serves the World page and its socket. */
export const WORLD_WEB_PATH='/world/';
export const WORLD_SOCKET_PATH='/world/socket';
/** The WebSocket subprotocol the page asks for and the host answers with. The token goes in a second subprotocol
 * (`worldTokenProtocol`), which the host reads and never echoes back. */
export const WORLD_PROTOCOL='worldlet-world.v1';
const TOKEN_PREFIX='worldlet-token.';
/** 32 random bytes, base64url without padding. */
export const WORLD_TOKEN=/^[A-Za-z0-9_-]{43}$/;
export const worldTokenProtocol=(token:string)=>TOKEN_PREFIX+token;
/** The token among the subprotocols a page offered (`Sec-WebSocket-Protocol`), or '' when none is well formed. */
export function worldTokenFrom(protocols:string):string {
 for(const value of protocols.split(',').map(part=>part.trim()))if(value.startsWith(TOKEN_PREFIX)&&WORLD_TOKEN.test(value.slice(TOKEN_PREFIX.length)))return value.slice(TOKEN_PREFIX.length);
 return '';
}
/** The World's link on this computer: the token rides in the fragment, which a browser never sends to a server. */
export const worldLink=(origin:string,token:string)=>`${origin}${WORLD_WEB_PATH}#t=${token}`;
/** The token in a link's fragment (`#t=…`), or ''. */
export function worldLinkToken(hash:string):string {
 const value=new URLSearchParams(hash.replace(/^#/,'')).get('t')||'';
 return WORLD_TOKEN.test(value)?value:'';
}

/** The World page's Content-Security-Policy in the app's window (worldlet://app): the meta tag the interface build
 * writes into index.html (scripts/build-native-ui.ts). */
export const WORLD_PAGE_CSP="default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com; connect-src 'self' worldlet://app; worker-src blob:; media-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
/** That meta tag in the built index.html, which the host takes out when it serves the page over HTTP. */
export const WORLD_PAGE_CSP_META=/<meta http-equiv="Content-Security-Policy" content="[^"]*">/i;
/** The same page served to a web browser (`origin`: the page's own, http or https): sent as a header in place of the
 * meta tag (a meta policy cannot be loosened, only added to). The page talks only to its own origin and its socket
 * there; YouTube is hidden in a browser, so its pictures are not allowed either; no other site may frame it. */
export function worldWebCsp(origin:string):string {
 const socket=origin.replace(/^http/,'ws');
 return `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${socket}${WORLD_SOCKET_PATH}; worker-src blob:; media-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

/** Frames on the socket, all JSON text.
 * Host → page: `h` the handshake, `a` the answer to a request, `c` a call of a page global, `v` an event (`doc`: on
 * document), `x` the page was closed by the host (`elsewhere`: a newer page took over).
 * Page → host: `q` a request (the body `worldletHost.request` takes), `r` the value a call returned. */
export type WorldHostFrame=
 {h:{version:1;platform:'macos'|'windows'|'linux';features?:Partial<Record<keyof HostFeatures,boolean>>}}|
 {a:number;ok:true;value?:unknown}|{a:number;ok:false;error:string}|
 {c:number;name:string;args:unknown[]}|
 {v:string;detail?:unknown;doc?:true}|
 {x:'elsewhere'};
export type WorldPageFrame={q:number;body:Record<string,unknown>}|{r:number;value?:unknown};
/** What a World page in a web browser cannot do, though the app's window can, sent in the handshake (`h.features`):
 * the page turns these HostFeatures off whatever the snapshot says (platform/bridge/features.ts). Websites and the
 * Browser open in a new tab instead of a native view; YouTube, the World's sound, music players, voice and the desktop
 * Companion window are hidden; the corner leaves no room for window buttons the page does not have. */
export const WEB_PAGE_FEATURES:Readonly<Partial<Record<keyof HostFeatures,false>>>=Object.freeze({
 websitePages:false,youtube:false,worldAudio:false,localMusic:false,voice:false,desktopCompanion:false,leadingWindowControls:false,
});
/** What Fox's tools (and the page) answer when they need one of those. */
export const WEB_PAGE_UNAVAILABLE:Readonly<Partial<Record<keyof HostFeatures,string>>>=Object.freeze({
 websitePages:'Worldlet\'s built-in browser is not available in a browser window: websites open in a new tab there, where Fox cannot see or use them. Give the person the link, or use the Worldlet app on this computer.',
 youtube:'YouTube is not available in a browser window. It needs the Worldlet app on this computer.',
 worldAudio:'The World\'s sound is not available in a browser window. It needs the Worldlet app on this computer.',
 localMusic:'Music players on this computer are not available in a browser window. They need the Worldlet app on this computer.',
 voice:'Voice is not available in a browser window. Type to Fox instead, or use the Worldlet app on this computer.',
 desktopCompanion:'Fox\'s desktop Companion is not available in a browser window. It needs the Worldlet app on this computer.',
});
/** The close code a page that was taken over receives. */
export const WORLD_ELSEWHERE_CODE=4001;

/** What a World page in a browser may not ask for, though the app's own World page may: reading the vault and the
 * pairing secrets, pairing or unpairing another device, deleting local data, restoring or replacing the library, and
 * the local tools that read other programs' files on this computer. `true` denies the action; a list denies only those
 * operations. The host checks this before the request reaches the router. */
export const WEB_DENIED:Readonly<Record<string,true|readonly string[]>>=Object.freeze({
 // Pairing: the status is read, without its link (webReply).
 phonePair:Object.freeze(['start','end','open','background','world']),
 // Local data deletion, restore and the whole-library backup.
 dataBackup:true,
 deleteSourceData:true,
 clearWorldContent:true,
 // The page's own web capture (session replay) runs in the app's window only: a browser's page loads no PostHog
 // client, so it sends nothing to /ingest and the host serves no /world/ingest/ route.
 analyticsConfig:true,
 // Local tools: other programs' sessions and stores on this computer.
 codexSession:true,
 codexTask:true,
 codexCancel:true,
 claudeSession:true,
 developmentSessions:true,
 voiceMemos:true,
 messages:true,
});
export const WEB_DENIED_MESSAGE='This needs the Worldlet app on this computer.';
/** The host's actions behind each HostFeature a browser's World page lacks (WEB_PAGE_FEATURES): the page hides their
 * controls and Fox's tools answer why, and the host also refuses them from that page, so a page that asks anyway is
 * told the same (WEB_PAGE_UNAVAILABLE). `true` refuses the action; `{except}` refuses all its operations but those,
 * which read and drive nothing on this computer's screen. */
export const WEB_PAGE_ACTIONS:Readonly<Partial<Record<keyof HostFeatures,Readonly<Record<string,true|{readonly except:readonly string[]}>>>>>=Object.freeze({
 // The built-in browser's native views and what drives them; the list of sites it visited stays readable.
 websitePages:Object.freeze({browserShow:true,browserLayout:true,browserHide:true,browserPip:true,browserOutcomeAction:true,taskPanelPage:true,
  browserCommand:Object.freeze({except:Object.freeze(['visitedSites'])})}),
 youtube:Object.freeze({youtube:true,youtubePlayer:true}),
 worldAudio:Object.freeze({worldAudio:true,backgroundMusic:true,cancelAudioRequest:true}),
 localMusic:Object.freeze({localMusic:true}),
 // Speech: the microphone and Fox's spoken replies through this computer's speakers.
 voice:Object.freeze({speechStart:true,speechKeep:true,speechTalk:true,speechStop:true,speechCancel:true,microphones:true,speakReply:true}),
 desktopCompanion:Object.freeze({desktopCompanionState:true,desktopCompanionSize:true,desktopCompanionDrag:true,desktopCompanionHide:true,desktopCompanionPointer:true,companionMenu:true}),
});
/** Why a browser's World page may not make this request, or '' when it may: WEB_DENIED, then WEB_PAGE_ACTIONS. */
export function webDenied(body:unknown):string {
 if(!body||typeof body!=='object')return '';
 const {action,operation}=body as {action?:unknown;operation?:unknown};
 if(typeof action!=='string')return '';
 if(Object.hasOwn(WEB_DENIED,action)){
  const rule=WEB_DENIED[action];
  if(rule===true||typeof operation==='string'&&rule.includes(operation))return WEB_DENIED_MESSAGE;
 }
 for(const [feature,actions] of Object.entries(WEB_PAGE_ACTIONS) as [keyof HostFeatures,Record<string,true|{except:readonly string[]}>][]){
  if(!Object.hasOwn(actions,action))continue;
  const rule=actions[action];
  if(rule===true||!(typeof operation==='string'&&rule.except.includes(operation)))return WEB_PAGE_UNAVAILABLE[feature]||WEB_DENIED_MESSAGE;
 }
 return '';
}
/** A reply as a browser's World page gets it: a pairing's link (its secret) stays on the host. */
export function webReply(body:Record<string,unknown>,value:unknown):unknown {
 if(body.action==='phonePair'&&value&&typeof value==='object'&&!Array.isArray(value)&&'link' in value){
  const {link:_link,...rest}=value as Record<string,unknown>;
  return rest;
 }
 return value;
}

/** What a World page on another device may ask for, met through the pairing room (core/phone/world-room.ts): the
 * World, Fox, the Attention Center, artifacts and Applets, and nothing else. Settings, connections, pairing, the
 * Harness's configuration, local tools, deletion and native views stay with this computer. The host checks this before
 * the request reaches the router, after WEB_DENIED and WEB_PAGE_ACTIONS; `true` allows the action, a list allows only
 * those operations. */
export const ROOM_ALLOWED:Readonly<Record<string,true|readonly string[]>>=Object.freeze({
 // The World: its snapshot, layout and presentation, its items and their history, the practice world, setup's steps.
 snapshot:true,saveOverlay:true,saveSampleUI:true,setTextScale:true,setSampleEnabled:true,worldActivity:true,uiCommand:true,worldHistory:true,worldLog:true,
 worldItemRead:true,worldItemStatus:true,taskReviewAction:true,original:true,worldWriteUndo:true,saveWorld:true,onboarding:true,usageEvent:true,reportException:true,
 // Fox: turns, their cloud stream, the conversation, the Task panel, Applet tasks and the Agent's permission prompts.
 agentChat:true,hermesChat:true,agentCancel:true,hermesCancel:true,agentSteer:true,hermesSteer:true,agentWarm:true,cloudRequest:true,cloudCancel:true,
 channelReply:true,foxPreferences:true,foxTiming:true,modelStatus:true,modelHealth:true,modelSource:true,taskPanel:true,foxProactive:true,foxProactiveShown:true,
 companionArchive:true,companionProfile:true,conversationRecall:true,appletTaskStart:true,appletTaskCancel:true,appletTasks:true,harnessApproval:true,
 // The Attention Center: mail reviews, its pictures, ongoing work, the calendar, checks and calls.
 emailAction:true,attentionImage:true,mailAvatar:true,ongoing:true,calendarEvents:true,runtimeTaskControl:true,worldSourceCheck:true,harnessCall:true,
 // Artifacts: the Journal's cards, moment Applets and made games (not the native views that show them on this screen).
 artifacts:true,artifactPageBrief:true,artifactPageSave:true,artifactPages:Object.freeze(['get']),widgets:true,widgetStart:true,widgetSave:true,widgetSource:true,
 madeGames:true,madeGameSource:true,gameFactoryStart:true,gameFactorySave:true,
 // Applets: what each shows from the person's connected accounts.
 appContent:true,notionContent:true,obsidianContent:true,paypalContent:true,curatedSourceContent:true,doorDash:true,appletArt:true,siteApplets:true,
 weatherLoad:true,weatherSave:true,weatherRequest:true,weatherLocate:true,
});
export const ROOM_DENIED_MESSAGE='This needs Worldlet on the computer itself, or a browser on that computer.';
/** Why a World page on another device may not make this request, or '' when it may. */
export function roomDenied(body:unknown):string {
 const web=webDenied(body);
 if(web)return web;
 if(!body||typeof body!=='object')return ROOM_DENIED_MESSAGE;
 const {action,operation}=body as {action?:unknown;operation?:unknown};
 if(typeof action!=='string'||!Object.hasOwn(ROOM_ALLOWED,action))return ROOM_DENIED_MESSAGE;
 const rule=ROOM_ALLOWED[action];
 return rule===true||typeof operation==='string'&&rule.includes(operation)?'':ROOM_DENIED_MESSAGE;
}
