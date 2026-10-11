import type {HostFeatures} from '../../contracts/platform.ts';
import {APP_DEFINITIONS} from './catalog.ts';
import {GAME_APPLETS} from './definitions/games.ts';
import {WEB_GAME_APPLETS} from './definitions/web-games.ts';

/** System-service requirements belong to Applet identity (`requiresHostFeature`
 * in each definition), not OS detection. No requirement means this rule does
 * not restrict the Applet; it does not promise that an account is connected or
 * that every feature is implemented.
 */
const requirements:Record<string,keyof HostFeatures>=Object.fromEntries(APP_DEFINITIONS.flatMap(app=>app.requiresHostFeature?[[app.key,app.requiresHostFeature]]:[]));
export function appletSupport(provider:string,features:HostFeatures):{supported:boolean;reason?:string} {
 const feature=requirements[provider];
 return !feature||features[feature]?{supported:true}:{supported:false,reason:'This device does not support this system Applet. Your saved information is kept.'};
}

/** What the Applet catalog offers (an Area's Recommended and All lists, the Browser's "Add to World" offer): Applets
 * that work once added, meaning they connect an account or read this computer, plus the Browser and the games.
 * Website-only Applets are frozen: one already in someone's World stays and Fox can still open any of them, but the
 * catalog no longer offers them. */
const GAMES=new Set([...GAME_APPLETS,...WEB_GAME_APPLETS].map(app=>app.key));
export function inAppletCatalog(app:{key:string;connection?:{capability?:string}}|null|undefined):boolean {
 if(!app)return false;
 return ['connect','local','read'].includes(app.connection?.capability||'')||app.key==='browser'||GAMES.has(app.key);
}
