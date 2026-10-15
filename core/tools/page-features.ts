import type {HostFeatures} from '../../contracts/platform.ts';
// Which World tools need a feature of the World page's own window (contracts/platform.ts PAGE_FEATURES): a World page
// in a web browser has none of them (contracts/web-world.ts WEB_PAGE_FEATURES), so these answer that they are not
// available there instead of failing on their own.

/** Browser operations that read the person's history and records on the host, with no page in view. */
const BROWSER_MEMORY=new Set(['history','saved','records','record']);
const YOUTUBE_APPLET=new Set(['youtube','app-youtube']);

/** The page feature a tool call needs, or '' when it needs none. */
export function pageToolFeature(name:string,args:Record<string,unknown>={}):keyof HostFeatures|'' {
 if(name==='automate_browser')return args.operation==='receipts'?'':'websitePages';
 if(name==='browse_web')return BROWSER_MEMORY.has(String(args.operation))?'':'websitePages';
 if(name==='scroll_browser')return 'websitePages';
 if(name==='use_youtube')return 'youtube';
 if(name==='open_applet'&&YOUTUBE_APPLET.has(String(args.id)))return 'youtube';
 if(name==='control_background_music')return 'worldAudio';
 if(name==='control_local_music')return 'localMusic';
 return '';
}
