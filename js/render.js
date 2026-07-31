// Which render is current.
//
// Every view is async, and several re-render themselves when a promise settles
// — a sync finishing, an entry saving, a move being starred. They all draw into
// the one `#view` node the router reuses, so a continuation that lands *after*
// the user has navigated away used to destroy whatever screen they were on: a
// sync settling while you typed up a class replaced the half-written form with
// the dashboard, URL still reading `#/log`.
//
// The router bumps this on every route. An async continuation takes a token
// before it awaits and checks it before it touches the DOM:
//
//   const token = renderToken();
//   const result = await somethingSlow();
//   if (!isCurrent(token)) return;      // the user has moved on; leave it alone
//
// This lives in its own module rather than in app.js so views can import it
// without creating a cycle back through the router.

let renderId = 0;

/** Take a token for the render you are currently drawing. */
export const renderToken = () => renderId;

/** Is that token still the screen the user is looking at? */
export const isCurrent = token => token === renderId;

/** Called by the router only: everything in flight for the old screen, stand down. */
export const beginRender = () => ++renderId;
