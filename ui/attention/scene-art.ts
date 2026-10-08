import scenes from '../../resources/styles/builtin/assets/attention/scenes.json' with {type:'json'};

/** The painted scenes' IDs, for a card that names its own (an artifact's `art`). */
export const attentionSceneIds:ReadonlySet<string>=new Set(scenes.map(scene=>scene.id));
// Match only the processed briefing, never raw source bodies. Selection is local,
// deterministic and illustrative: no extra model call or invented event details.
export function attentionSceneArt({title='',reason='',summary='',image='worth-knowing'}){
 const fields=[title,reason,summary].map(value=>String(value).normalize('NFKC').toLocaleLowerCase());
 let best='',bestScore=0;
 for(const scene of scenes){
  let score=0;
  for(const keyword of scene.keywords){
   const escaped=keyword.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const match=new RegExp(/[a-z]/i.test(keyword)?'(?<![a-z])'+escaped+'(?![a-z])':escaped,'u');
   fields.forEach((field,index)=>{if(match.test(field))score=Math.max(score,(3-index)*100+keyword.length);});
  }
  if(score>bestScore){bestScore=score;best=scene.id;}
 }
 return best?'scene-'+best:image;
}
