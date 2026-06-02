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
  raw: string;
}

// strip a trailing location qualifier the catalog never carries
function cleanLoc(s: string): string {
  return s
    .replace(/\bat\b.*$/i, '')            // "... at Hurston's L3 Lagrange point"
    .replace(/\babove\b.*$/i, '')         // "Everus Harbor above Hurston"
    .replace(/\bon Hurston\b.*$/i, '')    // "... on Hurston"
    .replace(/[.,]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanCommodity(s: string): string {
  return s.replace(/[.,]\s*$/, '').replace(/\s+/g, ' ').trim();
}

// OCR commonly splits an objective across 2 lines and may drop the trailing period.
// Flatten wraps, then break before each Deliver/Collect keyword so clauses never merge
// even when sentence punctuation is missing.
function sentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')                              // flatten wraps
    .replace(/\s+(Deliver|Collect)\b/gi, '\n$1')        // clause boundary before keyword
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

const DELIVER = /deliver\s+\d+\s*\/\s*(\d+)\s*scu\s+of\s+(.+?)\s+to\s+(.+?)[.]?$/i;
const COLLECT = /collect\s+(.+?)\s+from\s+(.+?)[.]?$/i;
const BOX = /(\d+)\s*scu\s*(?:or\s*(?:smaller|less|below)|in\s*size|or\s*smaller)/i;
const BOX2 = /(?:no\s*larger\s*than|up\s*to|at\s*most[^.]*?)\s*(\d+)\s*scu/i;

export function parseMission(objectivesText: string, detailsText = ''): ParsedMission {
  const raw = objectivesText;
  const lines = sentences(objectivesText);

  // box limit may live in either panel
  let maxBox: number | null = null;
  for (const src of [objectivesText, detailsText]) {
    const m = src.match(BOX) || src.match(BOX2);
    if (m) { maxBox = parseInt(m[1], 10); break; }
  }

  // First pass: collect deliveries (in order) and the collect-sources that follow each.
  interface Delivery { commodity: string; scu: number; destination: string; sources: string[]; }
  const deliveries: Delivery[] = [];
  for (const line of lines) {
    const d = line.match(DELIVER);
    if (d) {
      deliveries.push({
        scu: parseInt(d[1], 10) || 0,
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

  return { legs, maxBox, raw };
}
