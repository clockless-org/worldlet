// DoorDash through its official pinned CLI (dd-cli): the operations Fox may run, their arguments, and what reaches
// Fox from the answer (ported from Hermes doordash_cli.py). No shell, payment submission or credential export: the
// Platform runs the command (sources/doordash.ts). Kept ES-compatible.

export const DOORDASH_CLI_VERSION='0.2.4';
const INTENT='Summary: Help the user order food through Worldlet\nuser prompt/purpose: "Food ordering"';
type Kind='string'|'int'|'bool';
// Deliberately excludes submit, payment, account and address edits, and arbitrary flags.
const COMMANDS:Readonly<Record<string,{command:string[];allowed:Record<string,Kind>;required:string[]}>>=Object.freeze({
 addresses:{command:['address','list'],allowed:{},required:[]},
 search:{command:['search'],allowed:{query:'string','address-id':'string',limit:'int'},required:['query','address-id']},
 menu:{command:['menu'],allowed:{'store-id':'string','address-id':'string'},required:['store-id']},
 item:{command:['restaurant-item-details'],allowed:{'store-id':'string','menu-id':'string','item-id':'string','address-id':'string'},required:['store-id','menu-id','item-id']},
 cart_list:{command:['cart','list'],allowed:{'store-id':'string'},required:[]},
 cart_show:{command:['cart','show'],allowed:{'cart-uuid':'string'},required:['cart-uuid']},
 cart_add:{command:['cart','add-items'],allowed:{'store-id':'string','menu-id':'string','items-json':'string','cart-uuid':'string',fulfillment:'string'},required:['store-id','menu-id','items-json']},
 cart_remove:{command:['cart','remove-item'],allowed:{'cart-uuid':'string','cart-item-id':'string'},required:['cart-uuid','cart-item-id']},
 preview:{command:['order','preview'],allowed:{'cart-uuid':'string',fulfillment:'string','include-work-benefits':'bool'},required:['cart-uuid']},
 checkout:{command:['order','checkout-url'],allowed:{'cart-uuid':'string'},required:['cart-uuid']},
 history:{command:['order','history'],allowed:{max:'int',days:'int'},required:[]},
 order_status:{command:['order','status'],allowed:{'order-uuid':'string'},required:['order-uuid']},
});
/** Operations that can change the cart: a failure or timeout may have applied part of them. */
export const DOORDASH_MUTATIONS=Object.freeze(['cart_add','cart_remove','preview']);
const LIMITS:Readonly<Record<string,number>>={limit:10,max:20,days:365};

const isDict=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fits=(value:unknown,kind:Kind)=>kind==='string'?typeof value==='string':kind==='bool'?typeof value==='boolean':typeof value==='number'&&Number.isInteger(value);

/** The CLI arguments for one operation, or an Error naming what is wrong with it. */
export function doordashArgs(operation:unknown,parameters:unknown):string[] {
 const spec=typeof operation==='string'&&Object.hasOwn(COMMANDS,operation)?COMMANDS[operation]:null;
 if(!spec||!isDict(parameters))throw new Error('Unsupported DoorDash operation.');
 const keys=Object.keys(parameters);
 if(keys.some(key=>!Object.hasOwn(spec.allowed,key))||spec.required.some(key=>!Object.hasOwn(parameters,key)))throw new Error('Missing or unsupported DoorDash parameters.');
 const values:Record<string,unknown>={...parameters};
 if(operation==='search'&&!('limit' in values))values.limit=5;
 if(operation==='history'){if(!('max' in values))values.max=10;if(!('days' in values))values.days=30;}
 const args=['--json-output',...spec.command];
 for(const key of Object.keys(values)){
  const value=values[key],kind=spec.allowed[key];
  if(!fits(value,kind))throw new Error('Invalid parameter type: '+key);
  if(typeof value==='string'&&(!value||value.length>20000||value.includes('\0')))throw new Error('Invalid parameter: '+key);
  if(kind==='int'&&!((value as number)>=1&&(value as number)<=(LIMITS[key]??100)))throw new Error('Parameter exceeds request limit.');
  if(key==='fulfillment'&&value!=='delivery'&&value!=='pickup')throw new Error('Choose delivery or pickup.');
  if(key==='items-json'){
   let items:unknown;
   try{items=JSON.parse(value as string);}catch{throw new Error('Choose 1–30 items.');}
   if(!Array.isArray(items)||items.length<1||items.length>30)throw new Error('Choose 1–30 items.');
   for(const item of items){
    if(!isDict(item)||!item.item_id||!item.item_name||!(typeof item.quantity==='number'&&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=20))throw new Error('Each item needs an ID, name and quantity (1–20).');
   }
  }
  if(kind==='bool'){if(value)args.push('--'+key);}
  else args.push('--'+key,String(value));
 }
 return [...args,'--intent',INTENT];
}

/** The CLI's answer without anything that looks like a credential or an instruction to the assistant. */
export function cleanDoordash(value:unknown):unknown {
 if(Array.isArray(value))return value.map(cleanDoordash);
 if(isDict(value)){
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value))if(!['token','authorization','secret','password','assistant_instruction'].some(word=>key.toLowerCase().includes(word)))out[key]=cleanDoordash(item);
  return out;
 }
 return value;
}

/** Only DoorDash's own secure checkout pages may reach Fox. */
export function validDoordashCheckout(url:string):boolean {
 try{
  const parsed=new URL(url);
  return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&(parsed.port===''||parsed.port==='443')&&(parsed.hostname==='doordash.com'||parsed.hostname.endsWith('.doordash.com'));
 }catch{return false;}
}
function checkLinks(value:unknown){
 if(typeof value==='string'&&/^https?:/.test(value)&&!validDoordashCheckout(value))throw new Error('DoorDash returned an unsupported checkout host.');
 if(Array.isArray(value))value.forEach(checkLinks);
 else if(isDict(value))Object.values(value).forEach(checkLinks);
}

export interface DoordashRun {timedOut:boolean;exitCode:number|null;stdout:string}
/** What one CLI run means for Fox: its cleaned data, or why not. Never its raw error output, which can carry
 * sign-in addresses. A checkout's links are DoorDash's own or the whole answer is refused. */
export function doordashOutcome(operation:string,run:DoordashRun):Record<string,unknown> {
 const mutation=DOORDASH_MUTATIONS.includes(operation);
 const inspect='Cart changes may have applied. Inspect the cart before trying again.';
 if(run.timedOut)return {ok:false,error:'DoorDash timed out. '+(mutation?inspect:'Try again when ready.'),uncertain:mutation};
 if(run.exitCode)return {ok:false,error:'DoorDash could not complete the request. '+(mutation?inspect:'Check sign-in and early-access approval in the DoorDash Applet.'),exitCode:run.exitCode,uncertain:mutation};
 if(run.stdout.length>1_000_000)return {ok:false,error:'DoorDash returned too much data. Narrow the request.',uncertain:mutation};
 let value:unknown;
 try{value=JSON.parse(run.stdout);}catch{return {ok:false,error:'DoorDash returned an unexpected response. Inspect the cart before repeating any changes.',uncertain:mutation};}
 value=cleanDoordash(value);
 const failed=isDict(value)&&(Boolean(value.error)||value.success===false||value.ok===false||Boolean(value.item_errors));
 if(failed)return {ok:false,data:value,error:'DoorDash reported a failure or partial result; '+(mutation?'inspect the cart before repeating changes.':'inspect returned data before continuing.'),uncertain:mutation};
 if(operation==='checkout')checkLinks(value);
 return {ok:true,data:value};
}
