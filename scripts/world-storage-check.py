"""Exercise domain views against disposable SQLite state, revisions and deletion."""
from pathlib import Path
import sqlite3
import subprocess
root = Path(__file__).resolve().parents[1]
subprocess.run(['node', 'scripts/world-storage-schema.ts', '--check'], cwd=root, check=True)
with sqlite3.connect(':memory:') as db:
    db.execute('CREATE TABLE entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, at REAL NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, body TEXT NOT NULL)')
    rows = [('state.items', 'same', '{"title":"Old"}'), ('state.checks', 'same', '{"enabled":true}'),
            ('state.items', 'same', '{"title":"New"}'), ('item.opened', 'same', '{}')]
    db.executemany('INSERT INTO entries(at,kind,key,body) VALUES(0,?,?,?)', rows)
    sql = (root / 'contracts/storage/world-views.sql').read_text()
    db.executescript(sql)
    db.executescript(sql) # reopening is additive and idempotent
    assert db.execute('SELECT body FROM attention_items').fetchall() == [('{"title":"New"}',)]
    assert db.execute('SELECT body FROM source_checks').fetchall() == [('{"enabled":true}',)]
    assert db.execute('SELECT COUNT(*) FROM world_history').fetchone()[0] == 1
    assert db.execute('SELECT COUNT(*) FROM entries').fetchone()[0] == 4
    db.execute("DELETE FROM entries WHERE kind='state.items' AND key='same'")
    assert db.execute('SELECT COUNT(*) FROM attention_items').fetchone()[0] == 0
    assert db.execute('SELECT COUNT(*) FROM source_checks').fetchone()[0] == 1
print('PASS domain views preserve history, separate keys by domain, and reflect deletion')
