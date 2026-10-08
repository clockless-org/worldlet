/** Applet-owned declaration. Hosts supply authorization, IO and the clock. */
export interface AttentionRegistration {
 version:1;
 provider:string;
 reader:'native-calendar'|'source-reader'|'observation';
 intervalMinutes:number;
 freshnessMinutes:number;
}
export interface AttentionFact {
 id:string;
 provider:string;
 sourceId:string;
 revision:number;
 title:string;
 text:string;
 fingerprint:string;
 url:string;
 observedAt:number;
 expiresAt:number;
 changedAt:number;
 removed:boolean;
 keys:string[];
 attributes:Record<string,string|boolean>;
 /** The user's own mail workflow (#1152). A ranking signal kept outside revision content:
  * archiving or reading a thread reorders its findings without invalidating them. */
 workflow?:AttentionWorkflow;
 /** When the source's newest message arrived, from the trusted reader (Gmail internalDate), as
  * an ISO instant. Like workflow, it is outside revision content and ranks and labels findings. */
 receivedAt?:string;
}
export interface AttentionWorkflow {
 placement?:'inbox'|'archived';
 unread?:boolean;
}
export interface AttentionObservation {
 id:string;
 sourceId?:string;
 observedAt?:number;
 fingerprint?:string;
 title?:string;
 text:string;
 url?:string;
 removed?:boolean;
 keys?:string[];
 attributes?:Record<string,string|boolean>;
 workflow?:AttentionWorkflow;
 /** Reader-reported receipt time: epoch milliseconds or an ISO instant. */
 receivedAt?:number|string;
}
export interface AttentionDependency {id:string;revision:number}
export interface AttentionBudget {
 contentVersion?:number;
 seen?:Record<string,number>;
 nextAt?:number;
 lastSweepAt?:number;
 sweepOffset?:number;
 day?:number;
 attempts?:number;
 failures?:number;
 /** Until then a pass with fewer than ATTENTION_FULL_SEEDS seeds waits, so a burst shares one pass. */
 coalesceUntil?:number;
 /** When the latest pass started; a source's first-scan backlog spaces partial passes from it. */
 startedAt?:number;
}
export interface AttentionPlan {
 facts:AttentionFact[];
 seeds:AttentionDependency[];
 sweep:boolean;
}

/** Source evidence is separate from local record createdAt/updatedAt.
 * observedAt is host-stamped first observation of the saved finding; sourceUpdatedAt
 * is optional verified source update time. Missing source times stay unknown. */
export interface AttentionTimes {
 occurredAt?:string;
 /** Host-owned: newest receipt among the item's mail sources, from the reader, never the model. */
 receivedAt?:string;
 observedAt?:string;
 sourceUpdatedAt?:string;
 dueAt?:string;
}

/** One saved Attention item offered to event grouping. `event` is an optional explicit
 * topic plus subject (account, merchant or thread identity); keywords never group. */
export interface AttentionEventMember extends AttentionTimes {
 id:string;
 provider:string;
 kind:string;
 title?:string;
 state?:string;
 priority?:string;
 actionLabel?:string;
 start?:number|string;
 status?:string;
 snoozedUntil?:string;
 event?:{topic:string;subject:string};
 sources:{provider:string;id:string;remoteId?:string;quote?:string;url?:string}[];
}
/** What the user last decided about an event, keyed by its stable ID and source identities. */
export interface AttentionEventRecord {
 id:string;
 sourceKeys:string[];
 status:'open'|'dismissed'|'done';
 snoozedUntil?:string;
}
export interface AttentionEvent {
 id:string;
 lead:AttentionEventMember;
 members:AttentionEventMember[];
 sources:AttentionEventMember['sources'];
 sourceKeys:string[];
 messageCount:number;
 priority:string;
 actions:string[];
 newEvidence:boolean;
 status:'open'|'dismissed'|'done';
 snoozedUntil?:string;
}
