import {googleSignInStage} from '../../contracts/platform.ts';
import {googleAuthorizationUrl} from '../../core/agent/index.ts';

/** The consent address a `browser` sign-in stage carries, only when it is Google's own authorization page. */
export const googleConsentUrl=(detail:unknown)=>googleSignInStage(detail)==='browser'?googleAuthorizationUrl((detail as {url?:unknown}|null)?.url):undefined;

/** When the browser never came up (owner meetings 2026-10-02/03): open the same consent page in the
 * default browser again through the host, or copy it to paste into one. Never an in-app window. */
export const googleConsentActions=(url:string,call:(action:string,body:Record<string,unknown>)=>Promise<unknown>)=>({
 open:()=>call('openSystemBrowser',{url}),
 copy:()=>navigator.clipboard.writeText(url)
});
