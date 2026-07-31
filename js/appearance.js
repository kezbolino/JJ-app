// Look-and-feel preferences: the brand face, the button style and the theme,
// set in Settings and applied as data attributes on <html> (the CSS keys off
// `data-font` / `data-btn` / `data-theme`). Device-local like focuses and liked
// moves — stored in localStorage, not synced. Empty string = the default (no
// attribute): Nunito, chunky buttons, and the theme the OS asks for.

const FONT_KEY = 'jj-font';
const BTN_KEY = 'jj-btn';
const THEME_KEY = 'jj-theme';

// [value, label] — value '' is the default. Keep in step with the
// html[data-font=…] / html[data-btn=…] / :root[data-theme=…] hooks in
// css/app.css.
export const FONTS = [['', 'Nunito'], ['system', 'System'], ['serif', 'Serif'], ['mono', 'Mono']];
export const BUTTON_STYLES = [['', 'Chunky'], ['ios', 'iOS']];
export const THEMES = [['', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];

export function getFont() { return localStorage.getItem(FONT_KEY) || ''; }
export function getButtonStyle() { return localStorage.getItem(BTN_KEY) || ''; }
export function getTheme() { return localStorage.getItem(THEME_KEY) || ''; }

const store = (key, value) => {
  if (value) localStorage.setItem(key, value); else localStorage.removeItem(key);
  apply();
};

export const setFont = value => store(FONT_KEY, value);
export const setButtonStyle = value => store(BTN_KEY, value);
export const setTheme = value => store(THEME_KEY, value);

/** Reflect the saved preferences onto <html>. Call once on boot. */
export function apply() {
  const el = document.documentElement;
  for (const [attr, value] of [
    ['data-font', getFont()],
    ['data-btn', getButtonStyle()],
    ['data-theme', getTheme()],
  ]) {
    if (value) el.setAttribute(attr, value); else el.removeAttribute(attr);
  }
}
