/** The conversation archive (core/agent/GRANTS.md#conversation-archive): conversations held outside Worldlet (a team
 * chat, a project's threads, another Agent's sessions) that an Agent saves into the World, so the person's Agents can
 * search them later. An Agent saves messages through the `worldlet` MCP server under a `source` it names; the host
 * stamps the saving Agent from the token that made the call, never from what the model sent. Credential-shaped text is
 * replaced with `[hidden]` before anything is kept. Hosts own clocks and storage; Core checks (core/agent/conversations.ts). */

/** Who wrote a message: the person (or another person in the conversation), an Agent, or the system it ran in. */
export type ConversationAuthor='person'|'agent'|'system';
export const CONVERSATION_AUTHORS:readonly ConversationAuthor[]=Object.freeze(['person','agent','system']);

/** One message as an Agent sends it to `conversations/add`. */
export interface ConversationMessageInput {
 /** The message's own ID where it came from; saving the same `source` and ID again replaces it (an edit). */
 id:string;
 /** The conversation or thread it belongs to, as the source names it. */
 thread:string;
 threadTitle?:string;
 author:ConversationAuthor;
 /** The author's display name, if the source gives one. */
 authorName?:string;
 /** Where it was written inside the source (a channel, an app), if it says. */
 surface?:string;
 /** When it was written: an ISO instant. */
 at:string;
 text:string;
}
/** One message as the World keeps it and `conversations/search` returns it. */
export interface ConversationMessage extends Required<Omit<ConversationMessageInput,'threadTitle'|'authorName'|'surface'>> {
 source:string;
 threadTitle:string;
 authorName:string;
 surface:string;
 /** The Agent that saved it last, host-stamped. */
 agentId:string;
 savedAt:string;
}

export const CONVERSATION_LIMITS=Object.freeze({
 source:80,id:200,thread:200,threadTitle:200,authorName:80,surface:40,text:32_000,
 /** Messages one `conversations/add` call may save. */
 add:200,
 /** Messages one `conversations/search` call returns; the default is 20. */
 search:50,searchDefault:20,
 query:200,
});

/** The World gateway targets (`conversations/<action>`), each its own Grant target. Only an Agent's own "Can save
 * conversations" and "Can search conversations" Grants name them; a Fox turn's Grant never does. */
export const CONVERSATION_TARGET='conversations';
export const CONVERSATION_ACTIONS=Object.freeze({add:'conversations/add',search:'conversations/search'} as const);

/** `conversations/add`. */
export interface ConversationAdd {source:string;messages:ConversationMessageInput[]}
/** `conversations/search`: newest first. `q` matches anywhere in the text, any case; the rest narrow it. With no `q`
 * it lists the newest messages, so `limit` 1 says how far a source has been saved. */
export interface ConversationSearch {q?:string;source?:string;thread?:string;author?:ConversationAuthor;since?:string;until?:string;limit?:number;offset?:number}
