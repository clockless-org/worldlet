import {node,facts} from '../components/index.ts';
// The illustration is decorative; all dated facts still come from the saved record.
export function tennisCard(page,renderMarkdown){
 const text=page.markdown||'',field=name=>text.match(new RegExp('^'+name+': (.+)$','m'))?.[1]||'Not specified';
 const card=node('section','tennis-plan');card.setAttribute('aria-label','Tennis outing plan');
 const img=node('img','tennis-plan-art');img.src='assets/tennis-sam.png';img.alt='Two friends playing tennis beside the river on a sunny day';card.append(img);
 const signals=node('div','tennis-plan-signals');
 for(const [title,copy,id] of [['Sam','Back from vacation','sample-tennis-sam'],['Sunny · 22°C','Saturday forecast','sample-tennis-weather'],['Active weekend','A gentle hour fits','sample-tennis-health']]){
  const link=node('a','tennis-plan-signal');link.href='#note='+id;link.append(node('strong','',title),node('span','',copy));signals.append(link);
 }
 card.append(signals,facts([['Saturday',field('Date')],['Time',field('Time')],['Court',field('Court')],['Price',field('Price')]]));
 const status=node('p','tennis-plan-status',text.includes('Booking: confirmed')?'✓ Outing plan saved on this device':'Court available · Ready to review with Fox');card.append(status);
 const details=node('details','tennis-plan-details');details.append(node('summary','','Invitation & source details'),renderMarkdown(text,{title:page.title,path:page.path}));card.append(details);
 return card;
}
