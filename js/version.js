// The app's visible version — shown in the footer so the user can tell at a
// glance whether their installed PWA has updated to the latest deploy.
//
// Keep this in step with `CACHE` in sw.js: bump both together on every deploy.
// Same value on both is what makes the footer number mean "this is the shell
// you're actually running".
export const VERSION = 'v20';
