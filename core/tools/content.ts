import {tool,string} from './schema.ts';
export const contentTools=[
 tool('create_content','Only when the user explicitly asks to add or record something, save a new local note in the given place. It is shown automatically once saved.',{place_id:string('A place ID from inspect_world'),title:string('A short title, under 100 characters'),body:string('Markdown text. Never invent facts about the user')}),
 tool('patch_content','Only when the user explicitly asks for a change, replace one exact passage or append text. Read it first to get its revision and keep the rest intact.',{id:string('A note ID'),revision:string('The revision returned by read_content'),field:{type:'string',enum:['title','body']},old_text:string('A unique passage of the original. An empty string appends to the body'),new_text:string('The replacement or appended text')}),
 tool('delete_content','Only when the user explicitly asks to delete, move a note without children to the local trash, where it can be restored. Read it first to confirm its ID and revision.',{id:string('A note ID'),revision:string('The current revision')}),
 tool('list_deleted','List the local trash items that can be restored.'),
 tool('restore_content','Only when the user explicitly asks, restore a note from the local trash.',{id:string('A note ID from list_deleted')}),
 tool('undo_content','Only when the user explicitly asks, undo the most recent local add, edit, delete or restore.'),
];
