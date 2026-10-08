/** Projection input, independent of either host's storage representation. */
export interface ContextSource {id:string;title:string;enabled:boolean;revision:string|number}
export interface ContextKnowledge {
 sourceId:string;
 sourceRevision:string|number;
 summary:string;
 facts:{text:string;[key:string]:unknown}[];
 intent?:string|null;
 [key:string]:unknown;
}
export interface SourceContextState {sources:ContextSource[];knowledge:ContextKnowledge[]}
