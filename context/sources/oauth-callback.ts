/** The local OAuth receipt contains no provider response, URL, code or state. */
export const OAUTH_CALLBACK_SCRIPT="history.replaceState(null,'',location.pathname);";
const MESSAGES={received:'Authorization received. You can return to Worldlet.',declined:'Authorization was not completed. You can return to Worldlet.',stale:'This sign-in link is out of date. Return to Worldlet and try again.'} as const;
export type OAuthCallbackStatus=keyof typeof MESSAGES;
/** A fixed title prevents browsers from using the callback URL as the tab title. Replace only this history entry. */
export function oauthCallbackPage(status:OAuthCallbackStatus):string {
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Worldlet sign-in</title><script>${OAUTH_CALLBACK_SCRIPT}</script></head><body><p>${MESSAGES[status]}</p></body></html>`;
}
