-- History identity (core/items/world-history.ts worldEventAppend). Not unique:
-- legacy rows may already repeat an id; new appends skip an existing identity.
CREATE INDEX IF NOT EXISTS entries_event_identity ON entries(kind,key,json_extract(body,'$.id'));
-- Additive, read-only business views over the single durable ledger.
-- Current state is the newest revision per (kind, key), not per key alone.
CREATE VIEW IF NOT EXISTS world_state AS
 SELECT seq,at,substr(kind,7) AS bucket,key,body FROM entries
 WHERE kind LIKE 'state.%'
 AND seq IN (SELECT MAX(seq) FROM entries WHERE kind LIKE 'state.%' GROUP BY kind,key);
CREATE VIEW IF NOT EXISTS attention_items AS SELECT * FROM world_state WHERE bucket='items';
CREATE VIEW IF NOT EXISTS attention_reviews AS SELECT * FROM world_state WHERE bucket='reviews';
CREATE VIEW IF NOT EXISTS attention_context AS SELECT * FROM world_state WHERE bucket='attention-context';
CREATE VIEW IF NOT EXISTS attention_budget AS SELECT * FROM world_state WHERE bucket='attention-budget';
CREATE VIEW IF NOT EXISTS source_checks AS SELECT * FROM world_state WHERE bucket='checks';
CREATE VIEW IF NOT EXISTS execution_runs AS SELECT * FROM world_state WHERE bucket='runs';
CREATE VIEW IF NOT EXISTS world_history AS SELECT seq,at,kind,key,body FROM entries WHERE kind NOT LIKE 'state.%';

-- Formal library state. JSON bodies preserve portable fields; indexed columns
-- make identity, provenance and processing versions explicit.
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, revision TEXT NOT NULL, body TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
 source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
 source_revision TEXT NOT NULL, processing_version TEXT NOT NULL,
 body TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_source_version ON knowledge(source_id,source_revision,processing_version);
CREATE TABLE IF NOT EXISTS library_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
