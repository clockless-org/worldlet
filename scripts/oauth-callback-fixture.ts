import assert from 'node:assert/strict';
import crypto from 'node:crypto';
/** Only synthetic OAuth callbacks belong in these tests. Never print a real callback URL or title. */
export async function assertOAuthCallback(response:Response){
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'text/html; charset=utf-8');
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('referrer-policy'),'no-referrer');
 const html=await response.text();
 assert.match(html,/<title>Worldlet sign-in<\/title>/);
 const script=html.match(/<script>(.*?)<\/script>/s)![1];
 const hash=crypto.createHash('sha256').update(script).digest('base64');
 assert.equal(response.headers.get('content-security-policy'),`default-src 'none'; script-src 'sha256-${hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
 for(const value of new URL(response.url).searchParams.values())if(value)assert.ok(!html.includes(value),'callback parameters are not reflected in HTML');
}
