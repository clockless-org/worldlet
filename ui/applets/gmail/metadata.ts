/** Read only source metadata; a Fox summary is never evidence of sender identity. */
export function mailMetadata(record:any={}){
 const headers:Record<string,string>={};
 const source=record.mail?.headers||record.headers||record.payload?.headers||{};
 if(Array.isArray(source)){for(const h of source)if(h?.name)headers[h.name.toLowerCase()]=String(h.value||'');}
 else for(const [name,value] of Object.entries(source))if(typeof value==='string')headers[name.toLowerCase()]=value;
 let found=false;
 for(const line of String(record.text||record.markdown||'').split(/\r?\n/).slice(0,24)){
  const match=line.match(/^(?:#{1,3}\s+)?(From|To|Cc|Date|Subject|Status):\s*(.*)$/i);
  if(match){if(!headers[match[1].toLowerCase()])headers[match[1].toLowerCase()]=match[2].trim();found=true;continue;}
  if(!line.trim()){if(found)break;continue;}
  if(!found&&/^# /.test(line))continue;
  break;
 }
 const address=value=>typeof value==='string'?value:value?.email?(value.name?`${value.name} <${value.email}>`:value.email):'';
 return {...record,from:address(record.from)||address(record.sender)||headers.from||'',date:record.date||record.receivedAt||record.sentAt||record.internalDate||headers.date||'',to:address(record.to)||headers.to||'',title:record.title||headers.subject||'',avatar:record.senderAvatar||record.avatar||'',headers};
}
