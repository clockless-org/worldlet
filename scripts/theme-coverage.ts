// Prints how much of the World each registered theme draws itself: `npm run theme:coverage`.
// The record each pack keeps (resources/themes/<id>/coverage.json) is enforced by scripts/theme-pack-check.ts.
import {THEMES,DEFAULT_THEME_ID} from '../ui/themes/index.ts';
import {THEME_PARTS,themeCoverage,type CoverageInput} from '../ui/themes/theme-coverage.ts';
import {pathToFileURL} from 'node:url';

export async function coverageInput(id:string):Promise<CoverageInput>{
 const entry=THEMES.get(id);if(!entry)throw Error('Unknown theme: '+id);
 return {pack:entry.pack,style:entry.style.manifest as any,world:entry.world as any,reference:DEFAULT_THEME_ID};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const names=Object.fromEntries(THEME_PARTS);
 for(const id of process.argv.slice(2).length?process.argv.slice(2):[...THEMES.keys()]){
  const coverage=themeCoverage(await coverageInput(id)),rows=Object.entries(coverage);
  console.log(`\n${THEMES.get(id)!.pack.title}: ${rows.filter(([,c])=>c.state==='own').length} of ${rows.length} parts its own`);
  for(const [surface,c] of rows)console.log(`  ${c.state.padEnd(8)} ${names[surface].padEnd(72)} ${c.detail}`);
 }
}
