import {modelStatusFresh} from '../../core/companion/index.ts';

/** Coalesce bridge IO; invalidation prevents an old response from publishing or winning a newer read. */
type ModelStatus = {available?:boolean;reason?:string;cloudAllowed?:boolean;[key:string]:unknown};
export function createModelStatusReader(read:()=>Promise<ModelStatus>, publish:(value:ModelStatus)=>void, now=()=>performance.now()){
 let generation=0;
 let cached:{value:ModelStatus;at:number}|null=null, pending:Promise<ModelStatus>|null=null;
 const get=():Promise<ModelStatus>=>{
  if(cached&&modelStatusFresh({ready:cached.value.available===true,ageMs:now()-cached.at,sameScope:true}))return Promise.resolve(cached.value);
  if(pending)return pending;
  const started=generation;
  const request=Promise.resolve().then(read).then(value=>{
   if(started!==generation)return get();
   cached=value.available===true?{value,at:now()}:null;
   publish(value);return value;
  },error=>{if(started!==generation)return get();throw error;}).finally(()=>{if(pending===request)pending=null;});
  pending=request;return request;
 };
 return {get,invalidate(){generation++;cached=null;pending=null;}};
}
