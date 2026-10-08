/** Trusted UI → host conversation protocol. Hosts own identity, privacy and sessions. */
export interface FoxChatBody {
 id:string;text:string;context?:Record<string,unknown>;
 /** The place and view the turn was asked in (the chat's context key); the host keeps it with the turn. */
 thread?:string;
 history?:{role:'user'|'assistant';text:string}[];
 sample?:boolean;allowActions?:boolean;
 /** What the person saw as their side of the turn when Worldlet wrote the request (a button's label such as
  * "Today’s plan"); the conversation archive keeps it instead of the long request. */
 shown?:string;
 /** Work Worldlet started by itself (the day's plan and summary): it runs in a background session of its own
  * beside the conversation, and only a line of its result joins the conversation (owner Order 2026-10-07). */
 background?:boolean;
}
export interface FoxHostBodies {
 agentChat:FoxChatBody;
 agentSteer:{id:string;text:string};
 agentCancel:{id?:string};
}
export type FoxHostAction=keyof FoxHostBodies;
export type FoxHostRequest={[K in FoxHostAction]:{action:K}&FoxHostBodies[K]}[FoxHostAction];
export function isFoxHostAction(action:unknown):boolean {
 return ['agentChat','agentSteer','agentCancel','hermesChat','hermesSteer','hermesCancel'].includes(action as string);
}
