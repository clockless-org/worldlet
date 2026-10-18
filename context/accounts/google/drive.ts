// Native Drive list and Google Docs text; no external URLs or arbitrary downloads (ported from Hermes drive_reader.py).
import type {GoogleRest} from './rest.ts';
import {got,chars} from './python.ts';

const FIELDS='id,name,mimeType,modifiedTime,description,capabilities(canDownload)';
const DOC='application/vnd.google-apps.document',SHEET='application/vnd.google-apps.spreadsheet',SLIDES='application/vnd.google-apps.presentation';
const KINDS:Record<string,string>={'google-docs':DOC,'google-sheets':SHEET,'google-slides':SLIDES};
const EDITORS:Record<string,string>={[DOC]:'document',[SHEET]:'spreadsheets',[SLIDES]:'presentation'};
const LIMIT=2*1024*1024,editor=(mime:unknown)=>typeof mime==='string'&&Object.hasOwn(EDITORS,mime);

function identifier(value:unknown){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,256}$/.test(value))throw new Error('Invalid Drive file ID.');
 return value;
}
function fileRow(value:any){
 if(value===null||typeof value!=='object'||Array.isArray(value)||typeof got(value,'name')!=='string')throw new Error('Drive returned an invalid file.');
 const key=identifier(got(value,'id')),mime=got(value,'mimeType');
 return {id:key,title:value.name,list:got(value,'modifiedTime',''),description:got(value,'description',''),mimeType:got(value,'mimeType',''),
  url:editor(mime)?'https://docs.google.com/'+EDITORS[mime]+'/d/'+key+'/edit':'https://drive.google.com/file/d/'+key+'/view',
  details:{modified:got(value,'modifiedTime',''),type:got(value,'mimeType','')}};
}

/** Python's csv.reader (excel dialect, not strict) over text read line by line, rows produced one at a time. */
export function* csvRows(text:string):Generator<string[]>{
 const lines=text.match(/[^\n]*\n|[^\n]+$/g)??[];
 let state='record',fields:string[]=[],field='',length=0;
 const save=()=>{fields.push(field);field='';length=0;};
 const add=(c:string)=>{field+=c;length++;};
 const step=(c:string|null)=>{
  const end=c===null,nl=c==='\n'||c==='\r';
  switch(state){
  case 'record':
   if(end)return;
   if(nl){state='crnl';return;}
   state='field';
  // falls through
  case 'field':
   if(nl||end){save();state=end?'record':'crnl';}
   else if(c==='"')state='quoted';
   else if(c===',')save();
   else{add(c);state='unquoted';}
   return;
  case 'unquoted':
   if(nl||end){save();state=end?'record':'crnl';}
   else if(c===','){save();state='field';}
   else add(c);
   return;
  case 'quoted':
   if(end)return;
   if(c==='"')state='quote';else add(c);
   return;
  case 'quote':
   if(c==='"'){add(c);state='quoted';}
   else if(c===','){save();state='field';}
   else if(nl||end){save();state=end?'record':'crnl';}
   else{add(c);state='unquoted';}
   return;
  case 'crnl':
   if(nl)return;
   if(end){state='record';return;}
   throw new Error("new-line character seen in unquoted field - do you need to open the file with newline=''?");
  }
 };
 let line=0;
 for(;;){
  fields=[];
  do{
   if(line>=lines.length){
    if(length!==0||state==='quoted'){save();yield fields;}
    return;
   }
   for(const c of lines[line++])step(c);
   step(null);
  }while(state!=='record');
  yield fields;
 }
}

/** Lists a Drive Applet's recent files or reads one file's export (`readOperation` list or read). */
export async function read(api:GoogleRest,body:any){
 const operation=got(body,'readOperation'),applet=got(body,'applet','google-drive');
 if(applet!=='google-drive'&&!(typeof applet==='string'&&Object.hasOwn(KINDS,applet)))throw new Error('Unsupported Drive Applet.');
 const kind=KINDS[applet];
 if(operation==='list'){
  const cursor=got(body,'cursor','');
  if(typeof cursor!=='string'||chars(cursor)>4096)throw new Error('Invalid Drive cursor.');
  const result=await api.get('drive/v3/files',{q:'trashed = false'+(kind?" and mimeType = '"+kind+"'":''),pageSize:20,orderBy:'modifiedTime desc',
   fields:'nextPageToken,files('+FIELDS+')',supportsAllDrives:true,includeItemsFromAllDrives:true,...(cursor?{pageToken:cursor}:{})});
  if(!Array.isArray(got(result,'files')))throw new Error('Drive did not return a file list.');
  return {pages:result.files.map(fileRow),next:got(result,'nextPageToken',null),connected:true,scope:'Recent files · Export reader · Read only'};
 }
 if(operation!=='read')throw new Error('Unsupported Drive read.');
 const key=identifier(got(body,'id'));
 const metadata=await api.get('drive/v3/files/'+key,{fields:FIELDS,supportsAllDrives:true});
 const result=fileRow(metadata);
 if(result.id!==key)throw new Error('Drive returned a different file.');
 const mime=got(metadata,'mimeType'),partial=(notice:string)=>({...result,text:result.description,partial:true,notice});
 if(kind&&mime!==kind)throw new Error('This file no longer belongs to this Applet. Refresh the list.');
 if(!editor(mime))return partial('File details only. Open Web to read this file in its original format.');
 if(got(got(metadata,'capabilities',{}),'canDownload')!==true)return partial('This document does not allow export. Open Web to read it.');
 const raw=await api.bytes('drive/v3/files/'+key+'/export',{mimeType:mime===SHEET?'text/csv':'text/plain'});
 if(!(raw instanceof Uint8Array))throw new Error('Drive did not return document text.');
 if(raw.length>LIMIT)return partial('This document is too large for the native reader. Open Web for the complete original.');
 // utf-8-sig: strict UTF-8 without one leading byte order mark.
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
 if(mime===SHEET){
  const rows:string[][]=[];
  for(const row of csvRows(text)){
   if(rows.length>=2000||row.length>100)return partial('This worksheet exceeds the native reader limit (2,000 rows or 100 columns). Open Web for the complete original.');
   rows.push(row);
  }
  return {...result,text,table:rows,partial:true,notice:'First worksheet only. Displayed values, without formulas, charts, comments or formatting. Open Web for all sheets and editing.'};
 }
 // Export contains the complete plain text, not a summary. Layout, images and comments remain on Web.
 return {...result,text,partial:false,notice:'Plain text export. Images, comments, slide layout and original formatting are available in Web.'};
}
