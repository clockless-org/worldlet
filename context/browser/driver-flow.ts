import {browserDriverSnapshot,browserElementPolicy} from './agent-browser.ts';
/** Pure command flow shared by CEF and WebView2. Native adapters only execute argv. */
type Data=Record<string,any>;
const attributes=['type','autocomplete','href','contenteditable','readonly','disabled','aria-label'];
const snapshotAttributes=['type','autocomplete'];
function snapshotStep(f:Data):Data {
 const key=f.fields[f.fieldIndex];
 if(key)return {...f,stage:'snapshotAttribute',argv:['get','attr','@'+key,snapshotAttributes[f.index]]};
 const denied=Object.keys(f.snapshot.refs).filter(key=>browserElementPolicy(f.snapshot.refs[key]).error);
 const refs=Object.fromEntries(Object.entries(f.snapshot.refs).filter(([key])=>!denied.includes(key)));
 const text=String(f.snapshot.snapshot||'').split('\n').filter(line=>!denied.some(key=>line.includes('[ref='+key+']'))).join('\n');
 return {refs,documentId:f.documentId,result:browserDriverSnapshot({snapshot:{...f.snapshot,refs,snapshot:text},documentId:f.documentId,url:f.url})};
}
export function browserDriverStart(input:Data):Data {
 const {args,documentId,refs,url,revision}=input,op=args.operation;
 const base={args,documentId,refs,url,facts:{},stage:'',index:0};
 if(op==='snapshot')return {...base,documentId:revision,stage:'snapshot',argv:['snapshot']};
 if(op==='scroll'){
  if(args.ref&&(!documentId||args.documentId!==documentId||!refs[args.ref]))return {result:{error:'Inspect the page again before scrolling this element.'}};
  return {...base,stage:'scroll',consume:true,argv:['scroll',args.direction==='up'?'up':'down','500',...(args.ref?['--selector','@'+args.ref]:[])]};
 }
 if(!['prepare','fill','click','submit'].includes(op))return {result:{error:'Unsupported browser action. Take a fresh snapshot.'}};
 if(!documentId||args.documentId!==documentId||!refs[args.ref])return {result:{error:'The page changed. Take a fresh snapshot before acting.'}};
 return {...base,facts:{...refs[args.ref],url},stage:'attribute',argv:['get','attr','@'+args.ref,attributes[0]]};
}
export function browserDriverNext(input:{flow:Data;response:Data}):Data {
 const {flow:f,response:r}=input,op=f.args.operation,ref='@'+f.args.ref;
 if(f.stage==='snapshot')return snapshotStep({...f,snapshot:{...r,refs:r.refs||{}},fields:Object.keys(r.refs||{}).filter(key=>['textbox','searchbox','combobox'].includes(r.refs[key].role)),fieldIndex:0,index:0});
 if(f.stage==='snapshotAttribute'){
  const key=f.fields[f.fieldIndex],value=r.value??r.attribute;
  const refs={...f.snapshot.refs,[key]:{...f.snapshot.refs[key],[snapshotAttributes[f.index]]:value??''}};
  const next=f.index+1;
  return snapshotStep({...f,snapshot:{...f.snapshot,refs},index:next%snapshotAttributes.length,fieldIndex:f.fieldIndex+(next===snapshotAttributes.length?1:0)});
 }
 if(f.stage==='scroll')return {result:{ok:true,action:'scrolled',guidance:'Take a fresh snapshot to see the resulting page.'}};
 if(f.stage==='focus')return {...f,stage:'action',consume:true,argv:['press','Enter']};
 if(f.stage==='action')return {result:{ok:true,action:op==='fill'?'filled':op==='submit'?'submitted':'clicked',label:f.prepared.label||''}};
 let facts={...f.facts};
 if(f.stage==='attribute'){
  const name=attributes[f.index],value=r.value??r.attribute;
  if(name==='readonly'||name==='disabled')facts[name]=typeof value==='string';
  else if(name==='aria-label'){if(value)facts.name=value;}
  else if(value!==undefined&&value!==null)facts[name]=value;
  const index=f.index+1;
  if(index<attributes.length)return {...f,facts,index,argv:['get','attr',ref,attributes[index]]};
  if(!value&&['button','link'].includes(facts.role))return {...f,facts,stage:'label',argv:['get','text',ref]};
 }else if(f.stage==='label'&&r.text)facts.name=r.text;
 const prepared=browserElementPolicy(facts);
 if(prepared.error)return {result:prepared};
 // Hosts prepare with the intended action; a submit always leaves a receipt.
 if(op==='prepare')return {result:{...prepared,receipt:prepared.receipt||f.args.intent==='submit'}};
 if((op==='fill'||op==='submit')&&!prepared.editable)return {result:{error:'Choose an editable text field. Enter passwords, payment details and verification codes yourself.'}};
 if(op==='fill'&&typeof f.args.text!=='string')return {result:{error:'Enter text to fill this field.'}};
 return {...f,prepared,stage:op==='submit'?'focus':'action',consume:op==='click',argv:op==='fill'?['fill',ref,f.args.text]:op==='submit'?['focus',ref]:['click',ref]};
}
