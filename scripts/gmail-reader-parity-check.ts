// The World's own Gmail reader (core/accounts/google/gmail.ts) is a port of the Hermes one (harness/hermes/gmail_reader.py).
// Both read the same mail here, Python's through a googleapiclient-like fake and the port's through a GoogleRest fake over
// one mailbox, and must answer identically: Markdown text, pictures, excerpts, pages, discovery, call order and errors.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GoogleRestError,MailText,compactMessage,contentImage,discover,htmlUnescape,jsonSize,readPage,tidyMail,type GoogleRest} from '../core/accounts/index.ts';
import {HTML5_ENTITIES} from '../core/accounts/google/html-entities.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
/** The port reads mail as current CPython does. Python's HTMLParser changed in patch releases (2025: HTML5 comments
 * such as `<!-->` and references without `;` in attribute values), so an older one (Ubuntu 24.04's 3.12.3) answers
 * differently: compare with the first Python here that has those changes, from PATH, the Windows launcher (`py`, where
 * `python3` is often another install) or the CI runner's tool cache. The error names each Python tried and its answer. */
function referencePython():string[] {
 const probe='from html.parser import HTMLParser as P\nclass H(P):\n def __init__(s):super().__init__();s.out=[]\n def handle_data(s,d):s.out.append(d)\n def handle_starttag(s,t,a):s.out.extend(v or "" for _,v in a)\nimport sys\nh=H();h.feed(\'C<!-->D<!--->E<a href="?a&copy=1">\');h.close();print("|".join(h.out));print(sys.version.split()[0])';
 const cache='/opt/hostedtoolcache/Python';
 const cached=fs.existsSync(cache)?fs.readdirSync(cache).filter(v=>/^3\.\d+\.\d+$/.test(v)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true})).map(v=>path.join(cache,v,'x64','bin','python3')):[];
 const launcher=process.platform==='win32'?['-3.15','-3.14','-3.13','-3'].map(version=>['py',version]).concat([['python']]):[];
 const tried:string[]=[];
 for(const [command,...prefix] of [['python3'],['python3.14'],['python3.13'],...launcher,...cached.map(file=>[file])]){
  try{
   const [answer,version]=execFileSync(command,[...prefix,'-I','-c',probe],{encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true}).trim().split(/\r?\n/);
   if(answer==='C|D|E|?a&copy=1')return [command,...prefix];
   tried.push(`${[command,...prefix].join(' ')} ${version}: ${answer}`);
  }catch{}
 }
 throw new Error('Gmail reader parity needs a Python whose html.parser has the 2025 HTML5 changes (3.13.6 or newer, or a patched 3.12); found '+(tried.join('; ')||'none')+'.');
}
const b64=(text:string|Uint8Array)=>Buffer.from(text).toString('base64url');

// Real-world shapes, fictional content.
const HTML:[string,string][]=[
 ['paragraphs and entities','<p>Hi Alex,</p><p>Your order&nbsp;#1042 shipped &amp; arrives Friday&#8217;s evening. &copy 2026 Example&nbsp;Shop &#x27;quoted&#x27;</p>'],
 ['newsletter layout','<!DOCTYPE html><html><head><title>Weekly</title><style>.x{color:red}</style><meta charset="utf-8"></head><body><div style="display:none;max-height:0;overflow:hidden">Preheader you never see</div><table role="presentation"><tr><td><img src="https://cdn.example.com/logo.png" alt="Logo" width="120"></td><td>Issue 12</td></tr><tr><td colspan=2><img src="https://cdn.example.com/stories/hero-spring.jpg" width="600" alt="A field of tulips under a bright spring sky"><h1>Spring is here</h1><p>Read the <a href="https://news.example.com/spring?utm=1&amp;x=2">full story</a>.</p></td></tr></table><img src="https://track.example.com/open.gif" width="1" height="1" alt=""></body></html>'],
 ['unclosed tags','<p>One<p>Two<div>Three<b>bold that never closes<p>Four</div>after'],
 ['void tags','Line one<br>Line two<br/>Line three<hr>Rule<input type=text value=x><wbr>tail</br><img src="https://example.com/a.png"/>end'],
 ['nested replies','<div>Sounds good.</div><div class="gmail_quote">On Mon, Sam wrote:<blockquote class="gmail_quote">Can we meet Tuesday?<blockquote>Earlier: <p>first</p><p></p><p>second</p></blockquote></blockquote></div>'],
 ['links','<a href="https://example.com/a">Plain</a> <a href="mailto:alex@example.com">Mail Alex</a> <a href="javascript:void(0)">JS</a> <a href="/relative">Rel</a> <a href>Valueless</a> <a href="https://example.com/x>y">Label [1] with ] bracket</a> <a href="http://example.org"><img src="https://example.org/btn.png" alt="Go"></a> <a href="https://example.com/e"></a>'],
 ['bold rules','<b> spaced </b>|<strong></strong>|<b>a<p>b</p></b>|<b><a href="https://example.com">linked</a></b>|<a href="https://example.com"><b>Shop</b></a>|<b>x</b><b>y</b>|<strong>  </strong>'],
 ['headings and lists','<h1>Title</h1><h2>Sub</h2><h3>Third</h3><h4>Fourth</h4><h5>Fifth</h5><h6>Sixth</h6><ul><li>One</li><li></li><li> </li><li>Three</li></ul><ol><li>First<li>Second</ol><dl><dt>Term<dd>Definition</dl>'],
 ['raw text elements','<style>p{x:1}</style ><script>if(a<b){document.write("</scr"+"ipt>")}</script>Visible<script type="text/javascript">var s="<p>no</p>";</script> after'],
 ['concealed variants','<div style="mso-hide:all">mso</div><div style="max-height:0px;overflow:hidden">clip</div><div style="MAX-HEIGHT: 0; OVERFLOW: HIDDEN">upper</div><span hidden>valueless hidden stays</span><span hidden="">empty hidden goes</span><span aria-hidden="true" style="font-size:0">zero</span><span aria-hidden="true">aria only stays</span><div style="display: none">spaced none</div>shown'],
 ['comments and declarations','<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0">A<!-- note -->B<!---->C<!-->D<!--->E<!--[if mso]><p>MSO only</p><![endif]-->F<?xml version="1.0"?>G<![CDATA[ cdata ]]>H</ p>I</>J<!bogus>K'],
 ['character references','&#0;|&#128;|&#x110000;|&#xD800;|&#65|&#x42|&notin;|&notit;|&ampx|&amp;|&#;|a < b|AT&T|&lt;tag&gt;|&zwnj;x&#8203;y|&shy;|&nbsp;&nbsp;z|&Aacute;&aacute|&frac12;|&#x1F600;|&#9;tab'],
 ['attribute references','<a href="https://example.com/?a=1&amp;b=2&copy=3&ampx=4&lt=5&#38;c=6">refs</a><img src="https://cdn.example.com/hero.jpg?x=1&amp;y=2" width="600" alt="Sunset &amp; sea &mdash; a long caption">'],
 ['unicode','<p>こんにちは、世界</p><p>Emoji 😀🎉 and RTL ‏mark‮, ZWJ ‍, BOM ﻿, ideographic　space</p><p>İstanbul ı ſ K</p>'],
 ['rawtext and rcdata','<iframe>&amp; <b>not tags</b></iframe><xmp><i>shown raw</i> &lt;</xmp><noembed>n &amp;</noembed><noframes>f</noframes><textarea>Ta &amp; <b>x</b></textarea><title>T &amp;</title>after'],
 ['attribute syntax','<DIV STYLE="DISPLAY:NONE">upper hidden</DIV><div style="color:red" style="display:none">dup later wins</div><a href=https://example.com/unquoted>unq</a><a href=\'https://example.com/single\'>single</a><a href="https://example.com/q"title="t">nospace</a><img src=https://cdn.example.com/picture.jpg/><p class=a/b>slash</p>'],
 ['images','<img src="https://cdn.example.com/social/facebook.png" width="600"><img src="https://cdn.example.com/avatar-sam.jpg" width="600"><img src="https://cdn.example.com/banner.jpg" style="width:640px;height:300px" alt="Summer sale banner"><img src="https://cdn.example.com/p.jpg" width="300px" height="100"><img src="http://cdn.example.com/insecure.jpg" width="600"><img src=" https://cdn.example.com/a b.jpg " width="600"><img src="https://cdn.example.com/small.jpg" width="200"><img src="https://cdn.example.com/unsized.jpg"><img src="https://logos.example.com/x.jpg" width="600"><img src="https://cdn.example.com/tracking123.gif"><img src="https://cdn.example.com/photo.jpg" width="٣٠٠" alt="Arabic-Indic width digits here">'],
 ['many images','<img src="https://cdn.example.com/1.jpg" width="600"><img src="https://cdn.example.com/2.jpg" width="600"><img src="https://cdn.example.com/3.jpg" width="600"><img src="https://cdn.example.com/4.jpg" width="600"><img src="https://cdn.example.com/5.jpg" width="600"><img src="https://cdn.example.com/6.jpg" width="600"><img src="https://cdn.example.com/7.jpg" width="600"><img src="https://cdn.example.com/8.jpg" width="600"><img src="https://cdn.example.com/9.jpg" width="600"><img src="https://cdn.example.com/10.jpg" width="600">'],
 ['alt rules','<img src="x.png" alt="Logo"><img src="x.png" alt="logo-2x"><img src="x.png" alt="Image 1"><img src="x.png" alt="spacer.gif"><img src="x.png" alt="A short alt"><img src="x.png" alt="This alt is a full sentence"><img src="x.png" alt="One two three four" width="1"><img src="x.png" alt="Logo of the Example Shop company"><img src="x.png" alt="LOGİ"><a href="https://example.com"><img alt="Go"></a><a href="https://example.com"><img alt="Banner"></a>'],
 ['receipt table','<table><tr><th>Item</th><th>Qty</th><th>Price</th></tr><tr><td>Tea</td><td>2</td><td>$4.00</td></tr><tr><td>Total</td><td></td><td><strong>$8.00</strong></td></tr></table>'],
 ['empty and whitespace','   \n\t  <div> </div><p> </p>'],
 ['pre and blocks','<pre>  code   line\n  second</pre><center>Centered</center><address>1 Example Road</address><section><article><header>Head</header><footer>Foot</footer></article></section>'],
 ['unclosed link','<p>Read <a href="https://example.com/more">more <b>here</p><p>next paragraph'],
 ['stars in labels','<a href="https://example.com/s">**Sale**</a> <a href="https://example.com/t">  * spaced *  </a> *bare* text'],
 ['empty list items','<ul><li>-</li><li>Real</li><li>  -  </li></ul>-\n- x'],
 ['deep quotes','<blockquote><blockquote><blockquote>three</blockquote>two<br><br><br>gap</blockquote></blockquote><blockquote></blockquote>'],
 ['malformed','<div<p>x</div> <p =x>y</p> <a href=\'https://example.com/x>y\'>z</a> <<b>>w</b>> <div class="a" / > slash <br / >'],
 ['eof incomplete tag','text before <div class="x'],
 ['eof end tag','text </'],
 ['eof comment','text <!-- never closed'],
 ['eof lone lt','trailing <'],
 ['eof ampersand','fish &amp chips &am'],
 ['crlf','<p>Line\r\none</p>\r\n<p>two\r\n\r\n\r\nthree</p>\ttabs\t\tand'],
 ['hidden internals','<div style="display:none"><a href="https://example.com/h">hidden link</a><img src="https://cdn.example.com/hidden.jpg" width="600" alt="A hidden picture with words"><br><b>b</b></div><span>visible</span></span></div></p>'],
 ['head never closed','<head><meta name="x"><p>All of this is inside head</p>'],
 ['outer close ends hidden child','<div>Keep<span style="display:none">hide<b>bold</div>after div'],
 ['plaintext','before<plaintext><b>raw &amp; all</b></plaintext>'],
 ['template','<template><p>inert</p></template>shown<template>open'],
 ['forwarded','<div>FYI</div><div class="gmail_quote"><div dir="ltr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername">Sam</strong> <span>&lt;<a href="mailto:sam@example.com">sam@example.com</a>&gt;</span><br>Date: Tue<br>Subject: Plans<br></div><br><div>Let us go.</div></div>'],
 ['unsized picture only','<img src="https://cdn.example.com/only.jpg" alt="The product photo"><p>Caption</p>'],
 ['raw text ends in any case','<SCRIPT>var a="</scriptx>";</SCRIPT>after<Style>p{}</sTyLe >more<TITLE>t &amp;</Title>end<XMP>x</xmp/>done'],
 ['dotted and dotless i','<a href="https://example.com/a"><img alt="İMAGE 2"></a> <a href="https://example.com/b"><img alt="Lınk"></a><img src="https://cdn.example.com/İcon.png" width="600"><img src="https://cdn.example.com/hero.jpg" width="600" alt="Our Lınkedin page"><img src="https://cdn.example.com/second.jpg" width="600" alt="The second picture">'],
 ['upper tags and odd names','<P>para</P><B>bold</B><Custom-Tag data-x=1>custom</Custom-Tag><constructor>proto</constructor><toString>t</toString>'],
];

// A seeded fuzzer over the same vocabulary: tags, attribute spellings, references, comments and broken tails.
let seed=0x2545f491;
const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const pick=<T,>(list:readonly T[])=>list[Math.floor(rand()*list.length)];
const TAGS=['p','div','span','b','strong','a','a','img','img','br','hr','blockquote','li','ul','ol','td','tr','table','h1','h3','h5','pre','style','script','title','head','template','iframe','textarea','xmp','center','i','em','font','section','dd'];
const ATTRS=['style="display:none"','style="DISPLAY: none"','style="max-height:0;overflow:hidden"','style="mso-hide:all"','style="font-size:0"','style="width:600px"','style="color:red"','hidden','hidden=""','aria-hidden="true"','href="https://example.com/a?b=1&amp;c=2"','href="mailto:alex@example.com"','href="javascript:void(0)"','href=""','href','href=\'http://example.org/x>y\'','href=https://example.net/u','src="https://cdn.example.com/hero.jpg"','src="https://cdn.example.com/logo.png"','src="https://cdn.example.com/facebook-icon.png"','src="http://cdn.example.com/a.jpg"','src="https://cdn.example.com/a b.png"','src="https://track.example.com/open.gif"','width="0"','width="1"','width=600','width="300px"','width="٣٠٠"','height="1"','height="200"','alt="Logo"','alt="logo2x"','alt="A sunny beach at dawn with palms"','alt="Shop now"','alt=""','alt=" x "','alt="Image 1"','alt=\'It&#39;s a long one here\'','class="x"/','data-a=1data-b=2','title="a > b"'];
const TEXT=['Hello',' ','\n\n','\t','&amp;','&nbsp;','&copy','&#8217;','&#x1F600;','&notit;','&#0;','&#128;','a < b','&','***',']','[','こんにちは','😀','​','­','&zwnj;','\r\n','-','>','\x0c',' ','İ','ı','Sam wrote:','  -  ','x*y','&#x0d;','&#99999999999;'];
const MARKUP=['<!-- c -->','<!---->','<!-->','<!--[if mso]><p>x</p><![endif]-->','<!DOCTYPE html>','<?xml version="1.0"?>','<![CDATA[ d ]]>','</>','</ p>','<!x>','<b/>','<div/>','<br/>','</a>','</b>','</div>','</blockquote>','</p>','</li>','</span>','</style>','</script >','</title>','</textarea>','</iframe>','</xmp>'];
const TAILS=['','','','<','</','<div','<a href="x','<!-- open','&am','<img src="https://cdn.example.com/x.jpg"','<![CDATA[ open','<!DOCTYPE'];
function fuzzHtml(){
 let html='';
 for(let n=5+Math.floor(rand()*55);n>0;n--){
  const r=rand();
  if(r<0.35){const tag=pick(TAGS),attrs=Array.from({length:Math.floor(rand()*3)},()=>pick(ATTRS));html+='<'+(rand()<0.1?tag.toUpperCase():tag)+(attrs.length?' '+attrs.join(rand()<0.8?' ':''):'')+(rand()<0.05?' /':'')+'>';}
  else if(r<0.7)html+=pick(TEXT);
  else html+=pick(MARKUP);
 }
 return html+pick(TAILS);
}
const html=[...HTML.map(([,source])=>source),...Array.from({length:500},fuzzHtml)];

// Messages for compact_message: alternatives, nesting, attachments, encodings, header budgets and byte limits.
const header=(name:string,value:unknown)=>({name,value});
const headers=[header('Subject','Plans for Tuesday'),header('From','Sam <sam@example.com>'),header('To','Alex <alex@example.com>'),header('Date','Tue, 6 Oct 2026 09:00:00 +0000'),header('X-Spam','no'),header('Message-ID','<m1@example.com>')];
const cjk='会议安排确认'.repeat(200),emoji='🎉✓ä'.repeat(300);
const nest=(depth:number):any=>depth?{mimeType:'multipart/mixed',parts:[nest(depth-1)]}:{mimeType:'text/plain',body:{data:b64('deep')}};
const MESSAGES:any[]=[
 {id:'a1',threadId:'t1',labelIds:['INBOX','UNREAD'],snippet:'Plans',internalDate:'1791277200000',historyId:'9',sizeEstimate:1200,payload:{mimeType:'multipart/alternative',headers,parts:[{mimeType:'text/plain',body:{data:b64('Plain https://track.example.com/x')}},{mimeType:'text/html',body:{data:b64(HTML[1][1])}}]}},
 {id:'a2',snippet:'only plain',payload:{mimeType:'text/plain',headers:[],body:{data:b64('Just plain text\r\nwith CRLF')}}},
 {id:'a3',snippet:'snippet only '+'é'.repeat(1200),payload:{mimeType:'multipart/mixed',headers:[]}},
 {id:'a4',payload:{mimeType:'multipart/mixed',parts:Array.from({length:35},(_,i)=>({filename:'report-'+i+'-'+'x'.repeat(300)+'.pdf',mimeType:'application/pdf',body:{size:i*10,attachmentId:'att'+i}}))}},
 {id:'a5',payload:nest(25)},
 {id:'a6',payload:nest(19)},
 {id:'a7',payload:{mimeType:'text/plain',body:{data:Buffer.from('Padded body text').toString('base64')}}},
 {id:'a8',payload:{mimeType:'text/plain',body:{data:'SGVsbG8*gd29y!bGQ'}}},
 {id:'a9',payload:{mimeType:'text/plain',body:{data:'SGVsbG8gd29ybGQ=extra'}}},
 {id:'a10',payload:{mimeType:'text/plain',body:{data:'SGVsbG8gd29ybGQh1'}}},
 {id:'a11',payload:{mimeType:'text/plain',body:{data:'SGVsébG8'}}},
 {id:'a12',payload:{mimeType:'text/plain',body:{data:b64(new Uint8Array([0xef,0xbb,0xbf,0x41,0xff,0xc3,0x28,0xe2,0x82,0xed,0xa0,0x80,0xf0,0x9f,0x98,0x80,0x42]))}}},
 {id:'a13',payload:{mimeType:'text/plain',headers:[header('Subject',cjk),header('From','名前 <a@example.com>'),header('To',emoji),header('Cc','x'.repeat(900)),header('References','<r@example.com>'),header('In-Reply-To',5),header('Date',true),header('date',null)],body:{data:b64(cjk)}}},
 {id:'a14',payload:{mimeType:'text/plain',headers:Array.from({length:20},(_,i)=>header(i%2?'To':'Subject','value '+i)),body:{data:b64(emoji)}}},
 {id:'a15',payload:{mimeType:'multipart/alternative',parts:[{mimeType:'text/html',body:{data:b64('<div style="display:none">x</div>')}},{mimeType:'text/plain',body:{data:b64('fallback plain')}}]}},
 {id:'a16',payload:{mimeType:'multipart/mixed',parts:[{mimeType:'text/html',body:{data:b64(HTML[16][1])}},{mimeType:'text/html',body:{data:b64(HTML[39][1])}}]}},
 {id:'a17',payload:{mimeType:'text/plain',body:{data:'',size:0}},snippet:''},
 ...['QQ==Q','QQ==QUI=','QQ==QQ==','Q=Q==','QUI=QUI=','=QQ==','QQ===QQ==','QUI=QQ'].map((data,i)=>({id:'pad'+i,payload:{mimeType:'text/plain',body:{data}}})),
 {id:'a18',payload:{mimeType:'text/plain',filename:'',body:{data:b64('empty filename is no attachment')}}},
];
const LIMITS=[24000,null,100,1,7,11,0,2001];
const compact:[any,number|null][]=MESSAGES.flatMap(m=>LIMITS.map(limit=>[m,limit] as [any,number|null]));
// Lenient base64 and invalid UTF-8, fuzzed.
const B64CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/-_=*. \n';
for(let n=0;n<300;n++){
 const bytes=Uint8Array.from({length:Math.floor(rand()*40)},()=>rand()<0.6?0x20+Math.floor(rand()*90):Math.floor(rand()*256));
 let data=rand()<0.5?b64(bytes):Array.from({length:Math.floor(rand()*30)},()=>pick([...B64CHARS])).join('');
 if(rand()<0.3)data=data.slice(0,Math.floor(rand()*data.length))+pick(['=','==','*','\n','-',' '])+data.slice(Math.floor(rand()*data.length));
 compact.push([{id:'f'+n,payload:{mimeType:'text/plain',body:{data}}},pick([24000,null,1,2,3,4,5,9])]);
 // Padding anywhere: binascii skips it and only lets it finish a final group.
 compact.push([{id:'p'+n,payload:{mimeType:'text/plain',body:{data:Array.from({length:1+Math.floor(rand()*12)},()=>pick([...'QUJD8_-==='])).join('')}}},null]);
}
const tidy=['\x02a\n\n\nb\x03','x\x02\x02inner\x03\n\nouter\x03','- \n-\n--\n- item','\n>\n>\n>\n','a  b\r\nc','\x02unclosed','closed\x03','- x\n- ','  \t  lead','\x02\x02\x03\x03'];
const unescapes=[...TEXT,'&ampamp;','&AMP','&notinva;','&#X41;','&#00065;','&'+'a'.repeat(40)+';','&#xFFFE;','&#x10FFFF;','&#11;','&#13;','&lt&gt','&ThickSpace;','&NotEqualTilde;','&acE;'];
const images=[{src:'https://cdn.example.com/hero.jpg',width:'600'},{src:'https://cdn.example.com/hero.jpg',style:'height:100px'},{src:'https://cdn.example.com/hero.jpg',width:'0'},{src:'https://cdn.example.com/hero.jpg',width:' 300 px'},{src:'https://cdn.example.com/hero.jpg',width:'300\n'},{src:'https://cdn.example.com/hero.jpg',alt:'x'.repeat(250)+'😀'.repeat(10)},{src:'https://instagram.example.com/p.jpg'},{src:'https://cdn.example.com/dir/app-store.png'},{src:'https://cdn.example.com/dir/googleplay2x.png'},{src:'https://cdn.example.com/a.jpg#icon'},{src:'https://cdn.example.com/a.jpg?logo=1'},{src:'https://cdn.example.com/'+'a'.repeat(2000)},{src:'https://cdn.example.com/a_track_b.jpg'},{src:'https://cdn.example.com/open1.jpg'},{src:'https://cdn.example.com/opened.jpg'},{src:'https://cdn.example.com/x.jpg',alt:'Our LinkedIn page'},{src:'https://cdn.example.com/x.jpg',alt:'linkedin_page'},{src:'https://x',alt:null},{src:null}];

// One mailbox for both fakes. Lists answer from `lists` when the exact request is there, else every thread or message.
const mime=(text:string,html?:string)=>html===undefined?{mimeType:'text/plain',body:{data:b64(text)}}:{mimeType:'multipart/alternative',parts:[{mimeType:'text/plain',body:{data:b64(text)}},{mimeType:'text/html',body:{data:b64(html)}}]};
const message=(id:string,threadId:string,date:string,labels:string[],subject:string,body:any)=>({id,threadId,labelIds:labels,snippet:subject+' snippet',internalDate:date,historyId:'h'+id,sizeEstimate:500,payload:{...body,headers:[header('Subject',subject),header('From','Sam <sam@example.com>'),header('To','Alex <alex@example.com>'),header('Date','Mon, 5 Oct 2026 10:00:00 +0000'),header('Received','x')]}});
const threadOf=(id:string,messages:any[])=>({id,historyId:'h'+id,messages});
const mailbox={
 threads:[
  threadOf('aa01',[message('m01','aa01','1791100000000',['INBOX','UNREAD'],'Dinner invitation',mime('Join us Friday',HTML[0][1]))]),
  threadOf('aa02',[message('m02','aa02','1791200000000',['INBOX'],'Renewal notice',mime('Your plan renews',HTML[2][1])),message('m03','aa02','1791300000000',['INBOX'],'Re: Renewal notice',mime('Thanks'))]),
  threadOf('aa03',Array.from({length:11},(_,i)=>message('m1'+String(i).padStart(2,'0'),'aa03',String(1791000000000+(i%4)*1000),i===5?['UNREAD']:[],'Long thread '+i,mime('Message '+i+' '+cjk.slice(0,200),i%3?undefined:HTML[i%HTML.length][1])))),
  threadOf('aa04',[message('m20','aa04','1791400000000',['INBOX'],'Read only',mime('Already read'))]),
  threadOf('aa05',[message('m21','aa05','1791500000000',['INBOX','UNREAD'],'Big but fine',mime('大'.repeat(300000)))]),
  threadOf('aa06',[message('m22','aa06','1791600000000',['INBOX'],'Too big',mime('大'.repeat(500000)))]),
  threadOf('aa07',[message('m23','aa07','1791700000000',['INBOX','UNREAD'],'Meeting moved',mime('See you at 3',HTML[4][1])),message('m24','aa07','1791700000000',['INBOX'],'Same time',mime('Equal dates keep their order'))]),
 ],
 lists:{
  'threads|is:unread -in:spam -in:trash|':{threads:[{id:'aa01'},{id:'aa04'},{id:'aa03'},{id:'aa07'}],resultSizeEstimate:4},
  'threads|(invoice) -in:spam -in:trash|':{resultSizeEstimate:0},
  'threads|(invoice) is:unread -in:spam -in:trash|':{threads:[{id:'aa01'}],nextPageToken:'p2'},
  'threads|newer_than:30d -in:spam -in:trash|p2':{threads:[{id:'aa07'}]},
  'threads|(missing) -in:spam -in:trash|':{threads:[{id:'aa01'},{id:'ffff'},{id:'eeee'}]},
  'messages|(dup) -in:spam -in:trash|':{messages:[{id:'m02',threadId:'aa02'},{id:'m03',threadId:'aa02'},{id:'m01',threadId:'aa01'}]},
  'messages|(orphan) -in:spam -in:trash|':{messages:[{id:'m02',threadId:'aa02'},{id:'m99'}]},
  'threads|(newer_than:30d {"invitation" "meeting" "appointment" "会议" "预约"}) -in:spam -in:trash|':{threads:[{id:'aa01'},{id:'aa07'}],nextPageToken:'more'},
  'threads|(newer_than:30d {"trial ends" "renewal" "renews" "续费" "试用到期"}) -in:spam -in:trash|':{threads:[{id:'aa02'},{id:'aa01'}]},
  'threads|(newer_than:30d {"RSVP" "please confirm" "action required" "deadline" "请确认" "截止"}) -in:spam -in:trash|':{},
 } as Record<string,any>,
};
const PAGES:any[]=[
 {},{threads:true},{threads:true,limit:3},{threads:1},{threads:[]},{threads:{}},{threads:'x'},{limit:1},{unreadOnly:true,threads:true},{query:'invoice',threads:true},{query:'invoice',unreadOnly:true,threads:true},
 {pageToken:'p2',threads:true},{id:'thread:aa03',threads:true},{id:'aa03'},{id:'AA02',threads:true},{id:'thread:aa05',threads:true},{id:'thread:aa06',threads:true},{id:'aa06'},{id:'m01'},
 {metadataOnly:true,threads:true},{metadataOnly:true},{query:'dup',scanMessages:true},{query:'dup',scanMessages:true,threads:true},{query:'orphan',scanMessages:true},{id:'aa01',scanMessages:true},
 {query:'missing',threads:true},{id:'thread:dead',threads:true},
 {limit:0},{limit:21},{limit:true},{limit:'5'},{limit:5.5},{limit:null},{unreadOnly:'yes'},{unreadOnly:null},{pageToken:'x'.repeat(2049)},{pageToken:'😀'.repeat(2048)},{pageToken:5},{query:'q'.repeat(513)},{query:'a\x00b'},{query:7},
 {metadataOnly:1},{id:5},{id:'thread:xyz'},{id:'a'.repeat(65)},{id:'thread:'},{id:'aa01',pageToken:'t'},{id:'aa01',unreadOnly:true},{id:'aa01',query:'q'},{id:'aa01',query:''},{scanMessages:'yes'},{scanMessages:null},
];
const DISCOVER:any[]=[null,{},{discovery:true},{discovery:false},{discovery:1},{id:'aa01'},{query:''},{unreadOnly:false},{pageToken:'t'},{query:'x'},{discovery:true,threads:false}];

const metaMessage=(m:any,names:string[])=>{
 const out:any={};for(const k of ['id','threadId','labelIds','snippet','internalDate','historyId','sizeEstimate'])if(k in m)out[k]=m[k];
 out.payload={mimeType:m.payload.mimeType,headers:m.payload.headers.filter((h:any)=>names.map(n=>n.toLowerCase()).includes(h.name.toLowerCase()))};
 return out;
};
function answer(path:string,query:any){
 const [kind,id]=path.replace('gmail/v1/users/me/','').split('/');
 if(id===undefined){
  const key=`${kind}|${query.q}|${query.pageToken??''}`;
  if(key in mailbox.lists)return structuredClone(mailbox.lists[key]);
  const all=kind==='threads'?mailbox.threads.map(t=>({id:t.id,historyId:t.historyId})):mailbox.threads.flatMap(t=>t.messages.map((m:any)=>({id:m.id,threadId:m.threadId})));
  return {[kind]:all.slice(0,query.maxResults),...(all.length>query.maxResults?{nextPageToken:'page-2'}:{})};
 }
 const thread=mailbox.threads.find(t=>t.id===id),found=kind==='threads'?thread:mailbox.threads.flatMap(t=>t.messages).find((m:any)=>m.id===id);
 if(!found)throw new GoogleRestError(404,'notFound','Requested entity was not found.');
 if(query.format!=='metadata')return structuredClone(found);
 return kind==='threads'?{id:found.id,historyId:found.historyId,messages:found.messages.map((m:any)=>metaMessage(m,query.metadataHeaders))}:metaMessage(found,query.metadataHeaders);
}
function fakeRest(log:any[]):GoogleRest {
 const call=(path:string,query:any={})=>{log.push({path,query});return answer(path,query);};
 return {
  async get(path,query){return call(path,query);},
  // Like a batch: every request is sent, then the first failure in request order rejects.
  async getAll(requests){
   const answers=requests.map(r=>{try{return {value:call(r.path,r.query)};}catch(error){return {error};}});
   const failed=answers.find(a=>'error' in a);
   if(failed)throw failed.error;
   return answers.map(a=>a.value);
  },
  async post(){throw new Error('read only');},
  async bytes(){throw new Error('read only');},
 };
}

const PYTHON=String.raw`
import json, sys
sys.path.insert(0, sys.argv[1] + '/harness/hermes')
import gmail_reader as g
from html import unescape
from html.entities import html5
inp = json.loads(sys.stdin.buffer.read().decode('utf-8'))
mailbox = inp['mailbox']

class HttpError(Exception): pass
def meta_message(m, names):
    out = {k: m[k] for k in ('id','threadId','labelIds','snippet','internalDate','historyId','sizeEstimate') if k in m}
    out['payload'] = {'mimeType': m['payload']['mimeType'], 'headers': [h for h in m['payload']['headers'] if h['name'].lower() in [n.lower() for n in names]]}
    return out
def answer(path, query):
    parts = path.replace('gmail/v1/users/me/', '').split('/')
    kind = parts[0]
    if len(parts) == 1:
        key = '%s|%s|%s' % (kind, query['q'], query.get('pageToken', ''))
        if key in mailbox['lists']: return json.loads(json.dumps(mailbox['lists'][key]))
        if kind == 'threads': every = [{'id': t['id'], 'historyId': t['historyId']} for t in mailbox['threads']]
        else: every = [{'id': m['id'], 'threadId': m['threadId']} for t in mailbox['threads'] for m in t['messages']]
        return {kind: every[:query['maxResults']], **({'nextPageToken': 'page-2'} if len(every) > query['maxResults'] else {})}
    ident = parts[1]
    found = next((t for t in mailbox['threads'] if t['id'] == ident), None) if kind == 'threads' else next((m for t in mailbox['threads'] for m in t['messages'] if m['id'] == ident), None)
    if found is None: raise HttpError('Requested entity was not found.')
    if query.get('format') != 'metadata': return json.loads(json.dumps(found))
    if kind == 'threads': return {'id': found['id'], 'historyId': found['historyId'], 'messages': [meta_message(m, query['metadataHeaders']) for m in found['messages']]}
    return meta_message(found, query['metadataHeaders'])
class Request:
    def __init__(self, api, path, query): self.api, self.path, self.query = api, path, query
    def execute(self):
        self.api.log.append({'path': self.path, 'query': self.query})
        return answer(self.path, self.query)
class Resource:
    def __init__(self, api, kind): self.api, self.kind = api, kind
    def list(self, userId, **query): return Request(self.api, 'gmail/v1/users/%s/%s' % (userId, self.kind), query)
    def get(self, userId, id, **query): return Request(self.api, 'gmail/v1/users/%s/%s/%s' % (userId, self.kind, id), query)
class Users:
    def __init__(self, api): self.api = api
    def messages(self): return Resource(self.api, 'messages')
    def threads(self): return Resource(self.api, 'threads')
class Batch:
    def __init__(self, callback): self.callback, self.requests = callback, []
    def add(self, request, request_id): self.requests.append((request_id, request))
    def execute(self):
        for request_id, request in self.requests:
            try: response, error = request.execute(), None
            except Exception as e: response, error = None, e
            self.callback(request_id, response, error)
class Api:
    def __init__(self): self.log = []
    def users(self): return Users(self)
    def new_batch_http_request(self, callback): return Batch(callback)

def attempt(run):
    try: return run()
    except Exception as e: return {'error': str(e)}
def mail_text(source):
    parser = g.MailText(); parser.feed(source); parser.close()
    return {'text': parser.text(), 'picture': parser.picture(), 'images': parser.images}
def compact(message, limit):
    result = g.compact_message(message, limit)
    return {'result': result, 'size': len(json.dumps(result))}
def page(run):
    api = Api()
    return {'result': attempt(lambda: run(api)), 'calls': api.log}
out = {
    'entities': html5,
    'html': [attempt(lambda: mail_text(source)) for source in inp['html']],
    'compact': [attempt(lambda: compact(m, limit)) for m, limit in inp['compact']],
    'tidy': [g.tidy_mail(text) for text in inp['tidy']],
    'unescape': [unescape(text) for text in inp['unescape']],
    'images': [g.content_image(attrs) for attrs in inp['images']],
    'pages': [page(lambda api: g.read_page(api, body, inp['email'])) for body in inp['pages']],
    'discover': [page(lambda api: g.discover(api, inp['email'], body)) for body in inp['discover']],
}
sys.stdout.write(json.dumps(out))
`;
const email='alex@example.com';
const input={mailbox,email,html,compact,tidy,unescape:unescapes,images,pages:PAGES,discover:DISCOVER};
const reference=referencePython();
const python=JSON.parse(execFileSync(reference[0],[...reference.slice(1),'-I','-c',PYTHON,root],{input:JSON.stringify(input),maxBuffer:1<<30,encoding:'utf8'}));

const attempt=async(run:()=>any)=>{try{return await run();}catch(error){return {error:error.message};}};
const plain=(value:unknown)=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const short=(value:unknown)=>{const text=JSON.stringify(value);return text.length>1200?text.slice(0,1200)+'…':text;};
function same(section:string,label:(i:number)=>string,ours:unknown[],theirs:unknown[]){
 assert.equal(ours.length,theirs.length,section);
 ours.forEach((value,i)=>{
  const a=JSON.stringify(plain(value)),b=JSON.stringify(theirs[i]);
  assert.ok(a===b,`${section} ${label(i)} differs from Python\n  TypeScript: ${short(plain(value))}\n  Python:     ${short(theirs[i])}`);
 });
}
const mailText=(source:string)=>{const parser=new MailText();parser.feed(source);parser.close();return {text:parser.text(),picture:parser.picture(),images:parser.images};};
assert.deepEqual({...HTML5_ENTITIES},python.entities,'the HTML5 entity table is Python\'s');
same('MailText',i=>i<HTML.length?`"${HTML[i][0]}"`:`fuzz #${i-HTML.length}: ${JSON.stringify(html[i])}`,await Promise.all(html.map(source=>attempt(()=>mailText(source)))),python.html);
same('compact_message',i=>`${compact[i][0].id} limit ${compact[i][1]}`,await Promise.all(compact.map(([m,limit])=>attempt(()=>{const result=compactMessage(structuredClone(m),limit);return {result,size:jsonSize(result)};}))),python.compact);
same('tidy_mail',i=>JSON.stringify(tidy[i]),tidy.map(tidyMail),python.tidy);
same('html.unescape',i=>JSON.stringify(unescapes[i]),unescapes.map(htmlUnescape),python.unescape);
same('content_image',i=>JSON.stringify(images[i]),images.map(attrs=>contentImage(attrs as any)),python.images);
const run=async(task:(api:GoogleRest)=>Promise<any>)=>{const calls:any[]=[];return {result:await attempt(()=>task(fakeRest(calls))),calls};};
const pages=[];for(const body of PAGES)pages.push(await run(api=>readPage(api,structuredClone(body),email)));
same('read_page',i=>JSON.stringify(PAGES[i]).slice(0,80),pages,python.pages);
const discovered=[];for(const body of DISCOVER)discovered.push(await run(api=>discover(api,email,structuredClone(body))));
same('discover',i=>JSON.stringify(DISCOVER[i]),discovered,python.discover);
// The comparison reaches every branch that matters: errors, truncation, pictures and too-large threads.
assert.ok(python.html.slice(0,HTML.length).every((r:any)=>!r.error)&&python.html.some((r:any)=>r.picture));
assert.ok(python.compact.some((r:any)=>r.error)&&python.compact.some((r:any)=>r.result?.excerptTruncated));
assert.ok(python.pages.some((p:any)=>/too large/.test(p.result.error))&&python.pages.some((p:any)=>p.result.records?.length>1)&&python.discover.some((p:any)=>p.result.ok));
console.log(`PASS Gmail reader parity: ${html.length} HTML mails (${HTML.length} fixtures), ${compact.length} excerpts, ${PAGES.length} pages and ${DISCOVER.length} discoveries read identically by harness/hermes/gmail_reader.py and core/accounts/google/gmail.ts`);
