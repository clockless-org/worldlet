// A follow-up on an Artifact runs in the background (owner request 2026-10-11: "artifact 如果用户说哎接着要做一个什么事儿，
// 那他就是转动一下，转到背面，然后到下方相当于 dock 的位置，小狐狸左右两边，让他去自己去这个后台运行"). One of the card's next
// steps drafts its request in Fox's message bar (README.md#actions); when the person sends it while the card is still
// open, the card turns over and drops into the Doing now side beside Fox, and the request runs in a background session
// beside the conversation. What it makes comes back as a new Artifact. Anything else the person types stays a turn of
// the conversation, so a question about the card is never mistaken for a task.

/** The next step the person picked on an open card, until they send it, clear the bar or the card closes. */
export type ArtifactFollowUpDraft={id:string;title:string;request:string};

const clip=(value:string,limit:number)=>{const chars=[...value.replace(/\s+/g,' ').trim()];return chars.length>limit?chars.slice(0,limit-1).join('').trimEnd()+'…':chars.join('');};

/** Whether this send is the card's follow-up: a next step was picked on this card, the card is still open, and the bar
 * still holds something (the person may have edited the words; they are theirs now). */
export function artifactFollowUpSent(draft:ArtifactFollowUpDraft|null,sent:string,shownId:string|null):boolean {
 return !!draft&&!!sent.trim()&&draft.id===shownId;
}

/** What Fox is asked in the background session, what the archive shows, and the card it gets beside Fox. */
export function artifactFollowUpRequest(draft:ArtifactFollowUpDraft,sent:string){
 const request=sent.trim(),title=clip(draft.title,80)||'a card';
 return {
  text:request+'\n\nThis follows up the card '+JSON.stringify(title)+' (artifact '+JSON.stringify(draft.id)+') that I had open. Do it now in the background with your usual tools and confirmations; I am not watching the conversation meanwhile. '
   +'When it is done, show what you did or made with show_artifact as one card, then reply with one short line saying what it was.',
  displayText:clip(request,200),
  /** Its card beside Fox: the card's title, and what it is doing. */
  name:clip(draft.title,40)||'Follow-up',status:clip(request,80),
 };
}
