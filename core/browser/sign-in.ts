// Sign-ins a website panel cannot finish (#1089). Google refuses account sign-in from browsers
// it judges embedded or automated: after the account name it ends on its own "rejected" page
// ("This browser or app may not be secure"). Google does not publish that judgment, so the
// panel neither disguises itself nor blocks Google up front. Where the CEF engine is built, whose
// sign-in Google accepts, a page on Electron's views moves there as Google's sign-in starts
// (googleSignInPage); otherwise the panel recognizes the refusal and offers the system browser.
// Signing in there does not sign the panel in.

const GOOGLE_REJECTED=/^\/(?:v\d+\/)?signin\/(?:v\d+\/)?[a-z]*rejected\/?$/i;

/** accounts.google.com/v3/signin/rejected, the older /signin/v2/deniedsigninrejected and kin. */
export function googleSignInRejected(raw:unknown):boolean {
 let url:URL;try{url=raw instanceof URL?raw:new URL(String(raw));}catch{return false;}
 return url.protocol==='https:'&&url.hostname.toLowerCase()==='accounts.google.com'&&GOOGLE_REJECTED.test(url.pathname);
}

/** A page of Google's account sign-in (accounts.google.com): Electron's views hand it to the CEF engine before Google judges them. */
export function googleSignInPage(raw:unknown):boolean {
 let url:URL;try{url=raw instanceof URL?raw:new URL(String(raw));}catch{return false;}
 return url.protocol==='https:'&&url.hostname.toLowerCase()==='accounts.google.com';
}

/** What the person is told; the panel's action opens the Applet's site in the system browser. */
export function signInRejectedMessage(platform:string){
 const here=platform==='youtube'?' Videos still play here signed out.':' Pages here stay signed out.';
 return 'Google doesn’t allow signing in from Worldlet’s built-in browser. To use your account, open it in your browser; that sign-in stays in your browser.'+here;
}
