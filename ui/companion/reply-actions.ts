// Deliberately finite: model text cannot name arbitrary native methods or arguments.
// scripts/build-hermes.ts emits the same IDs into tools.json for the Hermes prompt.
const actions={};
for(const track of ['ocean','rain','forest','village'])actions['ambience.'+track]={method:'backgroundMusic',args:{channel:'ambience',operation:'play',track}};
for(const channel of ['music','ambience'])for(const operation of ['play','pause','resume','stop','quieter','louder'])actions[channel+'.'+operation]={method:'backgroundMusic',args:{channel,operation}};
actions['music.next']={method:'backgroundMusic',args:{channel:'music',operation:'next'}};
for(const screen of ['sources','model','voice','world'])actions['open.'+screen]={method:'foxControls',args:{screen}};
// Checks, downloads and installs the newest release, as the dock's Update button does.
actions['app.update']={method:'appUpdate',args:{operation:'update'}};
export const replyActionIds=Object.freeze(Object.keys(actions));
export function replyAction(href){
 if(typeof href!=='string'||!href.startsWith('#fox-action='))return null;
 const key=href.slice('#fox-action='.length);
 return Object.hasOwn(actions,key)?structuredClone(actions[key]):null;
}

// Shared identity lets the bubble and dock suppress the same next step.
export function replyActionIdentity(href){
 if(href==='#fox-action=open.sources')return 'utility:connect';
 return href;
}
