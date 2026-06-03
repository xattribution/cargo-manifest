// Small persisted UI preferences (not part of the run/catalog data).
const TABDIR_KEY = 'cargo:webapp:tabDir';
const SIDEBAR_KEY = 'cargo:webapp:sidebarCollapsed';
const MISSIONDEL_KEY = 'cargo:webapp:skipMissionDeleteWarn';

function readBool(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function writeBool(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ }
}

function initTabDir(): 'down' | 'right' {
  try { const v = localStorage.getItem(TABDIR_KEY); if (v === 'down' || v === 'right') return v; } catch { /* ignore */ }
  return 'down'; // vertical-first by default (matches manifest data-entry)
}

function createPrefs() {
  let tabDir = $state<'down' | 'right'>(initTabDir());
  let sidebarCollapsed = $state(readBool(SIDEBAR_KEY));
  let skipMissionDeleteWarn = $state(readBool(MISSIONDEL_KEY));
  return {
    get tabDir() { return tabDir; },
    toggleTabDir() {
      tabDir = tabDir === 'down' ? 'right' : 'down';
      try { localStorage.setItem(TABDIR_KEY, tabDir); } catch { /* ignore */ }
    },
    get sidebarCollapsed() { return sidebarCollapsed; },
    toggleSidebar() { sidebarCollapsed = !sidebarCollapsed; writeBool(SIDEBAR_KEY, sidebarCollapsed); },
    // "Don't remind me again" for the mission-delete confirmation
    get skipMissionDeleteWarn() { return skipMissionDeleteWarn; },
    setSkipMissionDeleteWarn(v: boolean) { skipMissionDeleteWarn = v; writeBool(MISSIONDEL_KEY, v); },
  };
}

export const prefs = createPrefs();
