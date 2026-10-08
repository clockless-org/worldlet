// Focus on website pages (core/browser/page-focus.ts) without a host: which pages it applies to, each site's rules, which
// sites may become their article, the person's choice per site, and saved rules that could escape their CSS refused.
import assert from 'node:assert/strict';
import {FOCUS_EVERYWHERE,FOCUS_RULES_REQUEST,focusHost,focusSelector,pageFocusPlan,readSiteFocus,siteFocusFor,siteFocusId,siteFocusRecord} from '../core/browser/index.ts';

for(const bad of ['file:///x','about:blank','chrome://settings','https://localhost/','https://127.0.0.1/','not a url'])assert.equal(pageFocusPlan(bad),null,bad);
assert.equal(focusHost('https://www.NYTimes.com/2026/10/05/a.html'),'nytimes.com','one site, www or not');

const article=pageFocusPlan('https://www.theverge.com/2026/10/5/story')!;
assert.deepEqual([article.on,article.reader,article.host],[true,true,'theverge.com'],'an article site: on by default, its article may show alone');
assert.deepEqual(article.hide,[...FOCUS_EVERYWHERE],'ads and cookie walls hide everywhere');

const youtube=pageFocusPlan('https://m.youtube.com/watch?v=1')!;
assert.ok(youtube.hide.includes('ytd-reel-shelf-renderer')&&youtube.hide.includes('ytd-watch-next-secondary-results-renderer'),'a subdomain gets its site\'s rules');
assert.equal(youtube.reader,false,'an app-style site keeps its page');
for(const url of ['https://mail.google.com/mail/u/0','https://www.notion.so/page','https://github.com/a/b','https://www.xiaohongshu.com/explore','https://meet.google.com/abc'])
 assert.equal(pageFocusPlan(url)!.reader,false,'never an article: '+url);
assert.ok(!pageFocusPlan('https://notyoutube.com/')!.hide.includes('ytd-reel-shelf-renderer'),'only the site and its subdomains');

// The person's choice is per site and kept as a record.
const off=siteFocusRecord(null,'theverge.com',{off:true},1_760_000_000);
assert.deepEqual(off,{id:siteFocusId('theverge.com'),host:'theverge.com',off:true,hide:[],updatedAt:1_760_000_000});
assert.equal(pageFocusPlan('https://theverge.com/other',off)!.on,false,'turned off for the site');
assert.equal(pageFocusPlan('https://example.com/',off)!.on,true,'another site keeps Focus');
assert.deepEqual(readSiteFocus(off),off);
assert.equal(readSiteFocus({...off,id:'focus-other.com'}),null,'the ID names its site');
assert.equal(siteFocusFor([off],'https://www.theverge.com/x')?.host,'theverge.com');
assert.equal(siteFocusRecord(off,'theverge.com',{off:false},2).off,false);

// Rules saved for a site are plain selectors; anything that escapes the rule or hides the whole page is refused.
for(const bad of ['body','html, .x','*','div{color:red}','.a;b','.a</style>','@import url(x)','.a /* x','\\61',' ','x'.repeat(201),42])
 assert.equal(focusSelector(bad),null,String(bad));
assert.equal(focusSelector('  aside.related   .card '),'aside.related .card');
const saved=siteFocusRecord(off,'theverge.com',{hide:['.rail','.rail','body','.newsletter-signup']},3);
assert.deepEqual([saved.off,saved.hide],[true,['.rail','.newsletter-signup']],'saving rules keeps the person\'s choice');
const withRules=pageFocusPlan('https://theverge.com/',{...saved,off:false})!;
assert.ok(withRules.hide.includes('.rail')&&withRules.reader===false,'a site with its own rules keeps its page and hides them');
// The Clean up action beside Fox asks for exactly the two browse_web steps that save a site's rules.
assert.match(FOCUS_RULES_REQUEST,/browse_web outline/);assert.match(FOCUS_RULES_REQUEST,/browse_web focus and hide/);
console.log('PASS page focus: public pages only, ads everywhere, site rules, articles only off app sites, per-site choice kept, unsafe rules refused, Clean up asks for outline then focus.');
