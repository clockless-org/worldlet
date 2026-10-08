// The `send` Harness service's rules (contracts/harness-services.ts HarnessSend): a reply the person approved, sent by
// their own Agent into the channel thread a brought conversation came from (core/agent/PORTABILITY.md#replying-in-a-channel).
// OpenClaw keeps where a session's replies go on the session itself (`deliveryContext`, else `lastChannel` and `lastTo`,
// with its account and thread) and sends with `openclaw message send` (docs.openclaw.ai/cli/message); Hermes Agent keeps
// the platform, chat and thread on each `state.db` session and sends with `hermes send --to <platform>:<chat>[:<thread>]`,
// the text on stdin. Neither runs a model: the text goes out as approved. The host runs the command; these are the rules.
// Kept ES-compatible for JavaScriptCore and Jint.

export const CHANNEL_REPLY=Object.freeze({
 /** The longest reply offered (Discord's own limit is 2,000 per message; the Agents split longer ones). */
 characters:4000,
 /** How long an offered reply waits for the person's Send, and how long the Agent's send command may take. */
 waitMs:24*3_600_000,sendMs:60_000,
});
const CHANNELS:Record<string,string>={discord:'Discord',telegram:'Telegram',slack:'Slack',signal:'Signal',whatsapp:'WhatsApp',imessage:'iMessage',matrix:'Matrix',msteams:'Microsoft Teams',googlechat:'Google Chat',mattermost:'Mattermost',sms:'SMS',feishu:'Feishu',weixin:'WeChat'};
/** The channels each Agent's send command names (`openclaw message send --channel`, `hermes send --to <platform>:`). */
const OPENCLAW_CHANNELS=['discord','googlechat','imessage','matrix','mattermost','msteams','signal','slack','telegram','whatsapp'];
const HERMES_PLATFORMS=['telegram','discord','slack','signal','whatsapp','matrix','mattermost','sms','feishu','weixin'];
const text=(value:unknown)=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
/** One command-line value: short, one line, nothing a shell or parser could read as something else. */
const plain=(value:string,limit=200)=>value&&value.length<=limit&&!/[\u0000-\u001f\u007f]/.test(value)?value:'';

/** A channel's name as the person knows it ("Discord"). */
export const channelTitle=(channel:string)=>CHANNELS[channel]??'';

/** The text as it will be sent, or why not. Media directives (`MEDIA:<path>` attaches a file of this computer in both
 * Agents' send paths, `[[as_document]]` and friends change how) are refused: what the person approves is text. */
export function channelReplyText(value:unknown):{text:string}|{error:string} {
 const said=typeof value==='string'?value.replace(/\r\n?/g,'\n').trim():'';
 if(!said)return {error:'The reply is empty.'};
 if([...said].length>CHANNEL_REPLY.characters)return {error:`A reply is at most ${CHANNEL_REPLY.characters} characters.`};
 if(/MEDIA:|\[\[[a-z_]+\]\]/i.test(said))return {error:'A reply is text only; it cannot attach files.'};
 return {text:said};
}

/** Whether an OpenClaw session is a group or channel others write in: direct chats collapse into the agent's main
 * session, while groups, channels and their threads get keys of their own (docs.openclaw.ai/concepts/messages). */
export const openClawSharedSession=(key:string)=>/:(group|channel|room|space|thread|topic):/i.test(key);
/** Whether a Hermes Agent session's chat is shared (its `chat_type`), not a direct message. */
export const hermesSharedChat=(chatType:unknown)=>['group','supergroup','channel','thread','forum','room'].includes(text(chatType).toLowerCase());

export type OpenClawSendRoute={channel:string;to:string;account?:string;thread?:string};
/** Where OpenClaw delivers a session's replies, from its session entry, or null when it names no channel it sends to. */
export function openClawSendRoute(entry:unknown):OpenClawSendRoute|null {
 const e=record(entry),d=record(e.deliveryContext);
 const channel=text(d.channel||e.lastChannel).toLowerCase(),to=plain(text(d.to||e.lastTo));
 if(!OPENCLAW_CHANNELS.includes(channel)||!to)return null;
 const account=plain(text(d.accountId||e.lastAccountId),120),thread=plain(text(d.threadId??e.lastThreadId),120);
 return {channel,to,...account?{account}:{},...thread?{thread}:{}};
}
/** `openclaw message send` for one reply. Every value is given as `--name=value`, so a leading dash stays a value. */
export function openClawSendArgs(route:OpenClawSendRoute,body:string):string[] {
 return ['message','send','--channel='+route.channel,'--target='+route.to,...route.account?['--account='+route.account]:[],...route.thread?['--thread-id='+route.thread]:[],'--message='+body,'--json'];
}

export type HermesSendRoute={platform:string;chat:string;thread?:string};
/** Where Hermes Agent sends into a session's chat, from the session row, or null for one with no chat it sends to (the
 * command line, ACP, webhooks, cron). */
export function hermesSendRoute(session:{source?:unknown;chatId?:unknown;threadId?:unknown}):HermesSendRoute|null {
 const platform=text(session.source).toLowerCase(),chat=plain(text(session.chatId),120);
 if(!HERMES_PLATFORMS.includes(platform)||!chat||chat.includes(':'))return null;
 const thread=plain(text(session.threadId),120);
 return {platform,chat,...thread&&!thread.includes(':')?{thread}:{}};
}
/** `hermes send` for one reply; the text goes on stdin (`--file -`), never on the command line. */
export function hermesSendArgs(route:HermesSendRoute):string[] {
 return ['send','--to='+route.platform+':'+route.chat+(route.thread?':'+route.thread:''),'--file','-','--json'];
}

/** What a send command reported: sent (with the message's ID when it says), or its reason. Both print JSON with
 * `--json`: OpenClaw `ok: false` and `error` on failure, Hermes Agent `success` or `error`. */
export function harnessSendResult(code:number|null,stdout:string,stderr=''):{ok:true;id?:string}|{ok:false;error:string} {
 let value:Record<string,any>={};
 const start=stdout.indexOf('{');
 if(start>=0)try{value=record(JSON.parse(stdout.slice(start)));}catch{}
 const said=text(value.error)||text(record(value.error).message);
 if(code===0&&value.ok!==false&&!said&&value.success!==false){
  const id=text(value.messageId??value.message_id??record(value.result).messageId??record(value.payload).messageId);
  return {ok:true,...plain(id,120)?{id}:{}};
 }
 const last=stderr.trim().split('\n').filter(Boolean).slice(-1)[0]??'';
 return {ok:false,error:(said||last||'The Agent could not send it.').slice(0,300)};
}
