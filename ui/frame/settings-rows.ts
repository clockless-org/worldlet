import {uiIcon} from '../style/index.ts';
import {agentEl as el} from './agent-change.ts';

/** What a Settings row or list item shows on its left: a line icon (ui/style/primitives/icons.ts), a service's logo,
 * or a first letter when an Agent has no logo of its own. */
export type SettingsIcon={icon:string}|{logo:string}|{letter:string};

/** The icon on the left of a Settings row or list item, so a person finds a setting by its picture (owner request
 * 2026-10-21: icons make Settings clear at a glance). */
export function settingsIcon(icon:SettingsIcon,size=18){
 const box=el('span','companion-settings-icon');box.setAttribute('aria-hidden','true');
 if('logo' in icon){const img=document.createElement('img');img.src=icon.logo;img.alt='';box.append(img);}
 else if('letter' in icon){box.classList.add('is-letter');box.textContent=icon.letter.slice(0,1).toUpperCase();}
 // uiIcon is a fixed set of SVG strings from this repository, never outside text.
 else box.innerHTML=uiIcon(icon.icon).replace(/width="18" height="18"/,`width="${size}" height="${size}"`);
 return box;
}

/** One Settings row: an icon, a title, one plain line and the row's controls on the right. */
export function settingsRow({icon,title,line='',controls=[],setting=''}:{icon:SettingsIcon;title:string|Node;line?:string|Node;controls?:Node[];setting?:string}){
 const row=el('div','companion-settings-row has-icon'),words=el('div');if(setting)row.dataset.setting=setting;
 words.append(typeof title==='string'?el('strong','',title):title);
 if(line)words.append(typeof line==='string'?el('span','',line):line);
 row.append(settingsIcon(icon),words,...controls);
 return row;
}

/** An on/off switch for a Settings row. `change` gets the new value; the switch shows it once `change` finishes,
 * unless it returns false (it could not change, and says why itself). */
export function settingsSwitch({label,on,change,id=''}:{label:string;on:boolean;change:(on:boolean)=>Promise<boolean|void>|boolean|void;id?:string}){
 const b=el('button','companion-settings-switch') as HTMLButtonElement;b.type='button';b.setAttribute('role','switch');b.setAttribute('aria-label',label);
 if(id)b.dataset.action=id;
 const show=(value:boolean)=>{b.setAttribute('aria-checked',String(value));b.dataset.on=String(value);};
 show(on);
 b.onclick=async()=>{
  if(b.disabled)return;const next=b.getAttribute('aria-checked')!=='true';b.disabled=true;
  try{if(await change(next)!==false)show(next);}finally{if(b.isConnected)b.disabled=false;}
 };
 return b;
}
