import crypto from 'node:crypto';
import type {ServerResponse} from 'node:http';
import {OAUTH_CALLBACK_SCRIPT,oauthCallbackPage,type OAuthCallbackStatus} from '../../../../../context/connectors/index.ts';
const scriptHash=crypto.createHash('sha256').update(OAUTH_CALLBACK_SCRIPT).digest('base64');
/** No callback response is cached or sent as a referrer; the only script removes its query from the current entry. */
export function sendOAuthCallbackPage(response:ServerResponse,status:OAuthCallbackStatus){
 response.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff',
  'content-security-policy':`default-src 'none'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`});
 response.end(oauthCallbackPage(status));
}
