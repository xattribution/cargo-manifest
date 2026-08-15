// WCAG contrast audit for the app's color tokens (both themes).
//   node test/contrast-check.mjs
// Fails (exit 1) if any listed pair drops below its required ratio.
// Small text needs 4.5:1; large text (>=18.66px bold / 24px) and non-text UI need 3:1.
function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    let v = parseInt(c.substr(i, 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [label, fg, bg, required]
const PAIRS = [
  // ---- light workspace ----
  ['L ink / card', '#1c1f24', '#eeeae0', 4.5],
  ['L ink-dim / card', '#4c525b', '#eeeae0', 4.5],
  ['L ink-dim / paper2', '#4c525b', '#e7e3d8', 4.5],
  ['L ink-dim / th-bg', '#4c525b', '#d8d3c5', 4.5],
  ['L ink-faint (hints) / card', 'INK_FAINT_L', '#eeeae0', 4.5],
  ['L SCU numerals / card', 'NUM_L', '#eeeae0', 4.5],
  ['L SCU numerals / paper2', 'NUM_L', '#e7e3d8', 4.5],
  ['L cyan interactive text / card', 'CYAN_TXT_L', '#eeeae0', 4.5],
  ['L red warn text / card', 'RED_TXT_L', '#eeeae0', 4.5],
  ['L green opt text / card', 'GREEN_TXT_L', '#eeeae0', 4.5],
  // ---- dark workspace ----
  ['D ink / card', '#dfe6ec', '#1a2027', 4.5],
  ['D ink-dim / card', '#9aa6b1', '#1a2027', 4.5],
  ['D ink-faint (hints) / card', 'INK_FAINT_D', '#1a2027', 4.5],
  ['D SCU numerals / card', 'NUM_D', '#1a2027', 4.5],
  ['D cyan text / card', 'CYAN_TXT_D', '#1a2027', 4.5],
  ['D red warn text / card', 'RED_TXT_D', '#1a2027', 4.5],
  ['L done-ink / card', '#566a4d', '#eeeae0', 4.5],
  ['D done-ink / card', '#8aa178', '#1a2027', 4.5],
  // ---- sidebar (same both themes) ----
  ['S side-ink / side', '#c9d2da', '#1b2026', 4.5],
  ['S side-dim / side', '#8492a0', '#1b2026', 4.5],
  ['S side-faint (tiny labels) / side', 'SIDE_FAINT', '#1b2026', 4.5],
  ['S amber target / side', '#bf842a', '#1b2026', 4.5],
  ['S side-cyan / side2', '#71a5cf', '#222932', 4.5],
  ['S side-green / side2', '#7ba463', '#222932', 4.5],
  ['S side-red / side2', '#d07d70', '#222932', 4.5],
  // ---- more theme text ----
  ['D green opt text / card', 'GREEN_TXT_D', '#1a2027', 4.5],
  // ---- fills (small text on solid status/action fills) ----
  ['badge ok: white / green fill', '#ffffff', 'GREEN_FILL', 4.5],
  ['badge bad: white / red fill', '#ffffff', 'RED_FILL', 4.5],
  ['badge warn: dark ink / amber fill', '#1a1f26', 'AMBER_FILL', 4.5],
  ['btn accent: white / cyan fill', '#ffffff', 'CYAN_FILL', 4.5],
  // ---- zone header bands (14px bold uppercase titles = small text) ----
  ['zone: white / overview', '#ffffff', '#3a647f', 4.5],
  ['zone: white / manifest', '#ffffff', '#566641', 4.5],
  ['zone: white / pickup', '#ffffff', '#5d5180', 4.5],
  ['zone: white / dropoff', '#ffffff', '#8f5d33', 4.5],
];

// Candidate values under test — start with current tokens, tune here until green,
// then copy the winners into app.css.
const CANDIDATES = {
  INK_FAINT_L: process.env.INK_FAINT_L || '#61676f',
  INK_FAINT_D: process.env.INK_FAINT_D || '#8a95a0',
  SIDE_FAINT: process.env.SIDE_FAINT || '#7d8a96',
  NUM_L: process.env.NUM_L || '#8a5c12',   // --amber as numeral ink in light
  NUM_D: process.env.NUM_D || '#bf842a',
  CYAN_TXT_L: process.env.CYAN_TXT_L || '#38678c',
  CYAN_TXT_D: process.env.CYAN_TXT_D || '#71a5cf',
  RED_TXT_L: process.env.RED_TXT_L || '#a8402f',
  RED_TXT_D: process.env.RED_TXT_D || '#d07d70',
  GREEN_TXT_L: process.env.GREEN_TXT_L || '#48713a',
  GREEN_TXT_D: process.env.GREEN_TXT_D || '#7ba463',
  GREEN_FILL: process.env.GREEN_FILL || '#4c7738',
  RED_FILL: process.env.RED_FILL || '#bb4a3a',
  AMBER_FILL: process.env.AMBER_FILL || '#bf842a',
  CYAN_FILL: process.env.CYAN_FILL || '#3f6f93',
};

let bad = 0;
for (const [label, fgRaw, bgRaw, need] of PAIRS) {
  const fg = CANDIDATES[fgRaw] || fgRaw;
  const bg = CANDIDATES[bgRaw] || bgRaw;
  const r = ratio(fg, bg);
  const ok = r >= need;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(38)} ${fg} on ${bg}  ${r.toFixed(2)}:1 (need ${need})`);
}
console.log(bad ? `\n${bad} pair(s) below target` : '\nall pairs pass');
process.exit(bad ? 1 : 0);
