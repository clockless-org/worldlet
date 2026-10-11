// Shell fixes (ui/shell/notion-world.ts): a table's filter keeps its own text, so filtering a table never
// changes the note-search query that Back returns to; a World update reads the saved Applet layout once;
// and the unused release-notes list stays removed.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
const world=readFileSync(new URL('../ui/shell/notion-world.ts',import.meta.url),'utf8');
const table=world.slice(world.indexOf('function renderTable('),world.indexOf('function renderPage('));
assert.ok(table.length>0,'renderTable is present');
assert.doesNotMatch(table,/\bquery\b/,'the table filter must not read or write the shared note-search query');
assert.match(table,/input\.oninput=\(\)=>\{filter=input\.value;draw\(\)\}/,'the table filter keeps its own text');
const apply=world.slice(world.indexOf('function applyWorld('));
const update=apply.slice(0,apply.indexOf('saveRegions();'));
assert.equal(update.match(/loadSampleLayout\(\)/g)?.length,1,'a World update loads the saved Applet layout once');
assert.ok(!existsSync(new URL('../ui/shell/release-notes.ts',import.meta.url)),'the unused release notes file stays removed');
assert.doesNotMatch(readFileSync(new URL('../ui/shell/index.ts',import.meta.url),'utf8'),/RELEASE_NOTES/);
console.log('shell fixes check passed');
