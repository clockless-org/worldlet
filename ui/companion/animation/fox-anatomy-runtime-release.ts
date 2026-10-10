import type * as Runtime from './fox-anatomy-runtime.ts';
/** Non-dev bundles resolve fox-anatomy-runtime.ts here (scripts/build-native-ui.ts).
 * Only the dev resource pack carries draft anatomy performances, so no state is authored. */
export type {AnatomyRuntimeSources} from './fox-anatomy-runtime.ts';
export const anatomyRuntimeState:typeof Runtime.anatomyRuntimeState=()=>undefined;
export const anatomyRuntimeDuration:typeof Runtime.anatomyRuntimeDuration=()=>undefined;
export const loadAnatomyFox:typeof Runtime.loadAnatomyFox=async()=>{throw Error('Draft Fox anatomy is available only in development builds.');};
