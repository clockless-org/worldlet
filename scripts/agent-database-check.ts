import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openAgentDatabase} from '../platform/host/modules/companion/agent/agent-database.ts';
import {withTempDir} from './test-temp.ts';

// An Agent's own database is read in a reader process (platform/host/modules/companion/agent/agent-database.ts):
// the same rows and errors as an in-process read, and a `-shm` truncated under the reader by a program that ignores
// this computer's locks ends only the reader, not this process; the next read starts a new one.

await withTempDir('worldlet-agent-database-',async directory=>{
 const file=path.join(directory,'state.db');
 const writer=new DatabaseSync(file);
 writer.exec("PRAGMA journal_mode=WAL; CREATE TABLE messages(id INTEGER PRIMARY KEY, text TEXT, data BLOB); INSERT INTO messages(text,data) VALUES('hello',x'0102'),(NULL,NULL);");

 const db=openAgentDatabase(file);
 db.exec('PRAGMA trusted_schema=OFF');
 const rows=db.prepare('SELECT * FROM messages WHERE id>=? ORDER BY id');
 assert.deepEqual(rows.all(1).map(row=>({...(row as object)})),[{id:1,text:'hello',data:new Uint8Array([1,2])},{id:2,text:null,data:null}]);
 assert.equal(rows.get(9),undefined);
 assert.deepEqual([...rows.iterate(2)].map(row=>(row as {id:number}).id),[2]);
 assert.throws(()=>db.prepare('SELECT missing FROM messages'),/no such column/);
 assert.throws(()=>db.exec('DELETE FROM messages'),/readonly|read-only/i,'the reader opens read-only');
 writer.exec("INSERT INTO messages(text) VALUES('later')");
 assert.equal((db.prepare('SELECT count(*) AS n FROM messages').get() as {n:number}).n,3,'a write in the WAL is seen');
 console.log('PASS an Agent database reads rows, blobs, nulls, errors and new WAL writes through the reader process, read-only.');

 // What another program that does not see this computer's locks does: it believes it is the first reader and cuts the
 // -shm file to nothing while the reader has it mapped. Reading the mapping then faults; only the reader may end.
 // Windows refuses to cut a file that is mapped, so there the fault cannot happen.
 if(process.platform==='win32'){db.close();writer.close();return;}
 fs.truncateSync(file+'-shm',0);
 assert.throws(()=>rows.all(1),/reader stopped \(SIGBUS\)/,'the read under the truncated -shm fails instead of ending this process');
 assert.throws(()=>rows.all(1),/closed/,'handles of an ended reader stay closed');
 db.close();
 const again=openAgentDatabase(file);
 assert.equal((again.prepare('SELECT count(*) AS n FROM messages').get() as {n:number}).n,3);
 again.close();
 assert.throws(()=>again.prepare('SELECT 1'),/closed/);
 writer.close();
 console.log('PASS a -shm truncated under the reader ends only the reader; the next read opens a new one.');
});
