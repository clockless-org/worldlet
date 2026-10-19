// Review source-backed practice data, then commit one local record atomically.
export function tennisDemo({read,save,show,open,onConfirmed=()=>{}}){
 const id='sample-tennis-plan',original=read(id)||'';
 const button=(label,run)=>{const b=document.createElement('button');b.textContent=label;b.onclick=run;return b;};
 const display=(text,actions)=>show({source:'tennis-practice',text,actions,takeover:true});
 if(original.includes('Booking: confirmed')){display('Your tennis plan is saved on this device.',[button('View plan',()=>open(id))]);return;}
 const date=original.match(/^Date: (\d{4}-\d{2}-\d{2})$/m)?.[1];
 if(!date){display('The court time is missing. Please reopen the plan.',[]);return;}
 const body=document.createElement('section');body.className='tennis-evidence';
 const evidence=document.createElement('p');evidence.textContent='Sam is back from vacation · Sunny, 22°C · Easy activity week · Court 2 available';
 const details=document.createElement('p');details.textContent=`Saturday ${date}, 10–11 AM · Riverside Court 2 · $20. Invitation to sam.okafor@example.com.`;
 body.append(evidence,details);
 let confirmed=false;
 const confirm=()=>{
  if(confirmed)return;
  const start=new Date(date+'T10:00:00').toISOString();
  const result=save(id,original+`\n\n## Confirmed outing\nStart: ${start}\nBooking: confirmed (practice)\nCalendar: added (practice)\nInvitation: sent to sam.okafor@example.com (practice)\n`);
  if(!result.ok){display(result.error||'Could not save the plan. Try again.',[button('Try again',confirm)]);return;}
  confirmed=true;onConfirmed();display('Your outing plan is saved on this device. Court and invitation details are ready.',[button('View plan',()=>open(id))]);
 };
 show({source:'tennis-practice',text:'A good Saturday for tennis with Sam. Everything is ready to review.',body,actions:[button('Confirm outing',confirm),button('Not now',()=>display('Kept for later. Nothing changed.',[]))],takeover:true});
}
