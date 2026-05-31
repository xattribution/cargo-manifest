// Per-line mission colour. 10 solid matte colours (SC tracks up to 10 missions at once).
// Direct port; missionFg picks dark/cream text by perceived luminance.

export const MISSION_COLORS = [
  '#5f7f99', '#b35a44', '#c69a4f', '#7e9b66', '#4f8389',
  '#bd7a45', '#806a93', '#b09a72', '#6e8190', '#a85b63',
];

export function missionColor(n: number): string {
  const m = Math.max(1, Math.min(10, parseInt(String(n)) || 1));
  return MISSION_COLORS[(m - 1) % MISSION_COLORS.length];
}

export function missionFg(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0, 2), 16);
  const g = parseInt(c.substr(2, 2), 16);
  const b = parseInt(c.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.52 ? '#1a1f26' : '#f3ede1';
}
