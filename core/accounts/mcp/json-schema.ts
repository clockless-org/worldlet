// Whether a JSON value is valid under a JSON Schema, as Python's `jsonschema.validate` decides it for the tool input
// schemas MCP servers advertise (drafts 4, 6, 7, 2019-09 and 2020-12; `format` is not asserted, as there). Local
// `$ref`s only; unevaluatedProperties/unevaluatedItems, `$dynamicRef` and `$recursiveRef` are not evaluated.
import {chars} from '../google/python.ts';
import {isDict} from './python.ts';

type Draft=4|6|7|2019|2020;
const DRAFTS:Record<string,Draft>={'http://json-schema.org/draft-04/schema':4,'http://json-schema.org/draft-06/schema':6,'http://json-schema.org/draft-07/schema':7,
 'https://json-schema.org/draft/2019-09/schema':2019,'https://json-schema.org/draft/2020-12/schema':2020};

/** jsonschema's `equal`: booleans are never numbers, 1 equals 1.0, lists and objects by value. */
function equal(a:unknown,b:unknown):boolean{
 if(typeof a==='boolean'||typeof b==='boolean')return a===b;
 if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 if(isDict(a))return isDict(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
 return a===b;
}
function typed(value:unknown,type:unknown){
 switch(type){
 case 'null':return value===null;
 case 'boolean':return typeof value==='boolean';
 case 'object':return isDict(value);
 case 'array':return Array.isArray(value);
 case 'number':return typeof value==='number';
 case 'integer':return typeof value==='number'&&Number.isInteger(value);
 case 'string':return typeof value==='string';
 default:return false;
 }
}
function pointer(root:unknown,ref:string){
 if(!ref.startsWith('#'))throw new Error(`Unresolvable JSON pointer: ${JSON.stringify(ref)}`);
 let node:any=root;
 const path=decodeURIComponent(ref.slice(1));
 if(!path)return root;
 if(!path.startsWith('/'))throw new Error(`Unresolvable JSON pointer: ${JSON.stringify(ref)}`);
 for(const raw of path.slice(1).split('/')){
  const key=raw.replaceAll('~1','/').replaceAll('~0','~');
  if(Array.isArray(node)&&/^\d+$/.test(key)&&+key<node.length)node=node[+key];
  else if(isDict(node)&&Object.hasOwn(node,key))node=node[key];
  else throw new Error(`Unresolvable JSON pointer: ${JSON.stringify(path)}`);
 }
 return node;
}
function multiple(value:number,by:number){
 if(Number.isInteger(by))return value%by===0;
 const quotient=value/by;
 return Number.isFinite(quotient)&&Math.trunc(quotient)===quotient;
}

/** True when `instance` is valid under `schema`. */
export function jsonSchemaValid(instance:unknown,schema:unknown):boolean{
 const id=isDict(schema)&&typeof schema.$schema==='string'?schema.$schema.replace(/#$/,''):'';
 const draft:Draft=Object.hasOwn(DRAFTS,id)?DRAFTS[id]:2020;
 const valid=(value:any,node:any):boolean=>{
  if(node===true||node===false)return node;
  if(!isDict(node))return true;
  if(typeof node.$ref==='string'){
   if(!valid(value,pointer(schema,node.$ref)))return false;
   if(draft<=7)return true;
  }
  const has=(k:string)=>Object.hasOwn(node,k);
  if(has('type')){const types=Array.isArray(node.type)?node.type:[node.type];if(!types.some(t=>typed(value,t)))return false;}
  if(has('enum')&&Array.isArray(node.enum)&&!node.enum.some(v=>equal(v,value)))return false;
  if(draft>=6&&has('const')&&!equal(node.const,value))return false;
  for(const key of ['allOf','anyOf','oneOf'])if(has(key)&&Array.isArray(node[key])){
   const passed=node[key].filter(sub=>valid(value,sub)).length;
   if(key==='allOf'?passed!==node[key].length:key==='anyOf'?passed===0:passed!==1)return false;
  }
  if(has('not')&&valid(value,node.not))return false;
  if(draft>=7&&has('if')){
   if(valid(value,node.if)){if(has('then')&&!valid(value,node.then))return false;}
   else if(has('else')&&!valid(value,node.else))return false;
  }
  if(typeof value==='number'){
   const exclusive4=(k:string)=>draft===4&&node[k]===true;
   if(typeof node.minimum==='number'&&(exclusive4('exclusiveMinimum')?value<=node.minimum:value<node.minimum))return false;
   if(typeof node.maximum==='number'&&(exclusive4('exclusiveMaximum')?value>=node.maximum:value>node.maximum))return false;
   if(draft>=6&&typeof node.exclusiveMinimum==='number'&&value<=node.exclusiveMinimum)return false;
   if(draft>=6&&typeof node.exclusiveMaximum==='number'&&value>=node.exclusiveMaximum)return false;
   if(typeof node.multipleOf==='number'&&!multiple(value,node.multipleOf))return false;
  }
  if(typeof value==='string'){
   if(typeof node.minLength==='number'&&chars(value)<node.minLength)return false;
   if(typeof node.maxLength==='number'&&chars(value)>node.maxLength)return false;
   if(typeof node.pattern==='string'&&!new RegExp(node.pattern,'u').test(value))return false;
  }
  if(Array.isArray(value)){
   if(typeof node.minItems==='number'&&value.length<node.minItems)return false;
   if(typeof node.maxItems==='number'&&value.length>node.maxItems)return false;
   if(node.uniqueItems===true&&value.some((v,i)=>value.slice(i+1).some(w=>equal(v,w))))return false;
   let rest=0;
   if(draft===2020){
    if(Array.isArray(node.prefixItems)){if(!node.prefixItems.every((sub,i)=>i>=value.length||valid(value[i],sub)))return false;rest=node.prefixItems.length;}
    if(has('items')&&!value.slice(rest).every(v=>valid(v,node.items)))return false;
   }else if(Array.isArray(node.items)){
    if(!node.items.every((sub,i)=>i>=value.length||valid(value[i],sub)))return false;
    if(has('additionalItems')&&!value.slice(node.items.length).every(v=>valid(v,node.additionalItems)))return false;
   }else if(has('items')&&!value.every(v=>valid(v,node.items)))return false;
   if(draft>=6&&has('contains')){
    const found=value.filter(v=>valid(v,node.contains)).length;
    const min=draft>=2019&&typeof node.minContains==='number'?node.minContains:1;
    if(found<min)return false;
    if(draft>=2019&&typeof node.maxContains==='number'&&found>node.maxContains)return false;
   }
  }
  if(isDict(value)){
   const keys=Object.keys(value);
   if(Array.isArray(node.required)&&!node.required.every(k=>typeof k!=='string'||Object.hasOwn(value,k)))return false;
   if(typeof node.minProperties==='number'&&keys.length<node.minProperties)return false;
   if(typeof node.maxProperties==='number'&&keys.length>node.maxProperties)return false;
   const properties=isDict(node.properties)?node.properties:{},patterns=isDict(node.patternProperties)?node.patternProperties:{};
   for(const key of keys){
    let matched=false;
    if(Object.hasOwn(properties,key)){matched=true;if(!valid(value[key],properties[key]))return false;}
    for(const [pattern,sub] of Object.entries(patterns))if(new RegExp(pattern,'u').test(key)){matched=true;if(!valid(value[key],sub))return false;}
    if(!matched&&has('additionalProperties')&&!valid(value[key],node.additionalProperties))return false;
    if(draft>=6&&has('propertyNames')&&!valid(key,node.propertyNames))return false;
   }
   const dependencies:[string,unknown][]=[
    ...(draft<=7&&isDict(node.dependencies)?Object.entries(node.dependencies):[]),
    ...(draft>=2019&&isDict(node.dependentRequired)?Object.entries(node.dependentRequired):[]),
    ...(draft>=2019&&isDict(node.dependentSchemas)?Object.entries(node.dependentSchemas):[])];
   for(const [key,dependency] of dependencies){
    if(!Object.hasOwn(value,key))continue;
    if(Array.isArray(dependency)?!dependency.every(k=>Object.hasOwn(value,k)):!valid(value,dependency))return false;
   }
  }
  return true;
 };
 return valid(instance,schema);
}
