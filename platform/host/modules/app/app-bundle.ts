import path from 'node:path';

/** The Mac app bundle holding an executable: `Worldlet.app/Contents/MacOS/Worldlet` → `Worldlet.app`. The updater
 * installs into it and the default browser setting compares it with the system's handler. A folder move (#729)
 * once rewrote the hand-written `'../../..'` to `'../../../desktop'`, which turned the Mac updater off from Build
 * 4564 on (#743); scripts/app-bundle-check.ts keeps both callers on this one helper.
 * Mac paths, so POSIX rules on every OS: the check also runs on Windows (#754). */
export const macAppBundle=(executable:string)=>path.posix.resolve(executable,'../../..');
