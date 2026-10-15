import type {HostFeatures} from '../../contracts/platform.ts';
import {APP_DEFINITIONS} from './catalog.ts';

/** System-service requirements belong to Applet identity (`requiresHostFeature`
 * in each definition), not OS detection. No requirement means this rule does
 * not restrict the Applet; it does not promise that an account is connected or
 * that every feature is implemented.
 */
const requirements:Record<string,keyof HostFeatures>=Object.fromEntries(APP_DEFINITIONS.flatMap(app=>app.requiresHostFeature?[[app.key,app.requiresHostFeature]]:[]));
/** Applets that need the World page's own window (contracts/platform.ts PAGE_FEATURES), not a system service: every app
 * window has it, and a World page in a web browser does not. */
const PAGE_REQUIREMENTS:Record<string,keyof HostFeatures>={youtube:'youtube'};
export function appletSupport(provider:string,features:HostFeatures):{supported:boolean;reason?:string} {
 const page=PAGE_REQUIREMENTS[provider];
 if(page&&features[page]===false)return {supported:false,reason:'This Thing needs the Worldlet app on this computer. It is not available in a browser window.'};
 const feature=requirements[provider];
 return !feature||features[feature]?{supported:true}:{supported:false,reason:'This device does not support this system Thing. Your saved information is kept.'};
}
/** The Applets (by id) a page leaves out of its World because its window turned their feature off: a World page in a
 * web browser draws no YouTube. `off` holds only what the page's own transport turned off, so the app's World is as
 * before. */
export function appletsOffPage(off:Partial<HostFeatures>):string[] {
 return APP_DEFINITIONS.filter(app=>PAGE_REQUIREMENTS[app.key]&&off[PAGE_REQUIREMENTS[app.key]]===false).map(app=>app.id);
}

/** What the Applet catalog offers (an Area's Recommended and All lists, the Browser's "Add to World" offer): every
 * Applet (owner decision 2026-10-11: all 100+ can be recommended), website Applets included. The moving `ongoing`
 * placeholder is not an Applet anyone adds. */
export function inAppletCatalog(app:{key:string}|null|undefined):boolean {
 return !!app&&app.key!=='ongoing';
}
