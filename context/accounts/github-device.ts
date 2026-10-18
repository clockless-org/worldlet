// GitHub sign-in with the official "Worldlet AI" GitHub App and GitHub's device flow (context/applets/INTEGRATIONS.md#github-sign-in):
// Worldlet asks GitHub for a short code, the person pastes it on github.com/login/device and chooses Authorize, and
// Worldlet, polling from this computer, receives the person's own user token. Only the App's client ID is used: it is
// public by design. There is no client secret anywhere, no server of ours and no loopback address. The user token and
// its refresh token stay in this computer's vault and are renewed with the client ID alone. Pure rules and shapes; the
// Platform makes the requests (platform/electron/src/modules/sources/mcp-account.ts).

/** The official Worldlet GitHub App. The client ID is public (it is in every device-flow request). */
export const GITHUB_APP=Object.freeze({
 clientId:'Iv23liCU8TGiC1MCnBI6',
 /** The App's address name on GitHub, for "Choose projects" (its install page). */
 slug:'worldlet-ai',
 deviceCodeUrl:'https://github.com/login/device/code',
 tokenUrl:'https://github.com/login/oauth/access_token',
 /** Where the person pastes the code. */
 verifyUrl:'https://github.com/login/device',
});
/** GitHub's page where the person chooses which repositories Worldlet may see (the App's installation). */
export const GITHUB_INSTALL_URL=`https://github.com/apps/${GITHUB_APP.slug}/installations/new`;
/** The device-flow grant type, as GitHub names it. */
export const GITHUB_DEVICE_GRANT='urn:ietf:params:oauth:grant-type:device_code';

/** What GitHub answers when a sign-in starts: the code the person types and the one Worldlet polls with. */
export interface GithubDeviceStart {deviceCode:string;userCode:string;verifyUrl:string;expiresIn:number;interval:number}
/** GitHub's start answer, checked: a code shaped like GitHub's (`ABCD-1234`), its page on github.com, and sane timings. */
export function readGithubDeviceStart(value:unknown):GithubDeviceStart|null {
 const v=value as Record<string,unknown>;
 if(!v||typeof v!=='object'||typeof v.device_code!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(v.device_code))return null;
 if(typeof v.user_code!=='string'||!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(v.user_code))return null;
 const verifyUrl=typeof v.verification_uri==='string'&&/^https:\/\/github\.com\/[A-Za-z0-9/_-]*$/.test(v.verification_uri)?v.verification_uri:GITHUB_APP.verifyUrl;
 const expiresIn=Number.isFinite(v.expires_in)&&Number(v.expires_in)>0?Math.min(Number(v.expires_in),3600):900;
 const interval=Number.isFinite(v.interval)&&Number(v.interval)>=0?Math.min(Number(v.interval),60):5;
 return {deviceCode:v.device_code,userCode:v.user_code,verifyUrl,expiresIn,interval};
}

/** One poll's outcome: the token; wait (again, maybe slower); or stop with a plain reason. */
export type GithubDevicePoll=
 {kind:'token';accessToken:string;refreshToken?:string;expiresIn?:number;scope?:string}
 |{kind:'wait';interval:number}
 |{kind:'stop';reason:string};
/** What stopping says, in plain words (connectorFailure keeps a plain line as it is, and "cancel" as cancelled). */
export const GITHUB_DEVICE_REASONS=Object.freeze({
 expired:'The GitHub code ran out before it was used. Try again.',
 denied:'Sign-in was cancelled on GitHub.',
 unavailable:'GitHub sign-in is not available right now. Try again later.',
 failed:'GitHub did not finish the sign-in. Try again.',
});
/** GitHub's answer to one poll (its token endpoint answers 200 with `error` while it waits). `interval`: the current
 * wait in seconds; `slow_down` adds five, as GitHub asks. */
export function readGithubDevicePoll(value:unknown,interval:number):GithubDevicePoll {
 const v=value as Record<string,unknown>;
 if(v&&typeof v==='object'&&typeof v.access_token==='string'&&/^[\x21-\x7e]{10,2000}$/.test(v.access_token)){
  const out:GithubDevicePoll={kind:'token',accessToken:v.access_token};
  if(typeof v.refresh_token==='string'&&/^[\x21-\x7e]{10,2000}$/.test(v.refresh_token))out.refreshToken=v.refresh_token;
  if(Number.isFinite(v.expires_in)&&Number(v.expires_in)>0)out.expiresIn=Number(v.expires_in);
  if(typeof v.scope==='string')out.scope=v.scope;
  return out;
 }
 const error=v&&typeof v==='object'&&typeof v.error==='string'?v.error:'';
 if(error==='authorization_pending')return {kind:'wait',interval};
 if(error==='slow_down')return {kind:'wait',interval:Number.isFinite(v.interval)&&Number(v.interval)>interval?Math.min(Number(v.interval),60):Math.min(interval+5,60)};
 if(error==='expired_token')return {kind:'stop',reason:GITHUB_DEVICE_REASONS.expired};
 if(error==='access_denied')return {kind:'stop',reason:GITHUB_DEVICE_REASONS.denied};
 if(error==='device_flow_disabled'||error==='incorrect_client_credentials'||error==='unsupported_grant_type')return {kind:'stop',reason:GITHUB_DEVICE_REASONS.unavailable};
 return {kind:'stop',reason:GITHUB_DEVICE_REASONS.failed};
}
/** The form that starts a sign-in, and the one each poll sends. No secret, no scope: a GitHub App's user token carries
 * the App's permissions, limited to what the person may do and the repositories they chose. */
export const githubDeviceStartForm=()=>new URLSearchParams({client_id:GITHUB_APP.clientId});
export const githubDevicePollForm=(deviceCode:string)=>new URLSearchParams({client_id:GITHUB_APP.clientId,device_code:deviceCode,grant_type:GITHUB_DEVICE_GRANT});
