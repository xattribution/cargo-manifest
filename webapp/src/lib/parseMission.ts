// Parse Star Citizen hauling-contract text (OCR'd from the Primary Objectives panel, and
// optionally the Details panel) into structured cargo legs.
//
// Grammar observed across contract types:
//   "Deliver 0/<SCU> SCU of <Commodity> to <Destination>."   (primary line)
//     "Collect <Commodity> from <Source>."                    (one or more sub-lines)
//
// Rules baked in:
//   - Source/destination are read from the text (NOT hardcoded — Everus is sometimes the dest).
//   - A delivery with multiple "Collect from" sources → one leg per source, full SCU on the
//     first and 0 on the rest (the user's manual tracking trick), same commodity + destination.
//   - Box limit ("16 SCU or smaller", "4 SCU in size", "no larger than 8") → maxBox.

export interface ParsedLeg {
  commodity: string;
  scu: number;       // 0 for secondary sources of a multi-source delivery
  source: string;    // raw text (matched to catalog later)
  destination: string;
  primary: boolean;  // false for the 0-SCU duplicate rows
}

export interface ParsedMission {
  legs: ParsedLeg[];
  maxBox: number | null; // detected container size cap, if stated
  reward: number | null; // aUEC reward, if the panel/header was included
  raw: string;
}

// strip trailing location qualifiers (never in the catalog) and OCR column-divider junk
function cleanLoc(s: string): string {
  return s
    .replace(/\bat\b.*$/i, '')               // "... at Hurston's L3 Lagrange point"
    .replace(/\babove\b.*$/i, '')            // "Everus Harbor above Hurston"
    .replace(/\bon\s+Hurston\b.*$/i, '')     // "... on Hurston"
    .replace(/\bin\s+[A-Z][a-z]+.*$/i, '')   // "Teasa Spaceport in Lorville"
    .replace(/[|<>$_©®°•¢«»¬¤]+/g, ' ')      // OCR column-divider / bullet-glyph noise (◇ often reads as © etc.)
    .replace(/\s+[A-Za-z]\s*$/,'')           // dangling single stray letter ("... | I")
    .replace(/[.,]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanCommodity(s: string): string {
  return s.replace(/[.,]\s*$/, '').replace(/[|<>$©®°•¢«»¬¤]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// OCR commonly splits an objective across 2 lines and may drop the trailing period.
// Flatten wraps, then break before each Deliver/Collect keyword so clauses never merge
// even when sentence punctuation is missing.
function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')                              // flatten wraps
    .replace(/([.])\s+/g, '$1\n')                       // break on sentence ends
    .replace(/\s+(Deliver|Collect)\b/gi, '\n$1')        // and before each keyword
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Letters Tesseract commonly reads in place of digits inside a number ("14I" for 141,
// "O/62" for 0/62). Only ever applied to captured NUMBER tokens, never to names.
function fixDigits(s: string): string {
  const map: Record<string, string> = { o: '0', O: '0', i: '1', I: '1', l: '1', L: '1', s: '5', S: '5', b: '8', B: '8', z: '2', Z: '2' };
  return s.replace(/[oOiIlLsSbBzZ]/g, (ch) => map[ch] ?? ch);
}
const numFrom = (s: string): number => parseInt(fixDigits(s).replace(/[^\d]/g, ''), 10) || 0;

// "Deliver 0/85 SCU of ..." — SCU is the number AFTER the slash (0 = amount delivered so far).
// Capture commodity/destination as runs WITHOUT a period so trailing flavor text (e.g. the
// Details column bleeding in via OCR) can't contaminate the fields. Tolerate slash OCR noise
// and letter↔digit confusions in both numbers (O/62, 0/14I).
const DELIVER = /deliver\s+[\doO]+\s*[/|\\]\s*([\doOiIlSsBbzZ]+)\s*scu\s+of\s+([^.]+?)\s+to\s+([^.]+)/i;
const COLLECT = /collect\s+([^.]+?)\s+from\s+([^.]+)/i;
const BOX = /(\d+)\s*scu\s*(?:or\s*(?:smaller|less|below)|in\s*size|or\s*smaller)/i;
const BOX2 = /(?:no\s*larger\s*than|up\s*to|at\s*most[^.]*?)\s*(\d+)\s*scu/i;
// Reward: anchor on the word "Reward" then the first number (the ¤ glyph is unreliable —
// Tesseract often reads it as "=", "x", "¥", etc., so we don't depend on it). Falls back to
// the aUEC/¤ forms if "Reward" isn't in frame.
const REWARD_LABEL = /reward\b[^\d]{0,12}([\d][\d.,oOiIlSsBbzZ]{2,})/i;
const REWARD_GLYPH = /(?:[¤¥€$]|a?uec)\s*([\d][\d.,oOiIlSsBbzZ]{2,})|([\d][\d.,]{2,})\s*a?uec/i;

export function parseMission(objectivesText: string, detailsText = ''): ParsedMission {
  const raw = objectivesText;
  const lines = sentences(objectivesText);

  // box limit may live in either panel
  let maxBox: number | null = null;
  for (const src of [objectivesText, detailsText]) {
    const m = src.match(BOX) || src.match(BOX2);
    if (m) { maxBox = parseInt(m[1], 10); break; }
  }

  // reward (aUEC) if the header/reward area was included in the shot
  let reward: number | null = null;
  for (const src of [objectivesText, detailsText]) {
    const m = src.match(REWARD_LABEL) || src.match(REWARD_GLYPH);
    if (m) { const n = numFrom(m[1] || m[2] || ''); if (n >= 100) { reward = n; break; } }
  }

  // First pass: collect deliveries (in order) and the collect-sources that follow each.
  interface Delivery { commodity: string; scu: number; destination: string; sources: string[]; }
  const deliveries: Delivery[] = [];
  for (const line of lines) {
    const d = line.match(DELIVER);
    if (d) {
      deliveries.push({
        scu: numFrom(d[1]),
        commodity: cleanCommodity(d[2]),
        destination: cleanLoc(d[3]),
        sources: [],
      });
      continue;
    }
    const c = line.match(COLLECT);
    if (c && deliveries.length) {
      // attach to the most recent delivery whose commodity matches (or just the last one)
      const commodity = cleanCommodity(c[1]);
      const src = cleanLoc(c[2]);
      const target = [...deliveries].reverse().find((x) => x.commodity.toLowerCase() === commodity.toLowerCase()) || deliveries[deliveries.length - 1];
      target.sources.push(src);
    }
  }

  // Second pass: expand to legs, applying the multi-source 0-SCU rule.
  const legs: ParsedLeg[] = [];
  for (const d of deliveries) {
    const srcs = d.sources.length ? d.sources : [''];
    srcs.forEach((src, i) => {
      legs.push({
        commodity: d.commodity,
        scu: i === 0 ? d.scu : 0,
        source: src,
        destination: d.destination,
        primary: i === 0,
      });
    });
  }

  return { legs, maxBox, reward, raw };
}

// Deconflict several OCR passes of the SAME mission into one best result. Legs are aligned by
// order; each field is chosen by majority vote (ties → the value from the highest-confidence
// pass, which is passed first). SCU votes on the numeric value. maxBox/reward vote on the
// value across all passes. This fixes per-character OCR drift (e.g. "ARC-LS" vs "ARC-L5",
// "8" vs "81"). CRITICAL: only passes with the SAME leg count as the anchor vote per-field —
// a pass that dropped a leg has every later leg shifted by one, and letting it vote would
// let two shifted passes outvote the one complete pass.
export function deconflict(missions: ParsedMission[]): ParsedMission {
  const valid = missions.filter((m) => m.legs.length);
  if (!valid.length) return missions[0] || { legs: [], maxBox: null, reward: null, raw: '' };
  // anchor on the pass with the most legs (most complete), then the earliest such
  const anchor = valid.reduce((a, b) => (b.legs.length > a.legs.length ? b : a), valid[0]);
  const n = anchor.legs.length;
  const aligned = valid.filter((m) => m.legs.length === n);

  const vote = (vals: string[]): string => {
    const counts = new Map<string, number>();
    let best = vals[0] ?? ''; let bestC = 0;
    vals.forEach((v) => { if (!v) return; const c = (counts.get(v) || 0) + 1; counts.set(v, c); if (c > bestC) { bestC = c; best = v; } });
    return best;
  };
  const voteNum = (vals: (number | null)[]): number | null => {
    const present = vals.filter((v): v is number => v != null);
    if (!present.length) return null;
    return Number(vote(present.map(String)));
  };

  const legs: ParsedLeg[] = [];
  for (let i = 0; i < n; i++) {
    const variants = aligned.map((m) => m.legs[i]).filter(Boolean);
    const a = anchor.legs[i];
    legs.push({
      commodity: vote(variants.map((v) => v.commodity)) || a.commodity,
      scu: parseInt(vote(variants.map((v) => String(v.scu))), 10) || a.scu,
      source: vote(variants.map((v) => v.source)) || a.source,
      destination: vote(variants.map((v) => v.destination)) || a.destination,
      primary: a.primary,
    });
  }
  return {
    legs,
    maxBox: voteNum(valid.map((m) => m.maxBox)),
    reward: voteNum(valid.map((m) => m.reward)),
    raw: anchor.raw,
  };
}
