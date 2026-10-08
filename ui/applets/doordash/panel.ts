// Lives inside Fox's existing guide; account details never become another panel.
export function createDoorDashApplet({call,ask,onChange}){
 const root=document.createElement('section');root.className='fox-app-options doordash-applet';
 const message=document.createElement('p');message.className='ui-caption';root.append(message);
 const actions=document.createElement('div');actions.className='fox-app-options';root.append(actions);
 const button=(text,fn)=>{const b=document.createElement('button');b.className='module-connect';b.textContent=text;b.onclick=fn;actions.append(b);return b;};
 let busy=false;
 async function run(operation){
  if(busy)return;busy=true;actions.querySelectorAll('button').forEach(b=>b.disabled=true);
  message.textContent=operation==='login'?'Finish signing in with DoorDash in your browser…':'Checking DoorDash…';
  try{const result=await call({operation});if(result.ok===false)throw Error(result.error||'DoorDash could not finish.');await load();onChange?.();}
  catch(error){message.textContent=error.message;actions.querySelectorAll('button').forEach(b=>b.disabled=false);}
  finally{busy=false;}
 }
 async function load(){
  actions.replaceChildren();
  if(!call){message.textContent='A delivery scooter waiting by the bridge. Open your personal Mac world to use the DoorDash CLI.';return;}
  try{
   const result=await call({operation:'status'});if(result.ok===false)throw Error(result.error);
   if(!result.installed){message.textContent='Install the official CLI on this Mac: npm run setup:doordash. DoorDash early-access approval is required.';button('Check again',load);button('Request access',()=>run('waitlist'));return;}
   if(!result.enabled){message.textContent='DoorDash CLI is installed. Sign in with an approved early-access account. DoorDash receives a short food-ordering purpose with requests; your Fox conversation is not forwarded.';button('Sign in to DoorDash',()=>run('login'));button('Request access',()=>run('waitlist'));return;}
   message.textContent='Ask me what you would like to eat. I can find restaurants, prepare your cart and show a quote. Review and pay in DoorDash. Account access is checked when you make a request.';
   button('Find food',()=>ask('Help me find food using DoorDash. Ask what I feel like and which saved delivery address to use before searching.'));
   button('My cart',()=>ask('Show my current DoorDash carts. Do not change them yet.'));
   button('Recent orders',()=>ask('Show my most recent DoorDash orders.'));
   button('Sign in again',()=>run('login'));button('Disconnect',()=>run('disconnect'));
  }catch(error){message.textContent=error.message;button('Try again',load);}
 }
 void load();return root;
}
