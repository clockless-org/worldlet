// Mail sender portraits and reading layout, without a browser or network: which public sources
// may picture a sender (Core), and the reflow/quote rules the reader applies to every original.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mailSenderAddress,mailOrganizationDomain,mailAvatarPlan,gravatarURL,mailIconURL,bimiLogoURL,mailLogoURL,mailRemoteHostAllowed} from '../core/applets/index.ts';
import {readableMail,splitQuoted} from '../ui/applets/gmail/focus.ts';

assert.equal(mailSenderAddress('Alice Chen <Alice.Chen@Acme.io>'),'alice.chen@acme.io');
assert.equal(mailSenderAddress('"Bob" bob@x.io'),'');
assert.equal(mailSenderAddress('Sender unavailable'),'');
assert.equal(mailOrganizationDomain('mail.github.com'),'github.com');
assert.equal(mailOrganizationDomain('news.bbc.co.uk'),'bbc.co.uk');
assert.equal(mailOrganizationDomain('bounce.e.taobao.com.cn'),'taobao.com.cn');
assert.deepEqual(mailAvatarPlan('PayPal <service@mail.paypal.com>'),{address:'service@mail.paypal.com',domain:'mail.paypal.com',gravatar:true,bimi:['mail.paypal.com','paypal.com'],icon:'paypal.com'});
// A personal mailbox's provider logo is not the sender: Gravatar or initials only.
assert.deepEqual(mailAvatarPlan('Kelvin <someone@gmail.com>'),{address:'someone@gmail.com',domain:'gmail.com',gravatar:true,bimi:[],icon:''});
assert.equal(mailAvatarPlan('Alice <alice@example.com>'),null,'fixtures are never looked up');
assert.equal(mailAvatarPlan('robot@build.test'),null);
assert.equal(gravatarURL('a'.repeat(64)),'https://gravatar.com/avatar/'+'a'.repeat(64)+'?s=160&d=404');
assert.throws(()=>gravatarURL('../x'));
assert.equal(mailIconURL('github.com'),'https://www.google.com/s2/favicons?domain=github.com&sz=128');
assert.throws(()=>mailIconURL('a/b?c'));
assert.equal(bimiLogoURL('v=BIMI1; l=https://brand.example/logo.svg; a=https://brand.example/vmc.pem'),'https://brand.example/logo.svg');
assert.equal(bimiLogoURL('v=BIMI1; l=http://brand.example/logo.svg'),'');
assert.equal(bimiLogoURL('v=BIMI1; l=https://brand.example/logo.png'),'');
assert.equal(bimiLogoURL('v=spf1 include:_spf.example'),'');
// The BIMI logo is chosen by the sender: the main process never reads an IP literal, localhost or local-network name.
for(const logo of ['https://127.0.0.1/logo.svg','https://10.0.0.5/logo.svg','https://[::1]/logo.svg','https://[fe80::1]/logo.svg','https://0x7f.1/logo.svg','https://2130706433/logo.svg',
 'https://169.254.169.254/latest/logo.svg','https://localhost/logo.svg','https://printer.local/logo.svg','https://admin.corp.internal/logo.svg','https://router.lan/logo.svg','https://intranet/logo.svg',
 'https://brand.com:8443/logo.svg','https://user@brand.com/logo.svg'])assert.equal(bimiLogoURL('v=BIMI1; l='+logo),'',logo);
assert.equal(bimiLogoURL('v=BIMI1; l=https://amplify.valimail.com/bimi/paypal/logo.svg'),'https://amplify.valimail.com/bimi/paypal/logo.svg','ordinary public hosts are unchanged');
assert.equal(mailLogoURL('https://cdn.brand.com/a/logo.svg'),'https://cdn.brand.com/a/logo.svg');assert.equal(mailLogoURL('https://192.168.1.1/logo.svg'),'');
assert.equal(mailRemoteHostAllowed('brand.com'),true);assert.equal(mailRemoteHostAllowed('brand.com.'),true);
for(const host of ['','1.2.3.4','::1','[::1]','localhost','a.localhost','x.local','x.internal','single','1e100.0x1'])assert.equal(mailRemoteHostAllowed(host),false,host);
// The host follows a BIMI logo's redirects itself, and only to URLs Core still allows.
{
 const host=readFileSync(new URL('../platform/electron/src/modules/sources/mail-avatar.ts',import.meta.url),'utf8');
 assert.match(host,/redirect:senderChosen\?'manual':'follow'/);assert.match(host,/allowed=typeof senderChosen==='function'\?senderChosen:mailLogoURL;/);assert.match(host,/allowed\(new URL\(response\.headers\.get\('location'\)/);assert.match(host,/readImage\(url,32_768,0,true\)/);
}
console.log('PASS sender portrait sources: Gravatar, organization BIMI/icon, personal domains and fixtures');

const plain='Hi Kelvin,\nYour order\nhas shipped.͏ ‌ ͏\n\n[image: Acme]\n\nTrack it: https://click.acme.example/ls/click?upn='+'a'.repeat(60)+'\n\nSee <https://acme.example/help>.\n\n----------\nAlready [Help](<https://acme.example/a/b>)';
const read=readableMail(plain);
assert.ok(read.startsWith('Hi Kelvin, Your order has shipped.\n\n'),'soft wraps reflow, invisible padding is removed');
assert.ok(!read.includes('[image:')&&!/[͏‌]/.test(read));
assert.ok(read.includes('[click.acme.example/…](<https://click.acme.example/ls/click?upn='+'a'.repeat(60)+'>)'),'a long URL reads as its site and keeps its target');
assert.ok(read.includes('[acme.example/help](<https://acme.example/help>)'),'a short URL stays as written');
assert.ok(read.includes('\n\n---\n\n')&&read.includes('[Help](<https://acme.example/a/b>)'),'rules become separators; labelled links are untouched');
assert.equal(readableMail('Hello Kelvin,\nThe draft is ready.\n\n- First\n- Second'),'Hello Kelvin, The draft is ready.\n\n- First\n- Second');
const reply=splitQuoted('Sounds good.\n\nOn Mon, Sep 29, 2026 at 10:00 AM Kelvin <k@x.test> wrote:\n\n> Can we meet?\n>\n> K');
assert.equal(reply.main,'Sounds good.');assert.ok(reply.quoted.startsWith('On Mon')&&reply.quoted.endsWith('> K'));
assert.equal(splitQuoted('好的。\n\n在 2026年9月29日 10:00，Kelvin <k@x.test> 写道：\n\n> 周二见？').main,'好的。');
assert.equal(splitQuoted('Thanks!\n\n---\n\nFrom: Kelvin\nSent: Monday\n\nOld text').main,'Thanks!');
assert.deepEqual(splitQuoted('> only a quote'),{main:'> only a quote',quoted:''},'a message that is only a quote stays open');
assert.equal(splitQuoted('I wrote:\n> point one\n\nMy answer.').quoted,'','inline quotes followed by an answer are not folded');
console.log('PASS Mail reading: reflow, invisible padding, link labels, separators and folded quoted replies');
