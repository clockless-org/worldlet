type Journey={completed?:boolean,journeyStage?:string}|undefined|null;

/** The journey stages of the first-run tour: its first half, then first value (ui/onboarding/README.md). */
export const TOUR_STAGES=['world-tour','first-value','first-value-review','first-value-running','first-value-outcome'] as const;

/** The first-run tour is on: setup is done and the journey has not finished or been skipped. */
export function tourInProgress(onboarding:Journey){
 return onboarding?.completed===true&&(TOUR_STAGES as readonly string[]).includes(String(onboarding.journeyStage||''));
}

/** Onboarding is not over: setup is unfinished or its tour still runs. Until then closing the window
 * quits the app instead of leaving Fox on the desktop (owner request 2026-10-04); the next launch
 * resumes where the person left. */
export function onboardingUnfinished(onboarding:Journey){
 return onboarding?.completed!==true||tourInProgress(onboarding);
}
