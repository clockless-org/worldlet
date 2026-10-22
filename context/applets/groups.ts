import {CURATED_READERS} from './curated-source.ts';
/** Named Applet key groups that share presentation or reader behavior. */
export const HOME_NATIVE:readonly string[]=['gmail','google-calendar','apple-notes','apple-reminders'];
/** Home Applets whose records open on a paper leaf instead of the mail reader. */
export const HOME_RECORDS:readonly string[]=['google-calendar','apple-notes','apple-reminders'];
export const CODING_SESSIONS:readonly string[]=['codex','claude-code'];
export const MONEY_READERS:readonly string[]=['stripe','paypal'];
/** Applets that open a read-only original from their connected source. */
export const ORIGINAL_READERS:readonly string[]=['notion','obsidian',...MONEY_READERS,...CURATED_READERS];
