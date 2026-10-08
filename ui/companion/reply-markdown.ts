import {replyAction} from './reply-actions.ts';
import {modelMarkdown,uiIcon} from '../components/index.ts';
import DOMPurify from 'dompurify';

export function replyMarkdown(text: string,{resolveLink=(_title: string): string|null=>null,actions=false}: {resolveLink?: (title: string)=>string|null;actions?: boolean}={}){
 const source=text.replace(/\[\[([^\]\n]+)\]\]/g,(original,title)=>{
  const hash=resolveLink(title);return hash?'['+title.replace(/[\\\[\]]/g,'\\$&')+']('+hash+')':original;
 });
 const fragment=DOMPurify.sanitize(modelMarkdown.parse(source,{async:false}),{
  ALLOWED_TAGS:['p','br','strong','em','del','s','a','ul','ol','li','blockquote','code','pre','h1','h2','h3','h4','hr','mark','span','table','thead','tbody','tr','th','td'],
  ALLOWED_ATTR:['href','title','start','data-tone'],ALLOW_DATA_ATTR:false,RETURN_DOM_FRAGMENT:true
 });
 for(const node of fragment.querySelectorAll<HTMLElement>('[data-tone]'))if(!['accent','muted','warning','success'].includes(node.dataset.tone))node.removeAttribute('data-tone');
 for(const a of fragment.querySelectorAll('a')){
  const href=a.getAttribute('href')||'';
  if(actions&&replyAction(href)){a.classList.add('fox-inline-action');a.insertAdjacentHTML('afterbegin',uiIcon('spark'));continue;}
  if(href.startsWith('#')){
   const hash=resolveLink(href);if(hash){a.setAttribute('href',hash);continue;}
  }else{try{const url=new URL(href);if(url.protocol==='https:'&&!url.username&&!url.password){a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';continue;}}catch{}}
  a.replaceWith(...a.childNodes);
 }
 return fragment;
}
