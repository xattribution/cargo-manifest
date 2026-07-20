// Parser + matcher regression tests, runnable with plain Node (no framework):
//   node --experimental-strip-types --no-warnings test/parser-tests.mjs   (from webapp/)
//   or: npm run test:parser
// Cases are transcribed from REAL contract screenshots (Covalex "Senior Rank — Medium
// Cargo Haul" family) plus OCR-noise variants of them. When the importer misbehaves on a
// new screenshot, transcribe it here first, then fix the parser.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const { parseMission, deconflict } = await import(path.join(here, '../src/lib/parseMission.ts'));
const { matchName } = await import(path.join(here, '../src/lib/match.ts'));
const { parseCSV } = await import(path.join(here, '../src/lib/csv.ts'));

const locCsv = parseCSV(readFileSync(path.join(here, '../../data/locations.csv'), 'utf8'));
const comCsv = parseCSV(readFileSync(path.join(here, '../../data/commodities.csv'), 'utf8'));
const locNames = locCsv.rows.map((r) => r.Name).filter(Boolean);
const comNames = comCsv.rows.map((r) => r.Name).filter(Boolean);

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error(`✗ ${label}\n    expected ${e}\n    got      ${a}`); }
}

const legTuple = (l) => [l.commodity, l.scu, l.source, l.destination];

// ---------------------------------------------------------------------------
// Shot 1: 4× Aluminum from CRU-L4 Shallow Fields Station, reward ¤318,250
// ---------------------------------------------------------------------------
const shot1 = `
Reward ¤ 318,250
Contract Deadline N/A
Contracted By Covalex Independent Contractors
PRIMARY OBJECTIVES
Deliver 0/62 SCU of Aluminum to Seraphim Station above
Crusader.
Collect Aluminum from CRU-L4 Shallow Fields
Station.
Deliver 0/64 SCU of Aluminum to Port Tressler above
microTech.
Collect Aluminum from CRU-L4 Shallow Fields
Station.
Deliver 0/74 SCU of Aluminum to Baijini Point above
ArcCorp.
Collect Aluminum from CRU-L4 Shallow Fields
Station.
Deliver 0/76 SCU of Aluminum to Everus Harbor above
Hurston.
Collect Aluminum from CRU-L4 Shallow Fields
Station.
`;
{
  const m = parseMission(shot1);
  check('shot1 legs', m.legs.map(legTuple), [
    ['Aluminum', 62, 'CRU-L4 Shallow Fields Station', 'Seraphim Station'],
    ['Aluminum', 64, 'CRU-L4 Shallow Fields Station', 'Port Tressler'],
    ['Aluminum', 74, 'CRU-L4 Shallow Fields Station', 'Baijini Point'],
    ['Aluminum', 76, 'CRU-L4 Shallow Fields Station', 'Everus Harbor'],
  ]);
  check('shot1 reward', m.reward, 318250);
}

// ---------------------------------------------------------------------------
// Shot 2: 3× Aluminum from CRU-L1 Ambitious Dream Station, reward ¤279,250
// ---------------------------------------------------------------------------
const shot2 = `
Reward ¤ 279,250
Deliver 0/141 SCU of Aluminum to Seraphim Station
above Crusader.
Collect Aluminum from CRU-L1 Ambitious Dream
Station.
Deliver 0/125 SCU of Aluminum to Port Tressler above
microTech.
Collect Aluminum from CRU-L1 Ambitious Dream
Station.
Deliver 0/143 SCU of Aluminum to Everus Harbor above
Hurston.
Collect Aluminum from CRU-L1 Ambitious Dream
Station.
`;
{
  const m = parseMission(shot2);
  check('shot2 legs', m.legs.map(legTuple), [
    ['Aluminum', 141, 'CRU-L1 Ambitious Dream Station', 'Seraphim Station'],
    ['Aluminum', 125, 'CRU-L1 Ambitious Dream Station', 'Port Tressler'],
    ['Aluminum', 143, 'CRU-L1 Ambitious Dream Station', 'Everus Harbor'],
  ]);
  check('shot2 reward', m.reward, 279250);
}

// ---------------------------------------------------------------------------
// Shot 3: mixed Aluminum + Titanium (interleaved same-commodity deliveries)
// ---------------------------------------------------------------------------
const shot3 = `
Reward ¤ 337,750
Deliver 0/76 SCU of Aluminum to Seraphim Station above
Crusader.
Collect Aluminum from CRU-L1 Ambitious Dream
Station.
Deliver 0/96 SCU of Aluminum to Everus Harbor above
Hurston.
Collect Aluminum from CRU-L1 Ambitious Dream
Station.
Deliver 0/77 SCU of Titanium to Baijini Point above
ArcCorp.
Collect Titanium from CRU-L1 Ambitious Dream
Station.
Deliver 0/102 SCU of Titanium to Seraphim Station above
Crusader.
Collect Titanium from CRU-L1 Ambitious Dream
Station.
`;
{
  const m = parseMission(shot3);
  check('shot3 legs', m.legs.map(legTuple), [
    ['Aluminum', 76, 'CRU-L1 Ambitious Dream Station', 'Seraphim Station'],
    ['Aluminum', 96, 'CRU-L1 Ambitious Dream Station', 'Everus Harbor'],
    ['Titanium', 77, 'CRU-L1 Ambitious Dream Station', 'Baijini Point'],
    ['Titanium', 102, 'CRU-L1 Ambitious Dream Station', 'Seraphim Station'],
  ]);
  check('shot3 reward', m.reward, 337750);
}

// ---------------------------------------------------------------------------
// Shot 4: Lagrange-point destinations ("… Station at Crusader's L5 Lagrange point")
// ---------------------------------------------------------------------------
const shot4 = `
Reward ¤ 296,250
Deliver 0/62 SCU of Quantum Fuel to Beautiful Glen
Station at Crusader's L5 Lagrange point.
Collect Quantum Fuel from Seraphim Station.
Deliver 0/136 SCU of Hydrogen Fuel to Ambitious Dream
Station at Crusader's L1 Lagrange point.
Collect Hydrogen Fuel from Seraphim Station.
Deliver 0/141 SCU of Ship Ammunition to Shallow Fields
Station at Crusader's L4 Lagrange point.
Collect Ship Ammunition from Seraphim Station.
Deliver 0/60 SCU of Hydrogen Fuel to Beautiful Glen
Station at Crusader's L5 Lagrange point.
Collect Hydrogen Fuel from Seraphim Station.
`;
{
  const m = parseMission(shot4);
  check('shot4 legs', m.legs.map(legTuple), [
    ['Quantum Fuel', 62, 'Seraphim Station', 'Beautiful Glen Station'],
    ['Hydrogen Fuel', 136, 'Seraphim Station', 'Ambitious Dream Station'],
    ['Ship Ammunition', 141, 'Seraphim Station', 'Shallow Fields Station'],
    ['Hydrogen Fuel', 60, 'Seraphim Station', 'Beautiful Glen Station'],
  ]);
  check('shot4 reward', m.reward, 296250);
}

// ---------------------------------------------------------------------------
// Shot 5: Tungsten ×3, header shows "Contract Availability 2h 2m"
// ---------------------------------------------------------------------------
const shot5 = `
Reward ¤ 282,500
Contract Availability 2h 2m
Deliver 0/135 SCU of Tungsten to Port Tressler above
microTech.
Collect Tungsten from CRU-L4 Shallow Fields
Station.
Deliver 0/126 SCU of Tungsten to Seraphim Station above
Crusader.
Collect Tungsten from CRU-L4 Shallow Fields
Station.
Deliver 0/94 SCU of Tungsten to Everus Harbor above
Hurston.
Collect Tungsten from CRU-L4 Shallow Fields
Station.
`;
{
  const m = parseMission(shot5);
  check('shot5 legs', m.legs.map(legTuple), [
    ['Tungsten', 135, 'CRU-L4 Shallow Fields Station', 'Port Tressler'],
    ['Tungsten', 126, 'CRU-L4 Shallow Fields Station', 'Seraphim Station'],
    ['Tungsten', 94, 'CRU-L4 Shallow Fields Station', 'Everus Harbor'],
  ]);
  check('shot5 reward', m.reward, 282500);
}

// ---------------------------------------------------------------------------
// Box limit lives in the Details column ("containers 16 SCU or smaller")
// ---------------------------------------------------------------------------
{
  const m = parseMission(shot1, `They've processed a bunch of Aluminum into containers 16 SCU or smaller, and are looking to get it shipped out`);
  check('details box limit', m.maxBox, 16);
  const m2 = parseMission(shot3, `They've processed a mix of refined ores and are looking to get the containers (16 SCU or smaller) shipped out`);
  check('details box limit (parenthesized)', m2.maxBox, 16);
}

// ---------------------------------------------------------------------------
// OCR noise variants
// ---------------------------------------------------------------------------
// leading zero read as the letter O, stray divider junk, dropped period
const noisy1 = `
Reward = 318,250
© Deliver O/62 SCU of Aluminum to Seraphim Station above
Crusader. | Collect Aluminum from CRU-L4 Shallow Fields
Station
© Deliver 0/64 SCU of Aluminum to Port Tressler above
microTech. Collect Aluminum from CRU-L4 Shallow Fields Station.
`;
{
  const m = parseMission(noisy1);
  check('noisy O/62 legs', m.legs.map(legTuple), [
    ['Aluminum', 62, 'CRU-L4 Shallow Fields Station', 'Seraphim Station'],
    ['Aluminum', 64, 'CRU-L4 Shallow Fields Station', 'Port Tressler'],
  ]);
  check('noisy reward (¤ read as =)', m.reward, 318250);
}

// SCU digits with letter confusions ("14I" for 141), code with letter/digit swap
const noisy2 = `
Deliver 0/14I SCU of Aluminum to Seraphim Station above Crusader.
Collect Aluminum from CRU-LA Shallow Fields Station.
`;
{
  const m = parseMission(noisy2);
  check('noisy SCU 14I -> 141', m.legs.map((l) => l.scu), [141]);
}

// deconflict: a pass that DROPPED a middle leg must not shift votes of later legs
{
  const good = parseMission(shot3);
  const dropped = parseMission(shot3.replace(/Deliver 0\/96[^]*?Station\.\n/, ''));  // lost leg 2
  const merged = deconflict([good, dropped, good]);
  check('deconflict keeps anchor legs despite a short pass', merged.legs.map(legTuple), good.legs.map(legTuple));
}

// deconflict: reward votes by majority, not first-non-null
{
  const a = parseMission(shot5.replace('282,500', '82,500'));   // one bad pass (dropped digit)…
  const b = parseMission(shot5);
  const c = parseMission(shot5);
  check('deconflict reward majority', deconflict([a, b, c]).reward, 282500);
}

// ---------------------------------------------------------------------------
// Matcher: every location/commodity in the shots must resolve to the right entry
// ---------------------------------------------------------------------------
const locCases = [
  ['Seraphim Station', 'Seraphim Station'],
  ['Port Tressler', 'Port Tressler'],
  ['Baijini Point', 'Baijini Point'],
  ['Everus Harbor', 'Everus Harbor'],
  ['CRU-L4 Shallow Fields Station', 'CRU-L4 Shallow Fields Station'],
  ['CRU-L1 Ambitious Dream Station', 'CRU-L1 Ambitious Dream Station'],
  ['Beautiful Glen Station', 'CRU-L5 Beautiful Glen Station'],
  ['Ambitious Dream Station', 'CRU-L1 Ambitious Dream Station'],
  ['Shallow Fields Station', 'CRU-L4 Shallow Fields Station'],
  ['CRU-LA Shallow Fields Station', 'CRU-L4 Shallow Fields Station'], // OCR: 4 -> A is NOT auto-fixed; token overlap must still carry it
  ['High Course Station', 'HUR-L5 High Course Station'],
];
for (const [q, want] of locCases) {
  const r = matchName(q, locNames);
  check(`match loc "${q}"`, r.novel ? `NOVEL(${r.value})` : r.value, want);
}
// safety: garbled code must NOT silently merge into a DIFFERENT station's code
{
  const r = matchName('ARC-L4', locNames);
  check('match loc "ARC-L4" stays L4', r.value.startsWith('ARC-L4'), true);
}
const comCases = [
  ['Aluminum', 'Aluminum'], ['Titanium', 'Titanium'], ['Tungsten', 'Tungsten'],
  ['Quantum Fuel', 'Quantum Fuel'], ['Hydrogen Fuel', 'Hydrogen Fuel'],
  ['Ship Ammunition', 'Ship Ammunition'],
];
for (const [q, want] of comCases) {
  const r = matchName(q, comNames);
  check(`match com "${q}"`, r.novel ? `NOVEL(${r.value})` : r.value, want);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
