/** Host-owned execution plan carried by the bundled Attention adapter protocol. */
export interface AttentionRead {provider:string;limit?:number;query?:string;id?:string}
export type AttentionExecutionPlan =
 | {timeoutSeconds:number;reads:AttentionRead[];prompt?:never}
 | {timeoutSeconds:number;prompt:string;reads?:never};
