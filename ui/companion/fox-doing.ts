// What Fox is doing, said the way a person would say it.
//
// Hermes already names the tool it is about to run. The interface used to throw
// that away and show "Using tools…" for all of them, which is both the most
// technical phrasing available and the least informative: it is the same words
// whether Fox is reading your mail or putting a note in the trash.
//
// Anything not named here falls back to a plain phrase rather than the raw tool
// name, because "Upsert world items" is worse than saying nothing specific.
const DOING = {
 inspect_world:'Looking around the world',
 find_content:'Looking for it',
 visit_place:'Going there',
 visit_context:'Going there',
 move_view:'Looking around',
 open_content:'Opening it',
 read_content:'Reading it',
 read_content_page:'Reading the page',
 create_content:'Writing it down',
 patch_content:'Making the change',
 delete_content:'Moving it to the trash',
 list_deleted:'Looking in the trash',
 restore_content:'Putting it back',
 undo_content:'Undoing that',
 read_world_source:'Reading your account',
 query_world_items:'Checking what is waiting',
 upsert_world_items:'Saving what matters',
 review_world_item:'Taking another look',
 update_world_item:'Marking it',
 archive_world_items:'Clearing those',
 configure_world_check:'Setting when to check',
 read_world_history:'Looking back at what happened',
 browse_web:'Opening the page',
 automate_browser:'Working in the browser',
 perform_action:'Doing it',
 use_stripe_crm:'Checking payments',
 use_youtube:'Finding the video',
 control_background_music:'Changing the sound',
 control_local_music:'Controlling your music',
 open_worldlet_controls:'Opening settings',
 set_worldlet_preference:'Changing that setting',
 delegate_codex:'Handing it to Codex',
 list_codex_tasks:'Checking on Codex',
 read_codex_task:'Checking on Codex',
 show_codex_task:'Checking on Codex',
 make_game:'Handing it to the Game Factory',
 list_made_games:'Looking at your games',
 save_game:'Trying the game',
 read_made_game:'Reading the game',
 make_applet:'Making a new Applet',
 list_made_applets:'Looking at the Applets I made',
 save_applet:'Trying the new Applet',
 read_applet:'Reading the Applet',
 update_applet_data:'Updating the Applet',
 read_applet_data:'Reading the Applet'
};
// Hermes' own tools are named by family rather than one by one: it owns them and
// renames them, and a stale exact match would read as a lie.
const FAMILIES: [RegExp, string][] = [
 [/memory|recall|remember/,'Checking what it remembers'],
 [/skill/,'Using a saved skill'],
 [/session|conversation|history/,'Looking through earlier conversations'],
 [/search|find|query|lookup/,'Looking it up'],
 [/web|http|fetch|url|browse/,'Reading the web'],
 [/file|read|open/,'Reading it'],
 [/write|edit|patch|update|save/,'Writing that down']
];
export const FOX_WORKING = 'working';

/** A step Fox said in words, as a line of its own: one line, capitalized, without a closing stop. */
export function foxStepWords(step:string){
 const line=String(step).replace(/\s+/g,' ').trim().replace(/[.。]+$/,'').slice(0,72);
 return line.charAt(0).toUpperCase()+line.slice(1);
}
export function foxDoing(name,args:any={}) {
 const key = String(name || '').trim();
 if (!key) return 'Working on it';
 if(key==='browse_web'||key==='automate_browser'){
  const action=String(args.action||args.operation||'');
  // Steps said in words (`do`) are their own plain words: "Click Add to cart".
  if(action==='do'){const first=(Array.isArray(args.steps)?args.steps:[args.step]).find((step:unknown)=>typeof step==='string'&&step.trim());if(first)return foxStepWords(first);}
  if(args.url){try{const url=new URL(args.url);if(['http:','https:'].includes(url.protocol))return 'Opening '+url.hostname.replace(/^www\./,'');}catch{}}
  const steps={records:'Looking through what happened in the browser',record:'Reading what the browser recorded',snapshot:'Reading the page',click:'Selecting on the page',fill:'Filling in the form',type:'Entering text',scroll:'Checking further down',wait:'Waiting for the page',back:'Returning to the previous page',outline:'Looking over the page',focus:'Hiding what distracts'};
  if(steps[action])return steps[action];
 }

 if (DOING[key]) return DOING[key];
 const lower = key.toLowerCase();
 for (const [pattern, phrase] of FAMILIES) if (pattern.test(lower)) return phrase;
 return 'Looking that up';
}
