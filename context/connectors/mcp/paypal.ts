// Merchant invoices through the official PayPal MCP: read-only, bounded, no model (ported from Hermes paypal_mcp.py).
import type {McpGate,McpSession,McpToolResult} from './session.ts';
import {pyStr,head} from '../google/python.ts';
import {ValueError,isDict,dget,slice,loads} from './python.ts';

export const PAYPAL_ENDPOINTS:readonly string[]=Object.freeze(['https://mcp.paypal.com/http','https://mcp.paypal.com/mcp']);
export const PAYPAL_GATE:McpGate=Object.freeze({name:'paypal',urls:PAYPAL_ENDPOINTS,connectMessage:'Connect PayPal with Fox first. Merchant access is required for invoices.',
 urlMessage:'Reconnect to the official PayPal MCP.',disconnectedMessage:'PayPal is disconnected. Reconnect with Fox.',include:null,bearer:false,timeoutSeconds:60});
const TIMEOUT=45,INVOICE=/^INV2-[A-Za-z0-9-]{1,80}$/;

/** `structuredContent` when an object, else the first text part that parses as JSON; unwraps `data`. */
export function paypalPayload(result:McpToolResult){
 if(result?.isError)throw new Error('PayPal could not read these invoices. Check merchant access or reconnect.');
 let value=result?.structuredContent??null;
 if(!isDict(value))for(const part of result?.content??[]){
  try{value=loads(part?.text??'');break;}catch{continue;}
 }
 if(!isDict(value))throw new Error('PayPal returned an unsupported response. Open PayPal on the web.');
 if(isDict(dget(value,'data')))value=value.data;
 return value as Record<string,any>;
}

function invoice(row:unknown){
 const identifier=pyStr(dget(row,'id',''));
 if(!INVOICE.test(identifier))throw new Error('PayPal returned an invalid invoice identifier.');
 const detail=dget(row,'detail')||{},amount=dget(row,'amount')||{};
 return {id:identifier,title:head(pyStr(dget(detail,'invoice_number')||identifier),300),status:head(pyStr(dget(row,'status')||'Unknown'),80),
  amount:head(pyStr(dget(amount,'value','')),40),currency:head(pyStr(dget(amount,'currency_code','')),8),date:head(pyStr(dget(detail,'invoice_date')||''),40),
  url:'https://www.paypal.com/invoice/payerView/details/'+identifier} as Record<string,any>;
}

/** `list` (page `page`, 1–100, of 20 invoices) or `read` (one invoice by `id`, with its items as text). */
export async function readPaypal(session:McpSession,body:Record<string,any>){
 const operation=dget(body,'operation','list');
 if(operation==='list'){
  const page=dget(body,'page',1);
  if(typeof page!=='number'||!Number.isInteger(page)||page<1||page>100)throw new ValueError('Invalid invoice page.');
  const data=paypalPayload(await session.callTool('list_invoices',{page,page_size:20},TIMEOUT));
  const rows=dget(data,'items',dget(data,'invoices'));
  if(!Array.isArray(rows))throw new Error('PayPal did not return an invoice list. Open PayPal on the web.');
  return {pages:rows.slice(0,20).map(invoice),page,more:rows.length>=20,scope:'Merchant invoices · 20 per page · Read only'};
 }
 if(operation==='read'){
  const identifier=pyStr(dget(body,'id',''));
  if(!INVOICE.test(identifier))throw new ValueError('Invalid invoice identifier.');
  let data=paypalPayload(await session.callTool('get_invoice',{invoice_id:identifier},TIMEOUT));
  if(isDict(dget(data,'invoice')))data=data.invoice;
  const result=invoice(data);
  const lines=[result.title,'Status: '+result.status,'Amount: '+result.amount+' '+result.currency,'Date: '+result.date,'','Invoice items'];
  for(const row of slice(dget(data,'items')||[],100)){
   const unit=dget(row,'unit_amount')||{};
   lines.push(head(pyStr(dget(row,'name','Item')),500)+' · '+head(pyStr(dget(row,'quantity','')),30)+' × '+head(pyStr(dget(unit,'value','')),40)+' '+head(pyStr(dget(unit,'currency_code','')),8));
  }
  result.text=head(lines.join('\n'),50000);
  return result;
 }
 throw new ValueError('Unsupported read-only PayPal operation.');
}
