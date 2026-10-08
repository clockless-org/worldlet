import {build} from 'esbuild';
import {mkdir,readFile,writeFile,readdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {BUILTIN_STYLE} from '../ui/components/style.ts';
import {uiTokenCSS} from '../ui/components/tokens.ts';

// worldlet.ai/games: every folder in website/games/play is one served game
// (game.ts exporting create, meta.json, optional game.css). The Random game Applet
// opens /games/random/, which picks one of them (website/games/README.md).
export type GameMeta={slug:string;title:string;blurb:string;color:string};
const POLICY="default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://us.i.posthog.com; object-src 'none'; base-uri 'none'; form-action 'none'";
const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
const head=(title:string,description:string,canonical:string,extra:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${POLICY}"><meta name="theme-color" content="#f4f0e5"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="icon" href="/icon.svg" type="image/svg+xml"><link rel="stylesheet" href="/brand/brand.css"><link rel="stylesheet" href="/games/games.css">${extra}<link rel="canonical" href="https://worldlet.ai${canonical}"></head>`;

/** The served games, or only the named ones. */
export async function gameCatalog(root:string,only:string[]=[]):Promise<GameMeta[]>{
 const dir=path.join(root,'website/games/play'),games:GameMeta[]=[];
 for(const slug of only.length?only:(await readdir(dir)).sort()){
  if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))throw Error('Game folder names are lowercase slugs: '+slug);
  const meta=JSON.parse(await readFile(path.join(dir,slug,'meta.json'),'utf8'));
  if(typeof meta.title!=='string'||typeof meta.blurb!=='string'||!/^#[0-9a-f]{6}$/i.test(meta.color))throw Error(`website/games/play/${slug}/meta.json needs title, blurb and a #rrggbb color.`);
  games.push({slug,title:meta.title,blurb:meta.blurb,color:meta.color});
 }
 return games;
}

export async function buildGames(root:string,output:string,only:string[]=[]){
 const games=await gameCatalog(root,only),out=path.join(output,'games');
 await mkdir(path.join(out,'random'),{recursive:true});
 await mkdir(path.join(out,'hud'),{recursive:true});
 for(const key of ['country-rail','country-stationery'])await cp(path.join(root,BUILTIN_STYLE.hud[key]),path.join(out,'hud',key+'.png'));
 const css=[uiTokenCSS(),await readFile(path.join(root,'resources/styles/builtin/controls.css'),'utf8'),await readFile(path.join(root,'ui/applets/_shared/games.css'),'utf8'),await readFile(path.join(root,'website/games/games.css'),'utf8')];
 for(const game of games){
  try{css.push(await readFile(path.join(root,'website/games/play',game.slug,'game.css'),'utf8'));}catch(error){if((error as any).code!=='ENOENT')throw error;}
  await mkdir(path.join(out,game.slug),{recursive:true});
  await build({stdin:{contents:`import {mountGame} from './website/games/shell.ts';import {create} from './website/games/play/${game.slug}/game.ts';mountGame(${JSON.stringify(game)},create);`,resolveDir:root,loader:'ts'},outfile:path.join(out,game.slug,'game.js'),bundle:true,format:'esm',minify:true,logLevel:'warning'});
  await writeFile(path.join(out,game.slug,'index.html'),head(`${game.title} · Worldlet Games`,game.blurb,`/games/${game.slug}/`,`<script type="module" src="/games/${game.slug}/game.js"></script>`)+
   `<body class="games-page"><main class="game-page" data-game="${game.slug}"><header class="game-top"><h1>${esc(game.title)}</h1><a class="game-home" href="/games/">All games</a><p class="game-status" id="status" aria-live="polite"></p></header><div class="game-stage" id="stage"></div><footer class="game-foot"><p class="game-hint" id="hint"></p><div class="game-buttons"><a class="game-button" id="another" href="/games/random/?from=${game.slug}">Another game</a><button type="button" class="game-button primary" id="restart">New game</button></div></footer><noscript><p>This game needs JavaScript.</p></noscript></main></body></html>`);
 }
 // Colors live in the stylesheet: the pages' CSP allows no inline style attributes.
 css.push(games.map(g=>`[data-game="${g.slug}"]{--game-color:${g.color}}`).join('\n'));
 await writeFile(path.join(out,'games.css'),css.join('\n'));
 await build({entryPoints:[path.join(root,'website/games/random.ts')],outfile:path.join(out,'random/random.js'),bundle:true,format:'esm',minify:true,define:{GAME_SLUGS:JSON.stringify(games.map(g=>g.slug))},logLevel:'warning'});
 await writeFile(path.join(out,'random/index.html'),head('A random game · Worldlet Games','Opens a different small game each time.','/games/random/','<script type="module" src="/games/random/random.js"></script>')+
  `<body class="games-page"><main class="games-list"><p>Picking a game…</p><noscript><p><a href="/games/">Choose a game</a></p></noscript></main></body></html>`);
 const cards=games.map(g=>`<li><a href="/games/${g.slug}/" data-game="${g.slug}"><strong>${esc(g.title)}</strong><span>${esc(g.blurb)}</span></a></li>`).join('');
 await writeFile(path.join(out,'index.html'),head('Games · Worldlet',`${games.length} small games made for Worldlet. No account, nothing to install.`,'/games/','')+
  `<body class="games-page"><main class="games-list"><header><div><h1>Games</h1><p>${games.length} small games made for Worldlet. No account, nothing to install.</p></div><a class="game-button primary" href="/games/random/">Play a random game</a></header><ul class="games-grid">${cards}</ul></main></body></html>`);
 return games;
}
// `node scripts/build-games.ts <dir> [slug…]` builds just the games (with the brand files
// from a built site) into <dir>, for working on a few games without rebuilding the site.
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [dir,...only]=process.argv.slice(2),root=fileURLToPath(new URL('../',import.meta.url));
 if(!dir)throw Error('Usage: node scripts/build-games.ts <dir> [slug…]');
 await cp(path.join(root,'dist/web/brand'),path.join(dir,'brand'),{recursive:true});
 const built=await buildGames(root,dir,only);console.log(`Built ${built.length} games → ${dir}/games`);
}
