/** Bounded local diagnostic categories, not user/task content or new states. */
export const FOX_ANIMATION_PHASES=['handling','blend','performing','settled','reduced'] as const;
export type FoxAnimationPhase=typeof FOX_ANIMATION_PHASES[number];
export function foxAnimationPhase(value:unknown):FoxAnimationPhase|'unclassified'{
 return FOX_ANIMATION_PHASES.includes(value as FoxAnimationPhase)?value as FoxAnimationPhase:'unclassified';
}
