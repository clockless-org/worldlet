// The ready-made Getty Center guide (owner requests 2026-10-04): a moment Applet Fox offers whenever the person
// mentions the Getty Center, added at once without writing a page (core/widgets/README.md#ready-made-applets).
// Drawn in Worldlet's own style: the campus as a miniature on a timber base, Fox telling what is now, painted
// pictures for each stop and artworks that turn over when seen. Its pictures are generated into getty-center-art.ts
// (resources/styles/builtin/drafts/getty-guide).
import {GETTY_ART,GETTY_PINS} from './getty-center-art.ts';
export default String.raw`<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Getty Center 导览</title>
<style>
:root{--paper:#f4f0e5;--card:#fbf8ef;--ink:#203b30;--muted:#5f6e62;--edge:#d9ccae;--honey:#d4aa56;--honey2:#b8892f;--sage:#7eaa75;--moss:#285440;--clay:#cc8768;--water:#76aeb9;--sky:#d7e7e6;--r:16px}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC","Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
body{background:radial-gradient(120% 60% at 50% 0%,#fffaf0 0,var(--paper) 60%) fixed}
main{max-width:600px;margin:0 auto;padding:0 0 48px}
button{font:inherit;color:inherit;cursor:pointer}
/* The hill: sky, hazy mountains and the miniature campus, tilting with the hand. */
.hero{position:relative;padding:18px 16px 14px;background:linear-gradient(180deg,#cfe2e3 0,#e6ecdf 46%,var(--paper) 100%);overflow:hidden;border-radius:0 0 28px 28px}
.hero:before{content:"";position:absolute;right:26px;top:22px;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle,#fff6dc 0,#fbe7b5 55%,#fbe7b500 72%)}
.hills{position:absolute;left:0;right:0;top:92px;height:120px;width:100%}
.kicker{position:relative;margin:0;font-size:12px;letter-spacing:.08em;color:#4c6457;font-weight:600}
h1{position:relative;margin:2px 0 0;font-size:28px;line-height:1.15;letter-spacing:-.01em;font-weight:750}
.route{position:relative;margin:4px 0 0;font-size:13px;color:var(--muted)}
.stage{position:relative;margin:4px auto 0;max-width:560px;perspective:900px;padding-top:26px}
.board{position:relative;transform-style:preserve-3d;transform:rotateX(var(--rx,8deg)) rotateY(var(--ry,0deg));transition:transform .5s cubic-bezier(.2,.7,.2,1);animation:float 7s ease-in-out infinite}
.board img{display:block;width:100%;height:auto;filter:drop-shadow(0 18px 18px #3b4a2a33)}
.board .shadow{position:absolute;left:8%;right:8%;bottom:-4px;height:22px;border-radius:50%;background:radial-gradient(closest-side,#5b5a3a33,#5b5a3a00);transform:translateZ(-20px)}
@keyframes float{0%,100%{translate:0 0}50%{translate:0 -5px}}
.pin{position:absolute;transform:translate(-50%,-100%) translateZ(36px);display:flex;flex-direction:column;align-items:center;border:0;background:none;padding:0;min-width:34px;min-height:40px}
.pin b{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;font-size:13px;font-weight:800;color:#3a2a10;background:radial-gradient(circle at 35% 30%,#fbe3a6,var(--honey) 62%,var(--honey2));box-shadow:0 2px 0 #9c742a,0 5px 9px #3a2a1040;border:1.5px solid #fff6dd}
.pin i{width:2px;height:10px;background:linear-gradient(#9c742a,#9c742a00)}
.pin.done b{background:radial-gradient(circle at 35% 30%,#d9ecd2,var(--sage) 62%,#5b8a55);box-shadow:0 2px 0 #4b7446,0 5px 9px #1a301a40;color:#fff;font-size:0}
.pin.done b:after{content:"✓";font-size:14px}
.pin.current b{animation:beat 1.6s ease-in-out infinite}
.pin.current b:before{content:"";position:absolute;width:26px;height:26px;border-radius:50%;box-shadow:0 0 0 0 #f2c66b;animation:ring 1.6s ease-out infinite}
@keyframes beat{50%{transform:scale(1.12)}}
@keyframes ring{0%{box-shadow:0 0 0 0 #f2c66bcc}100%{box-shadow:0 0 0 14px #f2c66b00}}
.pin span{position:absolute;bottom:100%;margin-bottom:3px;white-space:nowrap;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:#fbf8efe6;color:var(--ink);box-shadow:0 1px 3px #20302530;opacity:0;transition:opacity .2s}
.pin.current span,.pin:focus-visible span{opacity:1}
/* Fox and its dialogue: what to do now. */
.fox{position:relative;display:flex;align-items:flex-end;gap:4px;margin:-6px 12px 0;z-index:2}
.fox img{width:78px;height:auto;flex:none;filter:drop-shadow(0 6px 6px #4a352033);transform-origin:50% 100%;animation:sway 4s ease-in-out infinite}
@keyframes sway{50%{transform:rotate(-3deg) translateY(-2px)}}
.say{position:relative;flex:1;padding:12px 14px 13px;margin-bottom:12px;background:var(--card);border-radius:20px 22px 20px 6px;box-shadow:0 1px 0 #fff inset,0 8px 24px #2a3d2f1f,0 1px 2px #2a3d2f26}
.say:before{content:"小狐狸";position:absolute;top:-11px;left:12px;font-size:11px;font-weight:800;color:#5b3d12;background:var(--honey);padding:1px 9px;border-radius:8px;transform:rotate(-3deg);box-shadow:0 2px 0 var(--honey2)}
.say small{display:block;font-size:12px;font-weight:700;color:#9a7135;letter-spacing:.04em}
.say p{margin:2px 0 0;font-size:16px;line-height:1.4;font-weight:600}
.say .go{margin-top:8px;display:flex;gap:8px}
/* Raised paper buttons with a honey face. */
.btn{border:0;border-radius:999px;padding:8px 16px;min-height:38px;font-weight:700;background:linear-gradient(#f4cf7f,var(--honey));color:#3a2a10;box-shadow:0 3px 0 var(--honey2),0 6px 12px #8a64202e;transition:transform .08s,box-shadow .08s}
.btn:active{transform:translateY(3px);box-shadow:0 0 0 var(--honey2),0 2px 4px #8a64202e}
.btn.quiet{background:#efe8d6;color:var(--muted);box-shadow:0 2px 0 #d3c6a6}
.meters{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 16px 0}
.meter{padding:10px 12px;border-radius:14px;background:var(--card);box-shadow:0 1px 2px #2a3d2f1f}
.meter{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:baseline}
.meter b{font-size:12px;color:var(--muted);font-weight:700}
.meter em{font-style:normal;font-weight:800;font-variant-numeric:tabular-nums}
.meter .bar{flex:0 0 100%}
.meter .bar{height:8px;margin-top:6px;border-radius:8px;background:#e8e0cb;box-shadow:inset 0 1px 2px #6b5a3330;overflow:hidden}
.meter .bar i{display:block;height:100%;width:0;border-radius:8px;background:linear-gradient(90deg,#9fc394,var(--sage));transition:width .4s}
.meter.seen .bar i{background:linear-gradient(90deg,#f0c776,var(--honey))}
h2{margin:28px 16px 10px;font-size:19px;letter-spacing:-.01em;display:flex;align-items:baseline;gap:8px}
h2 small{font-size:12px;font-weight:600;color:var(--muted)}
/* The day, stop by stop. */
.stops{position:relative;margin:0 16px;padding-left:22px}
.stops:before{content:"";position:absolute;left:9px;top:14px;bottom:14px;width:3px;border-radius:3px;background:repeating-linear-gradient(#cdbf9c 0 6px,#cdbf9c00 6px 11px)}
.stop{position:relative;display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:center;margin:0 0 12px;padding:10px;border-radius:var(--r);background:var(--card);box-shadow:0 1px 0 #fff inset,0 6px 16px #2a3d2f14,0 1px 2px #2a3d2f24;transition:transform .2s,opacity .3s}
.stop .n{position:absolute;left:-22px;top:50%;margin-top:-11px;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;background:#efe6cf;color:#7a6439;box-shadow:0 0 0 3px var(--paper)}
.stop .pic{width:64px;height:64px;border-radius:12px;background-size:cover;background-position:center;box-shadow:inset 0 0 0 1px #ffffff55,0 2px 4px #2a3d2f30}
.stop .time{font-size:12px;font-weight:800;color:#9a7135;font-variant-numeric:tabular-nums}
.stop strong{display:block;font-size:15px;line-height:1.3}
.stop .note{display:block;font-size:12.5px;color:var(--muted);line-height:1.4;margin-top:2px}
.stop .act{display:flex}
.stop .act .btn{padding:8px 13px}
.stop.current{transform:translateX(2px);box-shadow:0 0 0 2px var(--honey),0 10px 24px #8a64202e}
.stop.current .n{background:var(--honey);color:#3a2a10}
.stop.current .time:after{content:" · 进行中";color:var(--honey2)}
.stop.done{opacity:.66}
.stop.done .n{background:var(--sage);color:#fff;font-size:0}
.stop.done .n:after{content:"✓";font-size:12px}
.stop.done strong{text-decoration:line-through;text-decoration-color:#7eaa7599}
.stop.done .pic{filter:saturate(.4)}
.pic.tram{background-image:url(${GETTY_ART.tram})}
.pic.museum{background-image:url(${GETTY_ART.museum})}
.pic.garden{background-image:url(${GETTY_ART.garden})}
.pic.cafe{background-image:url(${GETTY_ART.cafe})}
.pic.exhibit{background-image:url(${GETTY_ART.exhibit})}
.pic.b{background-size:190%;background-position:88% 40%}
.pic.c{background-size:210%;background-position:8% 30%}
.pic.d{background-size:170%;background-position:55% 85%}
/* Artworks to collect: each card turns over when seen. */
.wing{margin:16px 16px 6px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800}
.wing i{width:10px;height:10px;border-radius:3px;transform:rotate(45deg)}
.arts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 16px}
.art{position:relative;display:block;perspective:700px;cursor:pointer;min-height:132px}
.art input{position:absolute;opacity:0;width:1px;height:1px}
.art .flip{position:relative;height:100%;min-height:132px;transform-style:preserve-3d;transition:transform .55s cubic-bezier(.3,1.3,.5,1)}
.art input:checked+.flip{transform:rotateY(180deg)}
.art input:focus-visible+.flip .face{outline:2px solid var(--honey2)}
.face{position:absolute;inset:0;padding:11px 12px;border-radius:14px;backface-visibility:hidden;-webkit-backface-visibility:hidden;background:var(--card);box-shadow:0 1px 0 #fff inset,0 6px 14px #2a3d2f14,0 1px 2px #2a3d2f24;display:flex;flex-direction:column}
.face strong{font-size:14px;line-height:1.3}
.face span{font-size:12px;color:var(--muted);line-height:1.35;margin-top:4px}
.face .tag{margin-top:auto;padding-top:6px;font-size:11px;font-weight:700;color:var(--muted)}
.face.back{transform:rotateY(180deg);background:linear-gradient(160deg,#f1f6ea,#e2eed9);align-items:flex-start}
.face.back strong{opacity:.7;font-size:13px}
.seal{position:absolute;right:10px;bottom:10px;width:58px;height:58px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:900;color:#a3443f;border:2.5px solid #a3443fcc;transform:rotate(-14deg);box-shadow:inset 0 0 0 3px #f1f6ea,inset 0 0 0 4.5px #a3443f88;letter-spacing:.05em}
/* Tips and the note. */
.tips{display:grid;gap:8px;margin:0 16px}
.tip{display:flex;gap:10px;padding:11px 12px;border-radius:14px;background:var(--card);box-shadow:0 1px 2px #2a3d2f1f;font-size:13.5px;line-height:1.45}
.tip b{flex:none;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:15px;background:#efe6cf}
textarea{display:block;width:calc(100% - 32px);margin:0 16px;min-height:110px;border:0;border-radius:var(--r);padding:12px 14px;font:inherit;color:var(--ink);line-height:28px;background:repeating-linear-gradient(var(--card) 0 27px,#e6dcc4 27px 28px);background-position:0 11px;box-shadow:0 1px 2px #2a3d2f1f,inset 0 1px 3px #6b5a3318;resize:vertical}
textarea:focus{outline:2px solid var(--honey)}
.foot{margin:14px 16px 0;font-size:12px;color:var(--muted)}
.reset{border:0;background:none;color:var(--muted);text-decoration:underline;padding:4px 0;min-height:32px}
@media (min-width:720px){h1{font-size:34px}.hero{padding:26px 28px 0}.arts{grid-template-columns:1fr 1fr 1fr}}
@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<main>
<header class="hero" id="hero">
 <svg class="hills" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="m"><rect width="400" height="120" fill="url(#fade)"/></mask></defs><g mask="url(#m)"><path d="M0 70 C40 40 70 52 100 44 S160 18 200 36 S270 30 300 22 S370 44 400 34 V120 H0Z" fill="#b9cfcf" opacity=".55"/><path d="M0 92 C50 70 90 84 140 72 S220 60 260 70 S340 58 400 66 V120 H0Z" fill="#c7d6c0" opacity=".7"/></g></svg>
 <p class="kicker">今天 · 洛杉矶 布伦特伍德山顶</p>
 <h1>Getty Center 导览</h1>
 <p class="route">电车上山 · 四座展馆 · 中央花园 · 闭馆前下山</p>
 <div class="stage" id="stage">
  <div class="board" id="board">
   <div class="shadow"></div>
   <img src="${GETTY_ART.hero}" alt="Getty Center 微缩沙盘：山顶的展馆、圆形入口大厅、中央花园的杜鹃迷宫和上山电车" width="640" height="413">
   <div id="pins"></div>
  </div>
 </div>
</header>
<section class="fox" aria-live="polite">
 <img src="${GETTY_ART.fox}" alt="">
 <div class="say"><small id="nowWhen">现在</small><p id="nowText">准备出发</p><div class="go"><button class="btn" id="nowDone" type="button">这站完成</button><button class="btn quiet" id="nowShow" type="button">看看在哪</button></div></div>
</section>
<div class="meters">
 <div class="meter"><b>行程</b><em id="stopCount"></em><div class="bar"><i id="stopBar"></i></div></div>
 <div class="meter seen"><b>作品</b><em id="artCount"></em><div class="bar"><i id="artBar"></i></div></div>
</div>

<h2>今天的路线 <small>点地图上的数字也能跳过来</small></h2>
<div class="stops" id="stops"></div>

<h2>想看的作品 <small>看过就点一下，翻成已看</small></h2>
<div id="arts"></div>

<h2>小贴士</h2>
<div class="tips">
 <div class="tip"><b>🎟</b><div>门票免费，建议提前在 getty.edu 预约入场时段；停车按当天标准收费，停好坐免费电车上山，约 5 分钟。</div></div>
 <div class="tip"><b>🕔</b><div>开放时间以官网当天为准，通常傍晚 5:30 闭馆（周六更晚，周一闭馆）。</div></div>
 <div class="tip"><b>🖼</b><div>画作大多在各展馆楼上，楼下多是雕塑、装饰艺术和手稿。</div></div>
 <div class="tip"><b>🌸</b><div>中央花园下午光线最好；西侧和南侧露台能看到洛杉矶和圣莫尼卡的海。</div></div>
 <div class="tip"><b>💧</b><div>馆内有餐厅、咖啡车和很多饮水机，带个水瓶就好。</div></div>
</div>

<h2>备忘</h2>
<textarea id="note" placeholder="朋友想看的、拍照点、下次再来……"></textarea>
<p class="foot">勾选和备忘自动保存，电脑和手机同步。<button class="reset" id="reset" type="button">全部重来</button></p>
</main>
<script>
(function(){
 var STOPS=[
  {id:'tram',pin:'tram',pic:'tram',from:'10:30',to:'10:50',title:'停车，坐电车上山',note:'山脚电车站，车程约 5 分钟，回头看看 405 号公路和山谷'},
  {id:'arrive',pin:'arrive',pic:'museum',from:'10:50',to:'11:05',title:'到达广场，熟悉动线',note:'入口大厅（圆形那座）拿地图，看今天的特展'},
  {id:'west',pin:'west',pic:'museum b',from:'11:05',to:'12:15',title:'西馆：印象派和 19 世纪绘画',note:'楼上画廊，梵高《鸢尾花》、莫奈、马奈、雷诺阿都在这一带'},
  {id:'garden',pin:'garden',pic:'garden',from:'12:15',to:'13:15',title:'中央花园，然后午饭',note:'沿之字形小路走到杜鹃迷宫，再去餐厅或咖啡车'},
  {id:'north',pin:'north',pic:'exhibit c',from:'13:15',to:'14:00',title:'北馆：文艺复兴',note:'曼特尼亚、提香、蓬托尔莫，节奏放慢'},
  {id:'east',pin:'east',pic:'museum d',from:'14:00',to:'14:45',title:'东馆：伦勃朗和巴洛克',note:'荷兰、佛兰德斯的 17 世纪绘画'},
  {id:'south',pin:'south',pic:'exhibit',from:'14:45',to:'15:30',title:'南馆：18 世纪法国装饰艺术',note:'复原的宫廷房间、家具和钟表'},
  {id:'exhibit',pin:'exhibit',pic:'exhibit',from:'15:30',to:'16:30',title:'特展馆，或回到最喜欢的展馆',note:'挑一个今天最打动你们的地方再看一遍'},
  {id:'cactus',pin:'cactus',pic:'cafe',from:'16:30',to:'17:10',title:'仙人掌花园和露台看城市',note:'南边观景台，傍晚光线最好，拍张合照'},
  {id:'down',pin:'tram',pic:'tram b',from:'17:10',to:'17:30',title:'回入口坐电车下山',note:'闭馆前留出排电车的时间'}
 ];
 var PINS=${JSON.stringify(GETTY_PINS)};
 var NAMES={tram:'电车站',arrive:'入口大厅',west:'西馆',garden:'中央花园',north:'北馆',east:'东馆',south:'南馆',exhibit:'特展馆',cactus:'仙人掌花园'};
 var WINGS=[['西馆','#cc8768'],['北馆','#76aeb9'],['东馆','#d4aa56'],['南馆','#9a7fb0'],['户外','#7eaa75']];
 var ARTS=[
  {id:'irises',where:'西馆',title:'梵高《鸢尾花》',note:'1889 年，在圣雷米疗养院画的'},
  {id:'wheatstacks',where:'西馆',title:'莫奈《干草堆，雪景，清晨》',note:'系列中的一幅，看光'},
  {id:'spring',where:'西馆',title:'马奈《春》',note:'戴花帽的年轻女子'},
  {id:'promenade',where:'西馆',title:'雷诺阿《漫步》',note:'林间小路上的一对人'},
  {id:'apples',where:'西馆',title:'塞尚《苹果静物》',note:'看桌面怎么“歪”'},
  {id:'turner',where:'西馆',title:'透纳《现代罗马——坎波瓦奇诺》',note:'满屏的金色光'},
  {id:'magi',where:'北馆',title:'曼特尼亚《三王来朝》',note:'人物几乎贴着画面'},
  {id:'venus',where:'北馆',title:'提香《维纳斯与阿多尼斯》',note:'威尼斯画派的颜色'},
  {id:'halberdier',where:'北馆',title:'蓬托尔莫《持戟士兵肖像》',note:'1989 年古典大师画作拍卖纪录'},
  {id:'oldman',where:'东馆',title:'伦勃朗《戎装老人》',note:'看他怎么画金属和皱纹'},
  {id:'europa',where:'东馆',title:'伦勃朗《劫掠欧罗巴》',note:'很小的一幅，细节很多'},
  {id:'rooms',where:'南馆',title:'18 世纪法国宫廷房间',note:'镀金镶板和家具原样陈列'},
  {id:'garden',where:'户外',title:'罗伯特·欧文的中央花园',note:'“一件永远不会两次一样的雕塑”'}
 ];
 var store=window.localStorage;
 function get(k){try{return store.getItem(k);}catch(e){return null;}}
 function set(k,v){try{if(v===null)store.removeItem(k);else store.setItem(k,v);}catch(e){}}
 function mins(t){var p=t.split(':');return +p[0]*60+ +p[1];}
 function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
 function done(id){return !!get('stop-'+id);}
 function toggle(id){set('stop-'+id,done(id)?null:String(Date.now()));draw();}
 function current(){for(var i=0;i<STOPS.length;i++)if(!done(STOPS[i].id))return STOPS[i];return null;}
 function show(id){var row=document.getElementById('stop-'+id);if(row)row.scrollIntoView({behavior:'smooth',block:'center'});}
 function drawPins(cur){
  var box=document.getElementById('pins');box.textContent='';
  Object.keys(PINS).forEach(function(key){
   var mine=STOPS.filter(function(s){return s.pin===key;}),first=mine[0],n=STOPS.indexOf(first)+1;
   var all=mine.every(function(s){return done(s.id);}),isCur=cur&&cur.pin===key;
   var b=el('button','pin'+(all?' done':'')+(isCur?' current':''));b.type='button';
   b.style.left=PINS[key][0]+'%';b.style.top=PINS[key][1]+'%';b.style.zIndex=isCur?200:Math.round(PINS[key][1]);b.setAttribute('aria-label',n+' '+NAMES[key]);
   b.appendChild(el('span','',NAMES[key]));b.appendChild(el('b','',String(isCur?STOPS.indexOf(cur)+1:n)));b.appendChild(el('i'));
   b.addEventListener('click',function(){show((isCur?cur:first).id);});
   box.appendChild(b);
  });
 }
 function drawStops(){
  var box=document.getElementById('stops');box.textContent='';
  var now=new Date(),m=now.getHours()*60+now.getMinutes(),cur=current();
  STOPS.forEach(function(s,i){
   var d=done(s.id),row=el('div','stop'+(d?' done':'')+(cur&&cur.id===s.id?' current':''));row.id='stop-'+s.id;
   row.appendChild(el('span','n',String(i+1)));
   row.appendChild(el('div','pic '+s.pic));
   var what=el('div');what.appendChild(el('span','time',s.from+'–'+s.to));what.appendChild(el('strong','',s.title));what.appendChild(el('span','note',s.note));row.appendChild(what);
   var act=el('div','act'),b=el('button',d?'btn quiet':'btn',d?'撤销':'完成');b.type='button';
   b.addEventListener('click',function(){toggle(s.id);});act.appendChild(b);row.appendChild(act);
   box.appendChild(row);
  });
  var count=STOPS.filter(function(s){return done(s.id);}).length;
  document.getElementById('stopBar').style.width=Math.round(count/STOPS.length*100)+'%';
  document.getElementById('stopCount').textContent=count+' / '+STOPS.length;
  var when='现在',text,nd=document.getElementById('nowDone'),ns=document.getElementById('nowShow');
  if(!cur){when='今天';text='全部走完啦，辛苦了！回家路上慢慢聊。';}
  else{
   var start=mins(cur.from),end=mins(cur.to);
   if(m<start){when='下一站 · '+cur.from;text=cur.title;}
   else if(m<=end){when='现在 · 到 '+cur.to;text=cur.title;}
   else{when='有点晚了';text=cur.title+'。可以跳过一站，留出下山时间。';}
  }
  document.getElementById('nowWhen').textContent=when;document.getElementById('nowText').textContent=text;
  nd.hidden=ns.hidden=!cur;
  nd.onclick=function(){if(cur)toggle(cur.id);};ns.onclick=function(){if(cur)show(cur.id);};
  drawPins(cur);
 }
 function drawArts(){
  var box=document.getElementById('arts');box.textContent='';
  WINGS.forEach(function(w){
   var list=ARTS.filter(function(a){return a.where===w[0];});if(!list.length)return;
   var head=el('div','wing'),dot=el('i');dot.style.background=w[1];head.appendChild(dot);head.appendChild(document.createTextNode(w[0]));box.appendChild(head);
   var grid=el('div','arts');
   list.forEach(function(a){
    var seen=!!get('art-'+a.id),card=el('label','art'),input=el('input');input.type='checkbox';input.id='art-'+a.id;input.checked=seen;
    input.addEventListener('change',function(){set('art-'+a.id,input.checked?'1':null);drawCounts();});
    var flip=el('div','flip'),front=el('div','face'),back=el('div','face back');
    front.style.borderTop='4px solid '+w[1];back.style.borderTop='4px solid '+w[1];
    front.appendChild(el('strong','',a.title));front.appendChild(el('span','',a.note));front.appendChild(el('span','tag','点一下 · 看过'));
    back.appendChild(el('strong','',a.title));back.appendChild(el('span','seal','已看过'));
    flip.appendChild(front);flip.appendChild(back);card.appendChild(input);card.appendChild(flip);grid.appendChild(card);
   });
   box.appendChild(grid);
  });
  drawCounts();
 }
 function drawCounts(){
  var count=ARTS.filter(function(a){return !!get('art-'+a.id);}).length;
  document.getElementById('artBar').style.width=Math.round(count/ARTS.length*100)+'%';
  document.getElementById('artCount').textContent=count+' / '+ARTS.length;
 }
 function draw(){drawStops();drawArts();}
 // The miniature tilts with the pointer or the phone, a few degrees at most.
 var board=document.getElementById('board'),stage=document.getElementById('stage'),still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 function tilt(x,y){if(still)return;board.style.setProperty('--ry',(x*7).toFixed(2)+'deg');board.style.setProperty('--rx',(8-y*6).toFixed(2)+'deg');}
 stage.addEventListener('pointermove',function(e){var r=stage.getBoundingClientRect();tilt((e.clientX-r.left)/r.width*2-1,(e.clientY-r.top)/r.height*2-1);});
 stage.addEventListener('pointerleave',function(){tilt(0,0);});
 window.addEventListener('deviceorientation',function(e){if(e.gamma==null)return;tilt(Math.max(-1,Math.min(1,e.gamma/25)),Math.max(-1,Math.min(1,(e.beta-45)/25)));});
 var note=document.getElementById('note');note.value=get('note')||'';
 var timer=0;note.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){set('note',note.value||null);},400);});
 // A second tap confirms: dialogs are not available in every sandboxed view.
 var reset=document.getElementById('reset'),armed=0;
 reset.addEventListener('click',function(){
  if(!armed){reset.textContent='再点一次，清空今天的勾选和备忘';armed=setTimeout(function(){armed=0;reset.textContent='全部重来';},4000);return;}
  clearTimeout(armed);armed=0;reset.textContent='全部重来';
  STOPS.forEach(function(s){set('stop-'+s.id,null);});ARTS.forEach(function(a){set('art-'+a.id,null);});set('note',null);note.value='';draw();
 });
 draw();setInterval(drawStops,60000);
})();
</script>
</body>
</html>
`;
