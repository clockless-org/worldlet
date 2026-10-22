/** Resolve only catalogued Markdown notes; native IO still enforces the selected vault. */
export function resolveVaultNote(target:string,current:string,ids:readonly string[]):string|null{
 let value=target.split('#')[0].trim();try{value=decodeURIComponent(value);}catch{return null;}
 if(!value||/^[\/\\]|^[a-z][a-z0-9+.-]*:/i.test(value)||value.includes('\\'))return null;
 const normalize=(p:string)=>{const parts=[];for(const bit of p.split('/')){if(!bit||bit==='.')continue;if(bit==='..'){if(!parts.length)return null;parts.pop();}else{if(bit.startsWith('.'))return null;parts.push(bit);}}return parts.join('/');};
 const note=value.toLowerCase().endsWith('.md')?value:value+'.md',folder=current.split('/').slice(0,-1).join('/');
 for(const candidate of [normalize(folder?folder+'/'+note:note),normalize(note)])if(candidate&&ids.includes(candidate))return candidate;
 if(value.includes('/'))return null;
 const matches=ids.filter(id=>id.split('/').at(-1)===note);return matches.length===1?matches[0]:null;
}
/** Wiki links outside fenced/inline code, with optional aliases and heading suffixes. */
export function vaultWikiLinks(text:string,current:string,ids:readonly string[]){
 const links: {start:number;end:number;label:string;target:string;id:string|null}[]=[];
 const tokens=/(`{3,}[^\n]*\n[\s\S]*?`{3,}|~{3,}[^\n]*\n[\s\S]*?~{3,}|`+[^`\n]*`+|\[\[([^\]\n]+)\]\])/g;
 for(const match of text.matchAll(tokens)){if(!match[2]||text[match.index!-1]==='!')continue;const [target,...alias]=match[2].split('|');links.push({start:match.index!,end:match.index!+match[0].length,label:alias.join('|')||target,target,id:resolveVaultNote(target,current,ids)});}
 return links;
}
