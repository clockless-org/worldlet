import type {HostFeatures} from '../../contracts/platform.ts';
import {APP_DEFINITIONS} from './catalog.ts';

/** System-service requirements belong to Applet identity (`requiresHostFeature`
 * in each definition), not OS detection. No requirement means this rule does
 * not restrict the Applet; it does not promise that an account is connected or
 * that every feature is implemented.
 */
const requirements:Record<string,keyof HostFeatures>=Object.fromEntries(APP_DEFINITIONS.flatMap(app=>app.requiresHostFeature?[[app.key,app.requiresHostFeature]]:[]));
export function appletSupport(provider:string,features:HostFeatures):{supported:boolean;reason?:string} {
 const feature=requirements[provider];
 return !feature||features[feature]?{supported:true}:{supported:false,reason:'This device does not support this system Thing. Your saved information is kept.'};
}

/** What the Applet catalog offers (an Area's Recommended and All lists, the Browser's "Add to World" offer): every
 * Applet (owner decision 2026-10-11: all 100+ can be recommended), website Applets included. The moving `ongoing`
 * placeholder is not an Applet anyone adds. */
export function inAppletCatalog(app:{key:string}|null|undefined):boolean {
 return !!app&&app.key!=='ongoing';
}
