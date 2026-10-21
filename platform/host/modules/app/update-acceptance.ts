/** RC package acceptance (#1140): `Worldlet --update-feed http://127.0.0.1:<port>/appcast.xml --relaunch-capture <png>`
 * points the packaged release updater at a loopback Sparkle feed, installs what it offers and relaunches into
 * `--window-capture <png>`. Only the feed location changes: the published Ed25519 key, Build, bundle identifier,
 * code signature and team checks all still apply. scripts/rc-update-acceptance-mac.mjs drives it. */
export interface UpdateAcceptance {feed:string;origin:string;capture:string}
export const UPDATE_ACCEPTANCE_USAGE='Usage: Worldlet --update-feed http://127.0.0.1:<port>/<path> --relaunch-capture <absolute path>.png';
const FLAGS=['--update-feed','--relaunch-capture'];
const LOOPBACK=new Set(['127.0.0.1','localhost','[::1]']);
/** null without --update-feed; anything else beside the two flags, or a non-loopback feed, is a usage error. */
export function updateAcceptance(argv:string[]):UpdateAcceptance|null {
 const args=argv.slice(1);
 if(!args.includes('--update-feed'))return null;
 const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
 const others=args.filter((arg,index)=>!FLAGS.includes(arg)&&!FLAGS.includes(args[index-1]));
 const capture=value('--relaunch-capture')??'';
 let url:URL|null=null;
 try{url=new URL(value('--update-feed')??'');}catch{}
 if(others.length||!url||url.protocol!=='http:'||!LOOPBACK.has(url.hostname)||url.username||url.password
  ||!capture.startsWith('/')||capture.length<=5||!capture.toLowerCase().endsWith('.png'))throw Error(UPDATE_ACCEPTANCE_USAGE);
 return {feed:url.href,origin:url.origin,capture};
}
/** Written beside the relaunch capture when the run ends without relaunching, so the driver reads why. */
export const acceptanceReportPath=(capture:string)=>capture.slice(0,-4)+'.update.json';
