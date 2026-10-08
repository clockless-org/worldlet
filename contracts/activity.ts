/** Local observations, never proof of reading, intent or successful external action. */
/** Counts DOM frame elements only, without inspecting their documents or discovering worker targets. */
export interface ActivityCoverage {scope:'document';frameElements:number;workers:'not-observed'}
export interface ActivityPage {url:string;title:string;text:string;documentId:string;visible:boolean;truncated:boolean;omitted?:string;scrollX?:number;scrollY?:number;clicks?:Array<{tag:string;label:string;href?:string}>;edits?:Array<{tag:string;inputType:string;characters:number}>;interactions?:Array<Record<string,unknown>>;dropped?:number;coverage?:ActivityCoverage}
export interface ActivityState {visitId:string;url:string;navigationURL:string;documentId:string;title:string;text:string;lastTick:number;active:boolean;visibleMs:number;scrollX?:number;scrollY?:number;coverage?:string}
export interface ActivityFact {version:1;id:string;at:number;kind:string;surfaceId:string;visitId?:string;data:Record<string,unknown>}
/** Ends an observed visit, not necessarily the underlying browser document. */
export type ActivityEndReason='navigation'|'hidden'|'closed'|'popup'|'unavailable';
export interface ActivityObservation {id:string;surfaceId:string;at:number;tick:number;active:boolean;close?:boolean;endReason?:ActivityEndReason;page?:ActivityPage;state?:ActivityState|null}
