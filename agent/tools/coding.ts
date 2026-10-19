import {tool} from './schema.ts';
export const codexTools=[
 tool('delegate_codex','Mac only. Delegate an explicitly requested coding task to the user’s local Codex CLI. Produces source files in a separate local task folder, never executes generated code or edits original context. Include only note IDs already read in this turn; their excerpts are supplied by Worldlet. Returns a durable task ID. Never use for ordinary context management.',{
  title:{type:'string',minLength:1,maxLength:100},task:{type:'string',minLength:1,maxLength:2000},note_ids:{type:'array',items:{type:'string'},maxItems:3},
 }),
 tool('list_codex_tasks','Mac only. List recent delegated coding tasks and their real status. No new work is started.'),
 tool('read_codex_task','Mac only. Read a delegated task result, source-file names and validation status.',{id:{type:'string'}}),
 tool('show_codex_task','Mac only. Reveal a completed task folder in Finder when the user asks to see its files. Does not run its code.',{id:{type:'string'}}),
];
