// Prints how much of the World each registered theme draws itself: `npm run theme:coverage`.
// The record each pack keeps (resources/themes/<id>/coverage.json) is enforced by scripts/theme-pack-check.ts.
import {THEMES,DEFAULT_THEME_ID} from '../ui/themes/index.ts';
import {THEME_SURFACES,themeCoverage,type CoverageInput} from '../ui/themes/theme-coverage.ts';
import {FOX_STATES} from '../ui/companion/fox-state-catalog.ts';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export async function coverageInput(id:string):Promise<CoverageInput>{
 const entry=THEMES.get(id);if(!entry)throw Error('Unknown theme: '+id);
 const rig=entry.pack.companion.renderer==='sprite-rig'?JSON.parse(await readFile(entry.pack.companion.rig,'utf8')):null;
 const performanceStates=FOX_STATES.map(s=>s.id);
 return {pack:entry.pack,style:entry.style.manifest as any,world:entry.world as any,reference:DEFAULT_THEME_ID,performanceStates,rigFrames:rig?.frames?.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const names=Object.fromEntries(THEME_SURFACES);
 for(const id of process.argv.slice(2).length?process.argv.slice(2):[...THEMES.keys()]){
  const coverage=themeCoverage(await coverageInput(id)),rows=Object.entries(coverage);
  console.log(`\n${THEMES.get(id)!.pack.title}: ${rows.filter(([,c])=>c.state==='own').length} of ${rows.length} surfaces its own`);
  for(const [surface,c] of rows)console.log(`  ${c.state.padEnd(8)} ${names[surface].padEnd(42)} ${c.detail}`);
 }
}
