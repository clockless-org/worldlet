import initialEntries from './popular-apps.json' with {type:'json'};
import expandedEntries from './expanded-apps.json' with {type:'json'};
import hundredEntries from './hundred-apps.json' with {type:'json'};
import developerEntries from './developer-apps.json' with {type:'json'};
const entries=[...initialEntries,...expandedEntries,...hundredEntries,...developerEntries];
import type {AppletDefinition} from '../../contracts/world.ts';
import {CURATED_READERS} from './curated-source.ts';
/** Website Applets that are also Worldlet Services (contracts/services.ts): the same website, plus an account the
 * person connects with a pasted key (TOKEN_PROVIDERS), read only when asked: no Attention reader, no background work. */
const SERVICE_WEBSITES:Readonly<Record<string,{description:string;purpose:string}>>=Object.freeze({
 posthog:{description:'Use PostHog on its website. Connect it with a personal API key, and Fox and the Agents you allow can run read-only queries and list your insights, dashboards, feature flags and annotations when asked. Nothing is read in the background.',
  purpose:'Fox reads your PostHog analytics when you ask'},
 cloudflare:{description:'Use Cloudflare on its dashboard. Connect it with a read-only API token, and Fox and the Agents you allow can read your Workers\' invocations and errors and your zones\' requests over the last day when asked. Nothing is read in the background or changed in Cloudflare.',
  purpose:'Fox checks your Cloudflare traffic and Workers when you ask'},
});
/** Website/native launchers, not connected-account readers, except the Services above. */
export const POPULAR_APPS: readonly AppletDefinition[]=entries.filter(app=>!(CURATED_READERS as readonly string[]).includes(app.key)).map(app=>{
 const service=Object.hasOwn(SERVICE_WEBSITES,app.key)?SERVICE_WEBSITES[app.key]:null;
 return {
  id:'app-'+app.key,key:app.key,title:app.title,purpose:service?.purpose??app.purpose,region:app.region,version:1,
  description:service?.description??(app.preferNative?`Open ${app.title} or its website. This does not read its private data.`:`Use ${app.title} in your world. Sign in on its website; automatic account sync is not connected.`),
  installByDefault:false,focusPresentation:'world-device',
  nativeBundleIds:app.bundleIds,
  fullView:{kind:app.preferNative?'launcher':'web',url:app.url,platform:'web'},
  scene:{template:'device',color:'#819785',renderer:'painted-device',version:1},
  connection:service?{kind:'hermes',provider:app.key,capability:'connect'}:{kind:app.preferNative?'native-launcher':'embedded-browser',provider:null,capability:app.preferNative?'launch':'browser'},
  support:{level:'launch-only',acceptance:false}
 };
});
export {entries as POPULAR_APP_ENTRIES};
