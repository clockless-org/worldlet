/** Shared view state for the list and the measured paper regions. It never writes to the source provider. */
export interface ReminderView {filter:string;list:string;query:string;selected:string}
const boards=new WeakMap<object,ReminderView>();
export function reminderView(owner:object){const state=boards.get(owner)||{filter:'all',list:'',query:'',selected:''};boards.set(owner,state);return state;}
export const reminderCompleted=item=>item.record?.completed===true||item.record?.completed==='true';
export const reminderList=item=>String(item.record?.list||'Reminders');
export function reminderDate(item){const raw=item.record?.due||item.start;if(!raw)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?raw+'T12:00:00':raw);return Number.isNaN(+d)?null:d;}
export function visibleReminders(items:any[],state:ReminderView,now:Date){
 const groups=[...new Set(items.map(reminderList))];
 return items.filter(i=>(!state.list||reminderList(i)===state.list)&&(!state.query||[i.title,i.summary,i.context,i.record?.text,reminderList(i)].join(' ').toLocaleLowerCase().includes(state.query.toLocaleLowerCase()))&&(state.filter==='all'||state.filter==='completed'&&reminderCompleted(i)||state.filter==='scheduled'&&reminderDate(i)||state.filter==='today'&&reminderDate(i)?.toDateString()===now.toDateString()))
  .sort((a,b)=>groups.indexOf(reminderList(a))-groups.indexOf(reminderList(b))||Number(!!b.attention)-Number(!!a.attention)||+(reminderDate(a)||Infinity)-+(reminderDate(b)||Infinity));
}
