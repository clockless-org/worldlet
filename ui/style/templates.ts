import {node,facts,notice} from './primitives/components.ts';
// Typed data is optional; original/edited documents always remain the source of truth.
export function detailTemplate(page){
 if(page.localArchive||page.modifiedLocally)return null;
 if(page.uiContent?.type==='agenda'){
  const section=node('section','ui-template');section.dataset.template='agenda';section.append(node('h2','ui-section-title','Today’s plan'),notice('Illustrative schedule · These are not live calendar events.'));
  const list=node('ol','ui-agenda');for(const event of page.uiContent.events){const item=node('li'),body=node('div');body.append(node('strong','',event.title),node('p','',event.preparation));item.append(node('time','',event.time),body);list.append(item);}section.append(list);return {element:section,replaceMarkdown:true};
 }
 if(page.projectStatus){const section=node('section','ui-template');section.dataset.template='project';section.append(facts([['Status',page.projectStatus],['Source',page.provenance?.map(p=>p.provider).join(', ')||'Project']]));return {element:section,replaceMarkdown:false};}
 return null;
}
