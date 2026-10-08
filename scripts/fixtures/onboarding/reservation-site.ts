// Isolated, fictional merchant for onboarding acceptance. Never deployed.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
export async function reservationSite(directory:string){
 await mkdir(directory,{recursive:true});
 const file=path.join(directory,'reservation.json');
 let record={id:'workshop-42',status:'reserved',reference:null as string|null,submissions:0};
 try{record=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 let pending=Promise.resolve();
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url!,'http://localhost');
  res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/api/reservation'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(record));return;}
  if(url.pathname==='/api/confirm'&&req.method==='POST'){
   pending=pending.then(async()=>{if(record.status!=='confirmed'){const next={...record,status:'confirmed',reference:'RSVP-0042',submissions:record.submissions+1};await writeFile(file,JSON.stringify(next));record=next;}});
   try{await pending;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(record));}catch{res.statusCode=500;res.end('Could not save response');}return;
  }
  if(url.pathname!=='/reservation/workshop-42'||req.method!=='GET'){res.statusCode=404;res.end('Not found');return;}
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Community Studio · Workshop</title><style>body{background:#f5f1e7;color:#243e35;font:18px system-ui;max-width:640px;margin:10vh auto;padding:32px}h1{font-size:32px}button{background:#315a45;color:white;border:0;border-radius:12px;padding:14px 24px;font:inherit}small{color:#657468}</style><small>Worldlet local rehearsal · fictional reservation</small><h1>Your sketching workshop</h1><p>Your reserved place is free. No payment, account or additional permission is needed.</p><section id="result" aria-live="polite"></section><button id="confirm">Confirm attendance</button><script>
const result=document.querySelector('#result'),button=document.querySelector('#confirm');
function render(r){if(r.status==='confirmed'){result.textContent='Attendance confirmed. Reference: '+r.reference;button.hidden=true;}else result.textContent='Your place is reserved. Please confirm attendance.';}
fetch('/api/reservation').then(r=>r.json()).then(render);
button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/api/confirm',{method:'POST'});if(!r.ok)throw Error();render(await r.json());}catch{result.textContent='Could not confirm. Try again.';}finally{button.disabled=false;}};
</script></html>`);
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address() as {port:number};
 return {url:`http://127.0.0.1:${address.port}`,close:()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
