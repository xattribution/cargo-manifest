// Page theme (light = manila workspace, dark = full charcoal). Persisted to localStorage
// and applied via [data-theme] on <html>, which swaps the CSS custom-property palette.
export type Theme = 'light' | 'dark';
const KEY = 'cargo:webapp:theme';

function initial(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch { /* ignore */ }
  return 'light';
}

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t; // native form controls follow
}

function createTheme() {
  let value = $state<Theme>(initial());
  apply(value);
  return {
    get value() { return value; },
    toggle() {
      value = value === 'dark' ? 'light' : 'dark';
      apply(value);
      try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
    },
  };
}

export const theme = createTheme();
