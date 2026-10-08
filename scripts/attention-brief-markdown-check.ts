// Bold in an Attention brief is bold, not asterisks (owner report 2026-10-04): the model writes `**` right against
// Chinese text and punctuation, where CommonMark leaves it literal. The card and Fox's replies share the parser
// (ui/components/markdown.ts); both still render only safe inline formatting.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {bundleScript} from './browser-test.ts';
const bundle=await bundleScript({stdin:{contents:`import {mountAttentionPreview} from './ui/attention/attention-preview.ts';import {replyMarkdown} from './ui/companion/reply-markdown.ts';window.mount=mountAttentionPreview;window.replyMarkdown=replyMarkdown;`,resolveDir:process.cwd(),loader:'ts'}});
const browser=await chromium.launch({args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.setContent('<main id="root"></main>');await page.addScriptTag({content:bundle});
 const summary=[
  '请在**周五（10月9日）**前回复 Sam。',
  '- **时间：**10月5日下午',
  '- **“绿卡”**更新了，*注意*：需要带 `I-797`',
  '- Pay **$120** by **Friday**.',
  '- **Due: **Friday',
  'Keep `a**b**c`, \\*\\*escaped\\*\\* and 2 * 3 * 4 as written. **unclosed',
  '<img src=x onerror="window.injected=1"> **<script>window.injected=1</script>bold** [link](javascript:window.injected=1)',
 ].join('\n');
 const card=await page.evaluate(summary=>{
  const w=window as any;w.preview=w.mount({root:document.querySelector('#root'),onClose(){},onOriginal(){},onLink(){}});
  w.preview.open({title:'Reply to Sam',worldItemKind:'task',worldItemId:'fixture',worldItemSignal:{summary}});
  const body=document.querySelector('.attention-preview-summary');
  return {strong:[...body.querySelectorAll('strong')].map(n=>n.textContent),em:[...body.querySelectorAll('em')].map(n=>n.textContent),
   code:[...body.querySelectorAll('code')].map(n=>n.textContent),text:body.textContent,html:body.innerHTML,links:body.querySelectorAll('a').length};
 },summary);
 assert.deepEqual(card.strong,['周五（10月9日）','时间：','“绿卡”','$120','Friday','Due: ','bold'],'every bold span in the brief renders bold');
 assert.deepEqual(card.em,['注意']);assert.deepEqual(card.code,['I-797','a**b**c']);
 assert.match(card.text,/\*\*escaped\*\*/);assert.match(card.text,/2 \* 3 \* 4/);assert.match(card.text,/\*\*unclosed/);
 assert.doesNotMatch(card.text.replace(/a\*\*b\*\*c|\*\*escaped\*\*|\*\*unclosed/g,''),/\*\*/,'no other literal asterisks remain');
 assert.doesNotMatch(card.html,/<img|<script|onerror|javascript:/i,'the brief never renders HTML or script links');
 assert.equal(card.links,0);
 const reply=await page.evaluate(()=>{const div=document.createElement('div');div.append((window as any).replyMarkdown('好的，**明天上午10点**见。<img src=x onerror="window.injected=1">'));return {strong:[...div.querySelectorAll('strong')].map(n=>n.textContent),html:div.innerHTML};});
 assert.deepEqual(reply.strong,['明天上午10点'],'Fox replies share the same bold');
 assert.doesNotMatch(reply.html,/<img|onerror/i);
 assert.equal(await page.evaluate(()=>(window as any).injected),undefined);
 console.log('PASS Attention brief and Fox reply bold against Chinese text and punctuation, literal asterisks kept, no HTML');
}finally{await browser.close();}
