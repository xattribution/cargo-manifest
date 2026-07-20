// Token/code-aware matcher: resolve a free-text name (from OCR) to the best catalog entry.
// Designed for the realities of the Cargo Manifest catalog:
//   - catalog names are often abbreviated ("S1DC06" for "Covalex Distribution Center S1DC06")
//   - OCR gives the full in-game name, sometimes with trailing fluff ("... on Hurston")
//   - some catalog entries are sub-locations ("Platinum Bay (HUR-L5 High Course Station)")
// Strategy: normalize → token sets → score by token overlap + alphanumeric "code" tokens,
// preferring the candidate that is the tightest container of the query's meaningful tokens.

export interface MatchResult {
  value: string;        // best catalog name, or '' if nothing plausible
  score: number;        // 0..1 confidence
  novel: boolean;       // query looked valid but nothing matched well → offer "add to catalog"
}

// words that carry no identifying weight for locations
const STOP = new Set([
  'at', 'on', 'the', 'of', 'to', 'from', 'in', 'above', 'point', 'lagrange',
  'station', 'freight', 'elevator', 'hurstons', 'hurston', 'crusader', 'arccorp',
  'microtech', 'stanton', 'center', 'distribution', 'shipping', 'depot',
]);

export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/['’.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return norm(s).split(' ').filter(Boolean);
}
function meaningful(toks: string[]): string[] {
  // Drop stop-words AND single-character fragments (possessives like "Crusader's" tokenize
  // to a stray "s" that would pollute the Dice overlap).
  const m = toks.filter((t) => !STOP.has(t) && t.length > 1);
  if (m.length) return m;
  const noStop = toks.filter((t) => !STOP.has(t));
  return noStop.length ? noStop : toks; // never reduce to nothing
}
// alphanumeric identifier tokens like "s1dc06", "hur-l5", "2ub-rb9-5", "st1-61"
function isCode(t: string): boolean {
  return /\d/.test(t) && /[a-z]/i.test(t) || /^[a-z]{2,4}-/i.test(t) || /-/.test(t) && /\d/.test(t);
}
// Canonicalize a code token to absorb common OCR confusions so "arc-ls" == "arc-l5",
// "s1dc06" == "51dco6", etc. Maps letters that look like digits to digits.
function codeKey(t: string): string {
  return t.replace(/[a-z0-9-]/gi, (ch) => {
    const m: Record<string, string> = { o: '0', O: '0', s: '5', S: '5', i: '1', I: '1', l: '1', L: '1', b: '8', B: '8', z: '2', Z: '2', g: '9', G: '9' };
    return (m[ch] || ch).toLowerCase();
  });
}
function codesEqual(a: string, b: string): boolean {
  // Only normalize LETTER↔DIGIT confusions (S↔5, O↔0, …) via codeKey. We deliberately do NOT
  // use edit-distance here: digit↔digit differences are meaningful (ARC-L4 ≠ ARC-L5 are
  // different stations), so a near-miss should flag novel for review rather than silently
  // merge to the wrong place.
  return a === b || codeKey(a) === codeKey(b);
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return (2 * inter) / (a.size + b.size);
}

// Score how well a catalog candidate matches the query.
function score(qToks: string[], cToks: string[]): number {
  const q = new Set(meaningful(qToks));
  const c = new Set(meaningful(cToks));
  if (!q.size || !c.size) return 0;

  // base: token overlap (Dice)
  let s = dice(q, c);

  // containment bonus: how many of the query's tokens appear in the candidate
  // (count an OCR-equivalent code token as contained too: "arc-ls" ⇆ "arc-l5")
  const cArr = [...c];
  let contained = 0;
  for (const t of q) if (c.has(t) || (isCode(t) && cArr.some((x) => isCode(x) && codesEqual(t, x)))) contained++;
  const coverage = contained / q.size;
  s = s * 0.5 + coverage * 0.5;

  // code-token match is a strong signal (and a code mismatch is a strong negative).
  // Use OCR-tolerant comparison so digit/letter confusions still match.
  const qCodes = [...q].filter(isCode);
  const cCodes = cArr.filter(isCode);
  if (qCodes.length) {
    const hit = qCodes.some((x) => cCodes.some((y) => codesEqual(x, y)));
    if (hit) s += 0.35;
    else {
      // Mismatched code: normally a strong negative (ARC-L4 ≠ ARC-L5). But when the query
      // also carries ≥2 distinctive NON-code tokens that are ALL contained in the candidate
      // ("CRU-LA Shallow Fields Station" → "CRU-L4 Shallow Fields Station"), the words
      // uniquely identify the place and the code was just OCR-garbled — soften the penalty.
      const qNon = [...q].filter((t) => !isCode(t));
      const wordsCarry = qNon.length >= 2 && qNon.every((t) => c.has(t));
      s -= wordsCarry ? 0.08 : 0.25;
    }
  }

  // tightness: prefer candidates that aren't padded with extra tokens (station > shop-in-station)
  const extra = [...c].filter((t) => !q.has(t)).length;
  s -= Math.min(0.2, extra * 0.04);

  // NOTE: deliberately NOT clamped to [0,1] here — comparison must stay unclamped so a
  // saturating sub-location ("Refinery deck store (X Station)") can never tie the station
  // itself. matchName clamps the reported confidence at the end.
  return Math.max(0, s);
}

export interface Candidate { name: string; }

// Match a free-text query against catalog names. `names` is the catalog's display names.
export function matchName(query: string, names: string[], threshold = 0.45): MatchResult {
  const q = (query || '').trim();
  if (!q) return { value: '', score: 0, novel: false };
  const qToks = tokens(q);

  let best = ''; let bestScore = 0;
  for (const name of names) {
    const sc = score(qToks, tokens(name));
    if (sc > bestScore) { bestScore = sc; best = name; }
  }
  if (bestScore >= threshold) return { value: best, score: Math.min(1, bestScore), novel: false };
  // nothing matched well — treat as a new entry the user can add
  return { value: q, score: Math.min(1, bestScore), novel: true };
}
