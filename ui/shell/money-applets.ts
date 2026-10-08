import {stripeMoney} from '../applets/index.ts';
const amounts=values=>values?.length?values.map(v=>stripeMoney(v.amount,v.currency)).join(' · '):'No amounts in this read';
// Provider adapters return plain text, never provider HTML or model-generated totals.
export function stripeOverview(value){
 return ['Stripe account overview',`Read at: ${value.asOf||'Unknown'} · ${value.timezone||'Local timezone'}`,
  'Today collected: '+(value.todayComplete===false?'Unavailable — incomplete read':amounts(value.today)),
  'Estimated MRR: '+(value.mrrComplete===false?'Unavailable — incomplete read':amounts(value.mrr)),
  'Active subscriptions: '+(value.activeSubscriptions??'Unavailable'),'',
  'Collected is captured payment volume, not profit or payouts. MRR is the monthly equivalent of supported recurring prices. Currencies are not combined.',
  ...(value.limitations||[]),'',...(value.attention||[]).map(x=>`${x.title||x.id}: ${x.status||x.detail||''}`)].join('\n');
}
export function stripeCustomer(value){
 const c=value.customer||{},lines=[c.name||c.email||c.id,c.email||'',c.id||'',''];
 for(const [key,label] of [['subscriptions','Subscriptions'],['payments','Recent payments'],['invoices','Recent invoices']]){
  lines.push(label);const rows=value[key]||[];
  if(!rows.length)lines.push('No records returned.');
  for(const row of rows){const amount=row.amount??row.amountPaid??row.amount_paid??row.total;lines.push([row.name||row.description||row.number||row.id,row.status,amount===undefined?'':stripeMoney(amount,row.currency)].filter(Boolean).join(' · '));}
  lines.push('');
 }
 lines.push(value.limited?'Partial history. Open Stripe for complete records.':'Read only · Recent records');
 return lines.join('\n');
}
export async function readMoneyItem(native,app,record){
 if(app.key==='paypal')return native.paypalContent({operation:'read',id:record.id});
 const overview=record.id==='stripe-overview';
 const value=await native.stripe({operation:overview?'overview':'customer',...overview?{}:{id:record.id}});
 return {title:record.title,text:overview?stripeOverview(value):stripeCustomer(value)};
}
export async function loadMoney(native,key,cursor=null){
 if(key==='paypal'){
  const value=await native.paypalContent({operation:'list',page:cursor||1});
  return {records:(value.pages||[]).map(r=>({...r,list:[r.status,r.amount,r.currency].filter(Boolean).join(' · ')})),scope:value.scope,next:value.more?(cursor||1)+1:null};
 }
 const status=await native.stripe({operation:'status'});
 if(!status.connected)return {records:[],connected:false,scope:'Connect Stripe with Fox.'};
 const value=await native.stripe({operation:'customers',...cursor?{page:cursor}:{}});
 return {connected:true,records:[...cursor?[]:[{id:'stripe-overview',title:'Account overview',list:'Collected payments · Recurring revenue'}],...(value.items||[]).map(c=>({id:c.id,title:c.name||c.email||c.id,list:c.email||'',url:'https://dashboard.stripe.com/'+(status.mode==='test'?'test/':'')+'customers/'+c.id}))],scope:`${status.mode==='test'?'Test data':'Live'} · ${status.account} · Customers · Read only`,next:value.nextPage||null};
}
