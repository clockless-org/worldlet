// Local copy only: showing a place's line must never wait for a model or read a source.
// A place with no conversation yet says what Fox can do there. It is not a turn, so it never enters the thread.
const places:Record<string,string>={
 Home:'This is Home, your everyday things. Ask me to find something, add a to-do or plan your day.',
 Work:'This is Work. I can pull together what needs you, draft replies or break a task into steps.',
 Library:'This is the Library. Ask me to find a note or a saved page, or to summarize something you kept.',
 Money:'This is Money. I can go through bills, subscriptions and receipts, and flag anything that looks off.',
 Health:'This is Health. I can keep track of appointments and help you book or move one.',
 Travel:'This is Travel. I can gather your bookings, check times and help plan a trip.',
 Explore:'This is Explore. Tell me what you’re curious about and I’ll look around with you.',
 Social:'This is Social. I can catch you up on what friends and communities posted, or help you write a reply.',
 Entertainment:'This is Entertainment. Tell me what you’re in the mood for and I’ll find something to watch or play.',
 Games:'This is Games. Pick one and play; I’ll be here when you’re done.',
 '2048':'This is 2048. Slide the tiles and merge equal numbers.',
 Snake:'This is Snake. Steer with the arrow keys and eat the apples.',
 Minesweeper:'This is Minesweeper. Your first dig is always safe.',
 Sudoku:'This is Sudoku. Every row, column and box holds 1 to 9.',
 'Random game':'This is the Random game. Every visit is a different little game.',
 Mail:'This is your Mail. I can summarize what’s new, find a message or draft a reply.',
 Gmail:'This is your Gmail. I can summarize what’s new, find a message or draft a reply.',
 Calendar:'This is your Calendar. Ask me what’s coming up, find a free slot or add an event.',
 'Google Calendar':'This is your Calendar. Ask me what’s coming up, find a free slot or add an event.',
 Notes:'These are your Notes. I can find a note, summarize one or start a new one.',
 Reminders:'These are your Reminders. I can add one, tell you what’s due or tidy the list.',
 YouTube:'This is YouTube. Tell me what you’d like to watch and I’ll find it.',
 Browser:'This is the Browser. Tell me where to go, or ask me to do something on a website for you.',
 Codex:'This is Codex. Describe a change and I’ll work through the code with you.',
 GitHub:'This is GitHub. I can check your pull requests and issues and find the next step.',
 Meetings:'These are your Meetings. I can prepare notes for the next one or recap the last.',
 Weather:'This is the Weather. Ask me about today, the week ahead or a trip.',
 'Voice Memos':'These are your Voice Memos. I can find a recording or summarize one.',
 Notion:'This is Notion. I can find a page, summarize it or add to it.',
};
const clean=(text?:string)=>String(text||'').replace(/[\\`*_{}\[\]()<>#|]/g,'').replace(/\s+/g,' ').trim();
export function foxGreeting(context:{key?:string;title?:string},applet?:string,view?:{id?:string;title?:string}){
 if(context.key==='overview:desktop')return 'I’m here on your desktop. Ask me anything, or open your world to work in a place.';
 // Name only the visible selection; never pretend to have read its contents.
 const title=clean(view?.title).slice(0,160);
 if(view?.id&&title&&title!==applet)return `You’re looking at “${title}”. I can summarize it, find related things or act on it.`;
 if(applet)return places[applet]||`This is ${clean(applet)}. Ask me about what’s here, or tell me what you’d like to do in it.`;
 if(context.key?.split(':')[0]==='overview')return 'This is your world. Ask me anything, or open a place and we’ll work in it together.';
 return places[context.title||'']||`This is ${clean(context.title)||'here'}. Tell me what you’d like to do.`;
}
