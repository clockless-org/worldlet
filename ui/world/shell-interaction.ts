/** The shell's own state a World follows (world-renderer.ts `WorldState.interaction` and `paused`): first use, what
 * covers the World, what the open Applet shows, and whether anyone can see the World. Worlds never read the shell's
 * elements themselves. */
export function shellInteraction(host:HTMLElement){
 const shell=host.closest('.notion-world') as HTMLElement|null;
 return {locked:shell?.getAttribute('data-onboarding-locked')==='true',
  covered:!!document.querySelector('.tour-spotlight:not([hidden])')||shell?.dataset.attentionPreview==='true'||!!shell?.querySelector('dialog[open]'),
  detailOpen:shell?.getAttribute('data-detail-open')==='true',
  website:!!shell?.querySelector('#notionContent[data-template=browser]:not([hidden])')};
}
export const worldPaused=()=>document.documentElement.classList.contains('desktop-companion')||document.hidden;
