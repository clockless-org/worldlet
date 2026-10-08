// What the checks plant on the page before the interface loads: stand-ins for
// the native bridge, recorded calls and the switches a fixture flips. Declared
// once, so the browser-side callbacks in the scripts read as the page sees them.
declare var actions: any;
declare var audio: any;
declare var calls: any;
declare var delaySpeech: any;
declare var finishLatency: any;
declare var fixture: any;
declare var testApplet: string;
declare var listCountBefore: number;
declare var lastContext: any;
declare var onboarding: any;
declare var privateConsent: any;
/** The sites a fixture says the built-in browser recorded. */
declare var recordedSites: {site:string;visits:number}[];
declare var updateChannel: string|undefined;
declare var updateSwitchable: boolean|undefined;
/** A snapshot as Core delivers it, with Attention text already written. */
declare var processed: (snapshot: any) => any;
declare var refreshRevision: any;
declare var resolveSpeech: any;
declare var sampleUI: any;
declare var sent: any;
declare var staleReleaseLoaded: any;
/** The replay check's clock: the one time Date reports until the check moves it. */
declare var __now: number;

interface HTMLElement {
 /** The world publishes its live metrics on its host element for the checks to read. */
 sceneMetrics?: any;
}
