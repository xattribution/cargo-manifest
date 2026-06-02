// Small persisted UI preferences (not part of the run/catalog data).
const TABDIR_KEY = 'cargo:webapp:tabDir';

function initTabDir(): 'down' | 'right' {
  try { const v = localStorage.getItem(TABDIR_KEY); if (v === 'down' || v === 'right') return v; } catch { /* ignore */ }
  return 'down'; // vertical-first by default (matches manifest data-entry)
}

function createPrefs() {
  let tabDir = $state<'down' | 'right'>(initTabDir());
  return {
    get tabDir() { return tabDir; },
    toggleTabDir() {
      tabDir = tabDir === 'down' ? 'right' : 'down';
      try { localStorage.setItem(TABDIR_KEY, tabDir); } catch { /* ignore */ }
    },
  };
}

export const prefs = createPrefs();
