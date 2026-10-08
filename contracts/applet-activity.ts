/** Ephemeral read state, never a second source database. */
export interface AppletActivity {
 turn:string;calls:string[];succeeded:boolean;failed:boolean;summary:string;needsAttention:boolean;count?:number;
 /** Unfinished turns that read this app successfully; they may still describe it. */
 readTurns?:string[];
}
