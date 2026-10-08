// Nothing private goes into the public repository (AGENTS.md#keep-private-information-out). This fails on secrets,
// private network addresses, personal home folders and a list of known private names (hosts, machines, the operations
// repository, internal ids, addresses). The names are kept as SHA-256 prefixes, so this file does not publish them.
// A line that must keep a match (a client key that is public by design) carries `public-safety: allow` on that line or
// the line above, with the reason.
// Usage: node scripts/public-safety-check.mjs [files...]   (no files: every tracked text file; in the operations
// repository, which has oss-export.json, the export check runs instead and applies the same rules to what it exports)
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,statSync} from 'node:fs';

const PRIVATE_NAMES=new Set([
 '7dfe7d5427367641','a1a844a297f1c531','d079b6e83d3b4d1a','1f5aca8282a34706','38d4f0fac7a55058','120ea628e69aac84',
 'd5b7423dc35488ec','e39b5bf314daf5f7','1e7b141c522c27ef','de3a5cfd94d66219','3b929044ea711a9b','6c6d2c9533c0ecb6',
]);
export const nameHash=text=>createHash('sha256').update(text.toLowerCase()).digest('hex').slice(0,16);

// Secrets: a match that is plainly made up (abcdef…, 1234…, xxxx, example, fake, test) is a fixture.
const SECRETS=[
 [/\bgh[pousr]_[A-Za-z0-9]{30,}/,'GitHub token'],
 [/\bgithub_pat_[A-Za-z0-9_]{30,}/,'GitHub token'],
 [/\bAKIA[0-9A-Z]{16}\b/,'AWS key'],
 [/\bsk-(?:ant-|proj-|live_)?[A-Za-z0-9_-]{32,}/,'API key'],
 [/\bxox[abpr]-[A-Za-z0-9-]{20,}/,'Slack token'],
 [/\bAIza[0-9A-Za-z_-]{35}\b/,'Google API key'],
 [/\bphx_[A-Za-z0-9]{30,}/,'PostHog personal key'],
];
const madeUp=/abcdef|0123|1234|xxxx|example|fake|test|dummy|placeholder/i;
// Private IPv4 ranges; 192.168.0.x, 192.168.1.x and 10.0.0.x are the usual router defaults and stay as fixtures.
const IPV4=/(?<![\d.])(10|172|192)\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.]*\d)/g;
const privateIp=([,a,b,c,d])=>{
 const n=[a,b,c,d].map(Number);if(n.some(x=>x>255))return false;
 const lan=n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168);
 const fixture=(n[0]===192&&n[1]===168&&n[2]<=1)||(n[0]===10&&n[1]===0&&n[2]===0);
 return lan&&!fixture;
};
// A home folder names a person; examples use one of these.
const HOMES=/(?:\/Users\/|[A-Z]:\\{1,2}Users\\{1,2})([A-Za-z0-9._-]+)/g;
const PLACEHOLDER_HOMES=new Set(['a','alex','me','you','user','username','name','example','fixture','runner','shared','public','default','test','someone','person','sam','dev','developer','private-person','$user','%username%']);
// Candidate names: words with dots, @ and hyphens, and each run of their parts.
const words=/[A-Za-z0-9][A-Za-z0-9._@-]*[A-Za-z0-9]/g;
function* names(word){
 const parts=word.split(/([.@-])/);
 for(let i=0;i<parts.length;i+=2)for(let j=i;j<parts.length&&j<i+12;j+=2)yield parts.slice(i,j+1).join('');
}

export function findPrivate(file,text){
 const hits=[],lines=text.split('\n'),seen=new Map();
 // A real key block: the header followed by its base64 body (a redaction test writes the header alone).
 for(const m of text.matchAll(/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----(?:\\n|\r?\n)\s*MII/g))hits.push(`${file}:${text.slice(0,m.index).split('\n').length}: private key`);
 const allowed=index=>/public-safety: allow/.test(lines[index])||(index>0&&/public-safety: allow/.test(lines[index-1]));
 lines.forEach((line,index)=>{
  if(line.length>20000||allowed(index))return;
  const at=what=>hits.push(`${file}:${index+1}: ${what}`);
  for(const [pattern,kind] of SECRETS){const m=line.match(pattern);if(m&&!madeUp.test(m[0]))at(kind);}
  for(const m of line.matchAll(IPV4))if(privateIp(m))at(`private network address ${m[0]}`);
  for(const m of line.matchAll(HOMES))if(!PLACEHOLDER_HOMES.has(m[1].toLowerCase())&&!m[1].startsWith('$')&&!m[1].startsWith('%'))at(`home folder of "${m[1]}" (use /Users/alex)`);
  for(const m of line.matchAll(words))for(const name of names(m[0])){
   const key=name.toLowerCase();let hit=seen.get(key);
   if(hit===undefined){hit=PRIVATE_NAMES.has(nameHash(key));seen.set(key,hit);}
   if(hit)at(`private name "${name}"`);
  }
 });
 return hits;
}

const textual=/\.(?:md|ts|mts|mjs|js|json|jsonc|ya?ml|html|css|py|sh|swift|kt|kts|plist|xml|txt|toml|gradle|xcconfig|entitlements)$/;
export const isText=file=>textual.test(file)||/(?:^|\/)(?:Dockerfile|Makefile|\.env[\w.-]*|\.gitignore|LICENSE|NOTICE)$/.test(file);

if(import.meta.url===`file://${process.argv[1]}`){
 if(existsSync('oss-export.json')&&process.argv.length<=2){
  process.exit(spawnSync(process.execPath,['scripts/oss-export.mjs','--check'],{stdio:'inherit'}).status??1);
 }
 const files=process.argv.length>2?process.argv.slice(2):execFileSync('git',['ls-files','-z'],{encoding:'utf8',maxBuffer:1<<26}).split('\0').filter(Boolean);
 const hits=[];
 for(const file of files){
  if(!isText(file)||!existsSync(file)||statSync(file).size>8<<20)continue;
  hits.push(...findPrivate(file,readFileSync(file,'utf8')));
 }
 if(hits.length){
  console.error(`${hits.length} private details in tracked files (see AGENTS.md, "Keep private information out"):`);
  for(const hit of hits.slice(0,200))console.error('  '+hit);
  process.exit(1);
 }
 console.log(`PASS public safety: no secrets, private addresses, home folders or private names in ${files.length} files`);
}
