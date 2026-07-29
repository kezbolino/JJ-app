// Look-and-feel preferences: the brand face and the button style, set in
// Settings and applied as data attributes on <html> (the CSS keys off
// `data-font` / `data-btn`). Device-local like focuses and liked moves —
// stored in localStorage, not synced. Empty string = the default (no
// attribute): Nunito, chunky buttons.

const FONT_KEY = 'jj-font';
const BTN_KEY = 'jj-btn';

// [value, label] — value '' is the default. Keep in step with the
// html[data-font=…] / html[data-btn=…] hooks in css/app.css.
export const FONTS = [['', 'Nunito'], ['system', 'System'], ['serif', 'Serif'], ['mono', 'Mono']];
export const BUTTON_STYLES = [['', 'Chunky'], ['ios', 'iOS']];

export function getFont() { return localStorage.getItem(FONT_KEY) || ''; }
export function getButtonStyle() { return localStorage.getItem(BTN_KEY) || ''; }

export function setFont(value) {
  if (value) localStorage.setItem(FONT_KEY, value); else localStorage.removeItem(FONT_KEY);
  apply();
}
export function setButtonStyle(value) {
  if (value) localStorage.setItem(BTN_KEY, value); else localStorage.removeItem(BTN_KEY);
  apply();
}

/** Reflect the saved preferences onto <html>. Call once on boot. */
export function apply() {
  const el = document.documentElement;
  const font = getFont();
  const btn = getButtonStyle();
  if (font) el.setAttribute('data-font', font); else el.removeAttribute('data-font');
  if (btn) el.setAttribute('data-btn', btn); else el.removeAttribute('data-btn');
}
