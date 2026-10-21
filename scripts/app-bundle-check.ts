import assert from 'node:assert/strict';
import fs from 'node:fs';
import {macAppBundle} from '../platform/host/modules/app/app-bundle.ts';

// The Mac updater and the default browser setting find the app bundle from the executable (#743: a folder move
// rewrote '../../..' to '../../../desktop', so the updater's bundle no longer ended in .app and turned itself off).
assert.equal(macAppBundle('/Applications/Worldlet.app/Contents/MacOS/Worldlet'),'/Applications/Worldlet.app');
assert.ok(macAppBundle('/Users/alex/Downloads/Worldlet Alpha.app/Contents/MacOS/Worldlet Alpha').endsWith('.app'));
for(const file of ['platform/host/modules/app/updates.ts','platform/host/modules/app/default-browser.ts']){
 const source=fs.readFileSync(file,'utf8');
 assert.match(source,/macAppBundle\(process\.execPath\)/,`${file} finds the app bundle with macAppBundle`);
 assert.doesNotMatch(source,/execPath,\s*'\.\.\//,`${file} names no relative path from the executable by hand`);
}
console.log('PASS app bundle: the Mac updater and default browser setting find Worldlet.app from the executable');
