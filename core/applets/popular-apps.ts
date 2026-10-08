import initialEntries from './popular-apps.json' with {type:'json'};
import expandedEntries from './expanded-apps.json' with {type:'json'};
import hundredEntries from './hundred-apps.json' with {type:'json'};
import developerEntries from './developer-apps.json' with {type:'json'};
const entries=[...initialEntries,...expandedEntries,...hundredEntries,...developerEntries];
import type {AppletDefinition} from '../../contracts/world.ts';
import {CURATED_READERS} from './curated-source.ts';
/** Website/native launchers, not connected-account readers. */
export const POPULAR_APPS: readonly AppletDefinition[]=entries.filter(app=>!(CURATED_READERS as readonly string[]).includes(app.key)).map(app=>({
 id:'app-'+app.key,key:app.key,title:app.title,purpose:app.purpose,region:app.region,version:1,
 description:app.preferNative?`Open ${app.title} or its website. This does not read its private data.`:`Use ${app.title} in your world. Sign in on its website; automatic account sync is not connected.`,
 installByDefault:false,focusPresentation:'world-device',
 nativeBundleIds:app.bundleIds,
 fullView:{kind:app.preferNative?'launcher':'web',url:app.url,platform:'web'},
 scene:{template:'device',color:'#819785',renderer:'painted-device',version:1},
 connection:{kind:app.preferNative?'native-launcher':'embedded-browser',provider:null,capability:app.preferNative?'launch':'browser'},
 support:{level:'launch-only',acceptance:false}
}));
export {entries as POPULAR_APP_ENTRIES};
