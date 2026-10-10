import type {ArtifactFitStep} from '../../core/artifacts/index.ts';
/** An artifact never scrolls (owner Order 2026-10-09; core/artifacts/README.md#fits-its-card): a card draws the steps
 * `artifactFitSteps` lists, fullest first, and keeps the first one that fits `box` without overflowing. The last step
 * (the one-sentence brief) stays even when it does not fit, clipped rather than scrolled. `draw` fills the card for a
 * step; anything else it shows or hides for that step (a Show all button) must be in place before the card measures.
 * The World card, the corner card over an Applet and the Journal's cards all fit this way. */
export function fitArtifact(box:HTMLElement,steps:ArtifactFitStep[],draw:(step:ArtifactFitStep,index:number)=>void):{step:ArtifactFitStep;index:number} {
 let index=0;
 for(;index<steps.length;index++){
  draw(steps[index],index);
  if(box.scrollHeight<=box.clientHeight+1)break;
 }
 index=Math.min(index,steps.length-1);
 box.dataset.fit=steps[index].text;box.dataset.shortened=String(index>0);
 return {step:steps[index],index};
}
