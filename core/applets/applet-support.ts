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
 return !feature||features[feature]?{supported:true}:{supported:false,reason:'This device does not support this system Applet. Your saved information is kept.'};
}
