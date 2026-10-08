/** Earlier turns of one place, grouped into topics (owner Order 2026-10-08): several turns about the same
 * thing read as one stack, and a turn about something else starts the next stack, even in the same place.
 * Local and model-free: a long pause starts a new topic, and so does a question that shares too little with
 * the topic so far. Short follow-ups ("why?", "继续", "好") always stay with the topic they answer. */

export interface TopicTurn {id:string;user:string;text:string;at:number}
export interface ConversationTopic<T extends TopicTurn=TopicTurn> {id:string;title:string;turns:T[]}

/** A pause this long between two turns starts a new topic. */
export const TOPIC_PAUSE_MS=30*60*1000;
/** A question needs about this many words (two and a half Chinese characters counting as one) before its
 * words can say it changed the subject; anything shorter is a follow-up. */
const MIN_WORDS=3;
const CJK=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const LATIN=/[a-z][a-z0-9'-]{2,}/g;
function questionSize(text:string){const value=String(text||'').toLowerCase();return (value.match(LATIN)||[]).filter(w=>!STOP.has(w)).length+(value.match(CJK)||[]).length/2.5;}
/** A question sharing less than this part of its words with the topic so far starts a new one. */
const MIN_SHARED=.15;
const TITLE_LIMIT=40;
const STOP=new Set(('the and for are but not you your with this that what when where which who how why can could would should will '
 +'about from have has had was were been into just like please there their them then than also some more most very does did '
 +'lets let get got make made want need know tell show give take one two').split(' '));
const CJK_STOP=new Set(['一个','这个','那个','我们','你们','他们','什么','怎么','可以','就是','然后','还是','因为','所以','如果','没有','不是','现在','一下','这样','那样']);

/** The words that say what a line is about: Latin words of three letters or more (no stop words) and
 * pairs of neighbouring Chinese, Japanese or Korean characters. */
export function topicWords(text:string):Set<string>{
 const words=new Set<string>(),value=String(text||'').toLowerCase();
 for(const word of value.match(/[a-z][a-z0-9'-]{2,}/g)||[])if(!STOP.has(word))words.add(word.replace(/'s$/,''));
 for(const run of value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{2,}/gu)||[])
  for(let i=0;i<run.length-1;i++){const pair=run.slice(i,i+2);if(!CJK_STOP.has(pair))words.add(pair);}
 return words;
}

/** The topic's name: its first question (or, for a line Fox said first, its first words), on one line. */
export function topicTitle(turns:readonly TopicTurn[]):string{
 const first=turns.find(t=>t.user.trim())?.user||turns[0]?.text||'';
 const line=first.replace(/[*_`#>\[\]]/g,'').replace(/\s+/g,' ').trim();
 return [...line].length>TITLE_LIMIT?[...line].slice(0,TITLE_LIMIT-1).join('').trimEnd()+'…':line;
}

/** Turns in order (oldest first) as topics in order. Each topic's id is its first turn's id, so it stays the
 * same while the topic grows. */
export function conversationTopics<T extends TopicTurn>(turns:readonly T[]):ConversationTopic<T>[]{
 const topics:{turns:T[];words:Set<string>}[]=[];
 for(const turn of turns){
  const current=topics.at(-1),asked=topicWords(turn.user);
  const paused=!!current&&turn.at>0&&current.turns.at(-1)!.at>0&&turn.at-current.turns.at(-1)!.at>TOPIC_PAUSE_MS;
  let shared=0;if(current)for(const word of asked)if(current.words.has(word))shared++;
  const elsewhere=!!current&&asked.size>0&&questionSize(turn.user)>=MIN_WORDS&&shared/asked.size<MIN_SHARED;
  if(!current||paused||elsewhere)topics.push({turns:[turn],words:new Set([...asked,...topicWords(turn.text)])});
  else{current.turns.push(turn);for(const word of [...asked,...topicWords(turn.text)])current.words.add(word);}
 }
 return topics.map(t=>({id:t.turns[0].id,title:topicTitle(t.turns),turns:t.turns}));
}
