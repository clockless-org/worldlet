// Provider → operation → the change fields it uses; every provided change must appear in review and execution.
const RULES:Record<string,Record<string,string[]>>={
 'google-calendar':{create:['start','end','title','text'],reschedule:['start','end']},
 'apple-reminders':{create:['title','text','due'],complete:[],reschedule:['due']},
 'apple-notes':{create:['title','text'],append:['text']},
 todoist:{complete:[]}
};
/** Shared write plans. Native adapters resolve OS identity/permissions and execute only reviewed plans. */
export function homeWritePlan(input:any){
 if(!input||!Object.keys(RULES).includes(input.provider))throw Error('Choose Calendar, Reminders, Notes or Todoist.');
 if(!Object.keys(RULES[input.provider]).includes(input.operation))throw Error('This operation is not supported for this Applet.');
 const allowed=['provider','operation','id','title','text','start','end','due'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Unsupported Home action field.');
 const plan:any={provider:input.provider,operation:input.operation};
 for(const key of allowed.slice(2))if(input[key]!==undefined){
  if(typeof input[key]!=='string'||input[key].length>(key==='text'?30000:1000))throw Error('Invalid '+key+'.');
  plan[key]=input[key];
 }
 if(input.operation!=='create'&&!plan.id?.trim())throw Error('Read the original first and use its exact source ID.');
 if(input.operation==='create'&&!plan.title?.trim())throw Error('A title is required.');
 if(input.operation==='append'&&!plan.text?.trim())throw Error('Text to append is required.');
 const instant=(key:string)=>{const v=plan[key];if(!v||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error(key+' must include a date, time and timezone.');const [year,month,day]=v.slice(0,10).split('-').map(Number);if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())throw Error('Invalid calendar date.');return Date.parse(v);};
 if(plan.provider==='google-calendar'){
  if(instant('end')<=instant('start'))throw Error('The event must end after it starts.');
 }
 if(plan.provider==='apple-reminders'&&(plan.due!==undefined||plan.operation==='reschedule'))instant('due');
 // Disallow silently ignored fields.
 const fields=RULES[plan.provider][plan.operation];
 for(const key of Object.keys(plan))if(!['provider','operation','id'].includes(key)&&!fields.includes(key))throw Error('Field '+key+' is not used by this operation.');
 if(plan.operation==='create'&&plan.id)throw Error('A new item must not specify an existing item ID.');
 const prefix='live:'+plan.provider+':';if(plan.id?.startsWith(prefix))plan.id=plan.id.slice(prefix.length);
 if(plan.provider==='todoist'&&!/^[A-Za-z0-9]{1,100}$/.test(plan.id))throw Error('Invalid Todoist task ID.');
 plan.connectionTransport=plan.provider==='todoist'?'hermes':'native';
 return plan;
}
