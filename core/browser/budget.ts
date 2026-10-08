import {PAGE_MEMORY,PAGE_RESUME,type MemoryReading} from './page-resume.ts';
import type {BrowserBudget} from '../../contracts/browser-surface.ts';

/**
 * How many website pages stay live at once and how many Fox browser tasks may drive pages at the
 * same time, from the machine's memory (#1176). The host reads its memory and sends the budget with
 * its capabilities; the panel keeps pages live by it (`livePagePlan`).
 * - Live pages are the kept pages and the picture-in-picture window: two below 16 GB of memory,
 *   four from 16 GB and six from 32 GB. Never more than the free memory holds at `perPageMB` each
 *   while `PAGE_MEMORY.minFreeMB` stays free, and never fewer than one.
 * - Fox browser tasks: one below 16 GB, two from 16 GB.
 * - Without a reading (an older host) the budget is the earlier bound: two pages, one task.
 */
export const BROWSER_BUDGET=Object.freeze({
 perPageMB:350,
 tiers:Object.freeze([
  Object.freeze({minTotalMB:0,livePages:PAGE_RESUME.livePages,foxTasks:1}),
  Object.freeze({minTotalMB:16*1024,livePages:4,foxTasks:2}),
  Object.freeze({minTotalMB:32*1024,livePages:6,foxTasks:2})
 ]),
 maxLivePages:6,maxFoxTasks:2
});
export function browserBudget(reading:MemoryReading|null):BrowserBudget {
 const tiers=BROWSER_BUDGET.tiers,base=tiers[0];
 if(!reading||!Number.isFinite(reading.totalMB)||reading.totalMB<=0)return {livePages:base.livePages,foxTasks:base.foxTasks};
 const tier=[...tiers].reverse().find(entry=>reading.totalMB>=entry.minTotalMB)??base;
 const room=Number.isFinite(reading.freeMB)?Math.floor((reading.freeMB-PAGE_MEMORY.minFreeMB)/BROWSER_BUDGET.perPageMB):tier.livePages;
 return {livePages:Math.max(1,Math.min(tier.livePages,room)),foxTasks:tier.foxTasks};
}
/** A budget from a host, within the rule's bounds; anything else is the earlier bound. */
export function readBrowserBudget(value:unknown):BrowserBudget {
 const base=BROWSER_BUDGET.tiers[0],budget=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const count=(item:unknown,max:number,fallback:number)=>typeof item==='number'&&Number.isInteger(item)&&item>=1&&item<=max?item:fallback;
 return {livePages:count(budget.livePages,BROWSER_BUDGET.maxLivePages,base.livePages),foxTasks:count(budget.foxTasks,BROWSER_BUDGET.maxFoxTasks,base.foxTasks)};
}
