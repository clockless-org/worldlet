/** One public state vocabulary. Production readiness is explicit, never inferred from a name. */
export type FoxStateGroup='conversation'|'work'|'coordination'|'life'|'interaction';
export type FoxStateSpec={id:string;group:FoxStateGroup;label:string;trigger:string;performance:string;mode:'hold'|'brief';seconds:number;art:'existing'|'key-pose'|'needed'};
const state=(id:string,group:FoxStateGroup,label:string,trigger:string,performance:string,mode:'hold'|'brief'='hold',seconds=8,art:FoxStateSpec['art']='needed'):FoxStateSpec=>({id,group,label,trigger,performance,mode,seconds,art});
export const FOX_STATES:readonly FoxStateSpec[]=Object.freeze([
 state('idle','conversation','At ease','No foreground task or input','Chest breath; occasional weight change; tail settles after shoulders.','hold',12,'existing'),
 state('greeting','conversation','Greeting','Appropriate entry or preview','Notice, a small hop, lean in with a big raised-paw wave, soft paw return.','brief',2.6,'key-pose'),
 state('listening','conversation','Listening','Voice capture or composer engagement','Forward lean, one ear leads, attentive stillness between small responses.'),
 state('acknowledging','conversation','Understood','Request actually accepted','Paw to chest and one precise nod, continuing into the task.','brief',1.2),
 state('thinking','conversation','Thinking','Real processing; no known work subtype','Paw under chin, shifted weight, quiet gaze; isolated ear response.','hold',9,'key-pose'),
 state('explaining','conversation','Explaining','Reply presentation or speech','Open paw, measured gestures and meaningful pauses; speech-only mouth motion.','hold',8,'key-pose'),
 state('reading','work','Reading','Explicit content inspection','Hold page, track a line, turn a corner, pause and look up.','hold',9,'key-pose'),
 state('searching','work','Searching','Foreground search','Lean to inspect, scan with head then body, examine through a small lens.'),
 state('comparing','work','Comparing','Explicit comparison phase','Compare two screen regions, shift gaze and shoulder weight, revisit the first before pausing.'),
 state('planning','work','Planning','Explicit planning phase','Consider the screen, place an item, pause, revise its position and review.'),
 state('drafting','work','Writing','Writing phase','Two unequal writing bursts at the keyboard, pause and reread the screen.','hold',8,'key-pose'),
 state('calculating','work','Calculating','Calculation tool/phase','Three grouped key taps, deliberate calculation pause, cross-check and a final input.'),
 state('organizing','work','Organizing','Filing/classification phase','Select, move and group items at the desk; both paws settle before review.'),
 state('creating','work','Creating','Creative production phase','Long input sweep, lean back to inspect, then a small precise adjustment.'),
 state('working','work','Working','Known execution or generic work','Alternating paw bursts at a small work surface, shoulders follow; inspection pauses.','hold',8,'key-pose'),
 state('checking','work','Checking','Verification phase','Inspect successive screen regions, pause over a detail, then recheck without signaling success.'),
 state('awaiting_user','coordination','Your turn','Approval or missing input','Stop work, offer an open paw toward the real control, then wait quietly.'),
 state('awaiting_service','coordination','Waiting for a result','Known external operation pending','Set tool down, glance toward work once, remain patient and alert.'),
 state('notifying','coordination','A reminder','Eligible unseen actionable reminder','Straighten and raise one paw once toward the real item.','brief',2.4),
 state('urgent','coordination','Needs attention','Highest urgency under existing attention policy','Pop up with a hop, wave both paws high, stand tall and attentive.'),
 state('succeeded','coordination','Done','Verified foreground success','Jump with both paws thrown up, a second small bounce, eye-smile landing and tail swishes.','brief',2.8),
 state('blocked','coordination','Needs help','Actual failure or missing capability','Pause, inspect unfinished work, turn to user with an open paw.'),
 state('looking','life','Looking around','Rare eligible idle variation','Trot a few steps in place, stop, then look left and right with the body leaning after the head.','brief',4.2),
 state('grooming','life','Tidying up','Rare extended idle','Brush chest fur or straighten scarf; inspect and plant paw.','brief',4.4),
 state('stretching','life','Stretching','Wake or rare idle adjustment','Rise tall with both paws reaching overhead, back long, eyes closed; ears and tail trail.','brief',3.6),
 state('yawning','life','Yawning','Eligible transition to rest','Inhale, raise shoulders, close eyes and cover the yawn with a paw; exhale and plant it.','brief',3),
 state('sleeping','life','Sleeping','Sustained idle; no task or approval','Settle on planted paws, lower the head, close eyes; slow breathing and a rare ear response.','hold',10),
 state('waking','life','Waking','Activity during rest','Ear reacts, eyes open, head rises, then a full-body shake.','brief',2.2),
 state('pickup','interaction','Being moved','Drag threshold crossed','Lifted: legs paddle in the air, body swings, tail and scarf trail.'),
 state('settle','interaction','Settling','Drag released','Ground contact, light shoulder compression, damped recovery.','brief',.8),
 state('delighted','interaction','Delighted','Explicit positive interaction or preview','Three springy hops with paws up and wiggling, eye smile, tail wagging hard.','brief',3.2),
 state('farewell','interaction','Goodbye','Explicit departure','Big leaning goodbye wave, a little hop and a bow.','brief',2.6),
].map(spec=>Object.freeze(spec)));

export const FOX_STATE_ALIASES:Readonly<Record<string,string>>=Object.freeze({waving:'greeting',talking:'explaining',happy:'succeeded',satisfied:'succeeded',writing:'listening',preparing:'thinking',transcribing:'thinking',local:'idle'});
export function foxState(id:string):FoxStateSpec|undefined{return FOX_STATES.find(s=>s.id===(FOX_STATE_ALIASES[id]||id));}
