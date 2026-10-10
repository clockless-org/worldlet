// Kinds of ongoing things (owner request 2026-10-06: "根据对话 channels 推荐生成 applet … 其实有一些固定的 比如健身
// 学习 财务"). A kept conversation that is about one of a few fixed kinds of life (fitness, food, study, money, travel,
// a project) opens on a ready-made page for that kind, filled from the conversation itself: the workouts, meals,
// questions, amounts, trip plans or to-dos the person wrote. Anything else keeps the plain page. Pure rules; the
// host reads the turns and the page draws them (core/tasks/README.md#kinds).

export type OngoingKind='food'|'fitness'|'study'|'finance'|'travel'|'project';
export type OngoingKindOrGeneral=OngoingKind|'general';
export interface OngoingKindSpec {
 /** Its name on the page and in Fox's pitch ("Fitness"). */
 title:string;
 /** The area of the World its device stands in (storage IDs, core/applets regions). */
 region:string;color:string;
 /** Words that say a conversation is about it. */
 words:RegExp;
 /** The page's log: which of the person's own messages belong in it, and the value each one shows. */
 heading:string;noun:string;match:RegExp;value?:RegExp;empty:string;
 /** What the page offers and what Fox is asked. */
 action:string;ask:string;
 /** What the device says it does ("Keeps your workout log"). */
 purpose:string;
}

// The order breaks ties: a "#diet-and-health" channel is about food before fitness.
export const ONGOING_KINDS:Readonly<Record<OngoingKind,OngoingKindSpec>>=Object.freeze({
 food:{title:'Food',region:'money',color:'#b7773a',
  words:/\b(diet\w*|food|meals?|breakfast|lunch|dinner|snacks?|recipes?|cook\w*|calories|kcal|protein|carbs?|nutrition|groceries)\b|饮食|早饭|早餐|午饭|午餐|晚饭|晚餐|热量|卡路里|蛋白质|食谱|做饭|吃了/i,
  heading:'Meals you noted',noun:'meals',match:/\b(breakfast|lunch|dinner|snacks?|ate|eating|meals?)\b|\d+\s?(kcal|calories)\b|早饭|早餐|午饭|午餐|晚饭|晚餐|吃了|加餐|热量/i,
  value:/\d[\d,]*\s?(kcal|calories|cal|大卡|千卡|卡)(?![a-z])/i,empty:'No meals in this conversation yet.',
  action:'Review my meals',purpose:'Keeps what you eat in one place',
  ask:'summarize what I ate in the last few days, how it fits what I am aiming for, and what to eat next'},
 fitness:{title:'Fitness',region:'money',color:'#c0573e',
  words:/\b(fitness|gym|workouts?|exercis\w*|training|runs?|running|jog\w*|lifting|squats?|bench|deadlifts?|reps|cardio|yoga|swim\w*|cycling|marathon|health)\b|健身|锻炼|运动|跑步|训练|深蹲|卧推|瑜伽|游泳|骑行|减脂|增肌|体重|健康/i,
  heading:'Workouts you noted',noun:'workouts',match:/\b\d+(\.\d+)?\s?(kg|kgs|lbs?|reps?|sets?|km|mi|miles?|mins?|minutes?|steps)\b|\d+\s?(公斤|斤|次|组|公里|分钟|步)|\b(ran|run|lifted|gym|workout|squats?|bench|deadlifts?|yoga|swam|rode)\b|跑了|练了|健身|深蹲|卧推/i,
  value:/\d+(\.\d+)?\s?(kg|kgs|lbs?|reps?|sets?|km|mi|miles?|mins?|minutes?|steps|公斤|斤|次|组|公里|分钟|步)(?![a-z])/i,empty:'No workouts in this conversation yet.',
  action:'Plan my next workout',purpose:'Keeps your workout log',
  ask:'list my workouts from the last two weeks, what is getting better, and what my next session should be'},
 study:{title:'Study',region:'work',color:'#4f6f9a',
  words:/\b(study\w*|learn\w*|course|class(es)?|lessons?|exams?|homework|vocab\w*|grammar|japanese|spanish|french|english|math\w*|physics|flashcards?|tutor\w*|lectures?)\b|学习|上课|课程|考试|作业|单词|复习|英语|日语|数学|读书|背单词|语法/i,
  heading:'Questions you asked',noun:'questions',match:/[?？]\s*$|^\s*(what|why|how|when|which|explain|can you explain)\b|怎么|为什么|什么是|如何|解释一下/i,
  empty:'No questions in this conversation yet.',
  action:'Quiz me',purpose:'Keeps what you are learning',
  ask:'tell me what I have learned so far, what I still get wrong, and quiz me on one thing'},
 finance:{title:'Money',region:'money',color:'#5f7f3a',
  words:/\b(money|budget\w*|financ\w*|invest\w*|stocks?|portfolio|crypto|bitcoin|savings?|spen[dt]\w*|expenses?|income|salary|tax(es)?|bills?|rent|mortgage|bank\w*)\b|理财|财务|记账|预算|投资|股票|基金|存钱|开销|花费|收入|工资|报税|账单|房租|房贷/i,
  heading:'Amounts you noted',noun:'amounts',match:/[$€£¥￥]\s?\d|\d[\d,]*(\.\d+)?\s?(USD|EUR|RMB|CNY|dollars|bucks|元|块|万)/i,
  value:/[$€£¥￥]\s?\d[\d,]*(\.\d+)?|\d[\d,]*(\.\d+)?\s?(USD|EUR|RMB|CNY|dollars|bucks|元|块|万)/i,empty:'No amounts in this conversation yet.',
  action:'Review my money',purpose:'Keeps your money matters together',
  ask:'list the amounts and money decisions in it, what is coming up, and anything I should act on'},
 travel:{title:'Travel',region:'money',color:'#3f8090',
  words:/\b(trips?|travel\w*|flights?|hotels?|airbnb|vacations?|holidays?|itinerar\w*|visas?|passports?)\b|旅行|旅游|出差|机票|酒店|行程|签证|航班/i,
  heading:'Plans you noted',noun:'plans',match:/\b(flights?|fly|flying|hotels?|airbnb|check[- ]in|depart\w*|arriv\w*|book\w*|itinerar\w*|day \d+)\b|航班|机票|酒店|出发|到达|入住|行程|第.天/i,
  value:/\b\d{1,2}[/.-]\d{1,2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* \d{1,2}\b|\d{1,2}月\d{1,2}[日号]/i,empty:'No plans in this conversation yet.',
  action:'Show the trip plan',purpose:'Keeps your trip plans',
  ask:'lay out the plan so far: dates, places, bookings, and what is still open'},
 project:{title:'Project',region:'work',color:'#6a5f8f',
  words:/\b(projects?|launch\w*|roadmap|plan|planning|milestones?|deadlines?|sprints?|tasks?|todos?|bugs?|fix\w*|deploy\w*|releases?|repos?|PRs?|product|clients?|meetings?)\b|项目|计划|上线|发布|任务|待办|截止|需求|会议|代码/i,
  heading:'To-dos you mentioned',noun:'to-dos',match:/^\s*(-\s*\[ \]|todo\b|to-do\b)|\b(need to|needs to|have to|should|must|next step|let'?s|remember to|don'?t forget|deadline|tomorrow)\b|要做|需要|下一步|记得|别忘了|截止|明天|待办/i,
  empty:'No to-dos in this conversation yet.',
  action:'What\'s next',purpose:'Keeps where your project stands',
  ask:'list what is done, what is still open, and the next step'},
});
export const ONGOING_KIND_IDS=Object.keys(ONGOING_KINDS) as OngoingKind[];
/** The kinds Fox offers to pull onto one page (core/tasks/themes.ts): the parts of life where the conversations are the
 * person's own record (what they ate, lifted, learned, spent, planned). A project is not one (owner Order 2026-10-10:
 * a page joining three unrelated work threads into their "status" had no subject and told old news as current): each
 * work thread is its own matter and where it stands lives in the work itself, not in what was said about it weeks ago. */
export const ONGOING_THEME_KINDS:readonly OngoingKind[]=Object.freeze(ONGOING_KIND_IDS.filter(kind=>kind!=='project'));
export const ongoingOffered=(kind:OngoingKindOrGeneral):kind is OngoingKind=>(ONGOING_THEME_KINDS as readonly string[]).includes(kind);
export const isOngoingKind=(value:unknown):value is OngoingKindOrGeneral=>value==='general'||ONGOING_KIND_IDS.includes(value as OngoingKind);

/** Most of the person's own messages read to tell the kind, and how many must speak for one kind before it counts. */
const SAMPLE=60,TEXT_HITS=3;
/** What a conversation is about: its name and where it lives count most, then the person's own messages (`text`, one
 * message per line). A coding Agent's conversation without another kind is a project; anything else is general. */
export function ongoingKind(facts:{source:string;title:string;where:string},text=''):OngoingKindOrGeneral {
 const name=facts.title,place=facts.where.split(' · ').slice(1).join(' ');
 const lines=text.split('\n').map(line=>line.trim()).filter(Boolean).slice(-SAMPLE);
 let best:OngoingKindOrGeneral='general',score=0;
 for(const kind of ONGOING_KIND_IDS){
  const {words}=ONGOING_KINDS[kind];
  const hits=lines.filter(line=>words.test(line)).length;
  const value=(words.test(name)?10:0)+(words.test(place)?6:0)+(hits>=TEXT_HITS?hits:0);
  if(value>score){best=kind;score=value;}
 }
 if(best==='general'&&['claude-code','codex','pi'].includes(facts.source))return 'project';
 return best;
}

export interface OngoingTemplateEntry {at:string;text:string;value?:string}
export interface OngoingTemplate {kind:OngoingKind;title:string;heading:string;stats:{label:string;value:string}[];entries:OngoingTemplateEntry[];empty:string;action:string}
const ENTRIES=12,ENTRY_TEXT=200,DAY=86_400;
const clip=(value:string,count:number)=>{const chars=[...value.replace(/\s+/g,' ').trim()];return chars.length>count?chars.slice(0,count-1).join('').trimEnd()+'…':chars.join('');};
/** The kind's page filled from the conversation: the person's own messages that belong in its log (newest first),
 * how many there are, on how many days, and when the last was. Nothing is invented: every entry is something the
 * person wrote, and a value is a number as it was written. */
export function ongoingTemplate(kind:OngoingKind,turns:{role:string;text:string;createdAt:string}[],now:number):OngoingTemplate {
 const spec=ONGOING_KINDS[kind];
 const own=turns.filter(turn=>turn.role==='user'&&typeof turn.text==='string'&&spec.match.test(turn.text));
 const days=new Set(own.map(turn=>String(turn.createdAt).slice(0,10)).filter(Boolean));
 const last=own.length?Date.parse(own[own.length-1].createdAt)/1000:NaN;
 const ago=!Number.isFinite(last)?'':(d=>d<1?'today':d<2?'yesterday':d<14?d+' days ago':Math.floor(d/7)+' weeks ago')(Math.floor((now-last)/DAY));
 const entries=own.slice(-ENTRIES).reverse().map(turn=>{
  const value=spec.value?turn.text.match(spec.value)?.[0]?.trim():undefined;
  return {at:turn.createdAt,text:clip(turn.text,ENTRY_TEXT),...value?{value}:{}};
 });
 const stats=[{label:spec.noun.charAt(0).toUpperCase()+spec.noun.slice(1),value:String(own.length)},{label:'Days',value:String(days.size)},...ago?[{label:'Last',value:ago}]:[]];
 return {kind,title:spec.title,heading:spec.heading,stats,entries,empty:spec.empty,action:spec.action};
}
