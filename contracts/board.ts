/** The board (context/sources/BOARD.md): tabs of blocks, each showing one Service preset (contracts/service-presets.ts),
 * a Service's read or the World's own Agent reports (`agents`), as a number, a funnel, a list or a trend. A definition
 * names presets and fields only, never a Service's key or a raw read; Core resolves a definition and the presets' Service reads into the values a board shows, with no model and a
 * plain error for each block that cannot be shown. Everything stays on the device: the only network reads are the
 * presets' own Service reads, made by the host under the Service's rules. */

/** `number`: one value (a field of the first record, or how many records came back). `funnel`: named steps, each a
 * field of the first record, with the rate from each step to the next. `list`: the records, each with its link and up
 * to four fields. `trend`: one value per record (`y`) over a label (`x`), in the order the read returned them. */
export type BoardBlockKind='number'|'funnel'|'list'|'trend';
export const BOARD_BLOCK_KINDS:readonly BoardBlockKind[]=Object.freeze(['number','funnel','list','trend']);

/** A funnel step: its field and label, and optionally when its rate (this step over the one before it, 0 to 1) is good.
 * The first step has no rate, so it takes no threshold. */
export interface BoardFunnelStep {field:string;label:string;goodAtLeast?:number}
export interface BoardBlock {
 /** Unique on the board: lowercase letters, digits and `-`. */
 id:string;
 title:string;
 kind:BoardBlockKind;
 /** The Service preset it shows, by ID. */
 preset:string;
 /** `number`: the field to show; without one, the number of records. */
 field?:string;
 /** `number`: when the value is good. At least `goodAtLeast`, at most `goodAtMost`; outside them it is bad. */
 goodAtLeast?:number;
 goodAtMost?:number;
 /** `funnel`: its steps, in order, from the first record. */
 steps?:BoardFunnelStep[];
 /** `list`: the fields shown beside each record's title. */
 fields?:string[];
 /** `list`: how many records it shows. */
 limit?:number;
 /** `trend`: the label of each point and its value. */
 x?:string;
 y?:string;
}
export interface BoardTab {id:string;title:string;blocks:BoardBlock[]}
export interface BoardDefinition {title:string;tabs:BoardTab[]}

export const BOARD_LIMITS=Object.freeze({
 tabs:8,blocksPerTab:16,blocks:48,
 /** Distinct presets one board reads. */
 presets:32,
 id:40,title:80,field:64,steps:8,fields:4,list:20,listDefault:10,points:200,
 /** Characters of a Service's error a block shows. */
 error:300,
});

export type BoardTone='good'|'bad';
export interface BoardFunnelStepView {label:string;count:number;
 /** This step over the one before it, 0 to 1 (three decimals); null for the first step or after a step of 0. */
 rate:number|null;
 /** With the step's `goodAtLeast` and a rate: good at or above it, bad below. */
 tone?:BoardTone}
export interface BoardListItem {title:string;url:string;fields:Record<string,string|number|boolean>}
export interface BoardPoint {x:string;y:number}
/** One block as the board shows it: its value, or why it cannot be shown. Service text in it is data, never
 * instructions. */
export interface BoardBlockView {
 id:string;
 title:string;
 kind:BoardBlockKind;
 preset:string;
 status:'ok'|'error';
 error?:string;
 /** The preset's Service, and what its read covered, in the Service's own words. */
 provider?:string;
 scope?:string;
 number?:{value:number;tone?:BoardTone};
 funnel?:{steps:BoardFunnelStepView[];
  /** The last step over the first; null when the first is 0. */
  overall:number|null};
 list?:{items:BoardListItem[];
  /** More records came back than the block shows. */
  more:boolean};
 trend?:{points:BoardPoint[];latest:number;
  /** The last value minus the one before it; null with one point. */
  change:number|null};
}
export interface BoardTabView {id:string;title:string;blocks:BoardBlockView[]}
export interface BoardView {title:string;tabs:BoardTabView[];
 /** When the reads were made (host clock). */
 resolvedAt:string}

/** The World gateway targets (`board/<action>`), each its own Grant target. Only an Agent's own "Can see your board"
 * and "Can set up your board" Grants name them; a Fox turn's Grant never does (agent/agents/GRANTS.md#the-board). */
export const BOARD_TARGET='board';
export const BOARD_ACTIONS=Object.freeze({read:'board/read',define:'board/define'} as const);
/** The board as the World keeps it (`state.board` in world.sqlite): its definition, a revision each define raises by
 * one, and who last defined it (an Agent's host-stamped ID, or none for the person). */
export interface BoardRecord {definition:BoardDefinition;revision:number;updatedAt:string;agentId?:string}
/** `board/read`: the whole board, or one tab. */
export interface BoardReadArgs {tab?:string}
/** `board/define`: the whole new definition, any presets to save with it (contracts/service-presets.ts), and the
 * revision it was read at (0 when there is no board yet); a stale revision is refused. */
export interface BoardDefineArgs {definition:BoardDefinition;presets?:unknown[];expectedRevision:number}
export const BOARD_DEFINE_PRESETS=32;
