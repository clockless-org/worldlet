/** Classify committed changes without restarting unrelated long-running Dev jobs. */
export function devChange(paths:string[]):'none'|'web'|'native' {
 let web=false;
 for(const file of paths){
  if(!file)continue;
  if(/^(docs\/|website\/|worker\/|models\/|migrations\/|\.github\/)/.test(file)||/^README(?:\.zh)?\.md$/.test(file)||file==='AGENTS.md')continue;
  if(/^scripts\/[^/]+-check\.(ts|py)$/.test(file))continue;
  if(file==='resources/styles/builtin/assets/brand/mark.json')return 'native';
  if(/^(ui\/|core\/|contracts\/|resources\/|platform\/bridge\/)/.test(file)){web=true;continue;}
  // The Electron host (platform/electron/**) and resident Python workers must load their new
  // implementation. Unknown build/dependency changes conservatively rebuild the host too.
  return 'native';
 }
 return web?'web':'none';
}
