import { readFileSync } from 'node:fs';
import { parseGrillz } from '../src/parse.ts';
import { specToEvalConfig, type EvalArch, type EvalConfig } from './convert.ts';
import { runBaseline } from './baseline.ts';

/**
 * Eval runner: every case in eval-set.json through the Ember parser AND
 * through the baseline wish() matcher, scored the same way.
 *
 *   npm run eval            (mock mode — no API spend, canned parses)
 *   EMBER_MODE=live npm run eval   (once credits land)
 *
 * Scoring:
 * - Config cases: per-arch fields (teeth, metal, finish, stones, extras,
 *   overrides). An expected metal of null means the prompt never named one —
 *   any metal passes (the production schema forces a choice). A case is an
 *   "exact match" only when every field of both arches passes.
 * - Flag cases: pass when the parser surfaces a flag instead of guessing
 *   (Ember: non-empty `unsupported`; baseline: a non-empty `diff` note, its
 *   closest analogue).
 * Mock-mode scores are NOT representative of the live model — the mock only
 * has canned parses for a few inputs. They prove the pipeline runs and show
 * the shape of the report the live run will produce.
 */

type EvalCase = {
  id: number;
  difficulty: string;
  prompt: string;
  tests?: string;
  expected: EvalConfig | { flag: string };
};

const setData = JSON.parse(readFileSync(new URL('./eval-set.json', import.meta.url), 'utf8')) as {
  cases: EvalCase[];
};

const stable = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

const setEq = (a: string[], b: string[]) => stable([...a].sort()) === stable([...b].sort());

function scoreArch(expected: EvalArch | null, actual: EvalArch | null): { pass: number; total: number } {
  const total = 6;
  if (expected === null && actual === null) return { pass: total, total };
  if (expected === null || actual === null) return { pass: 0, total };
  let pass = 0;
  if (expected.teeth === actual.teeth) pass++;
  if (expected.metal === null || expected.metal === actual.metal) pass++;
  if (expected.finish === actual.finish) pass++;
  if (setEq(expected.stones, actual.stones)) pass++;
  if (setEq(expected.extras, actual.extras)) pass++;
  if (stable(expected.overrides) === stable(actual.overrides)) pass++;
  return { pass, total };
}

function scoreConfig(expected: EvalConfig, actual: EvalConfig) {
  const top = scoreArch(expected.top, actual.top);
  const bottom = scoreArch(expected.bottom, actual.bottom);
  const pass = top.pass + bottom.pass;
  const total = top.total + bottom.total;
  return { pass, total, exact: pass === total };
}

const isFlagCase = (c: EvalCase): c is EvalCase & { expected: { flag: string } } => 'flag' in c.expected;

type Row = {
  id: number;
  difficulty: string;
  prompt: string;
  ember: string;
  baseline: string;
  emberPass: boolean;
  baselinePass: boolean;
};

const rows: Row[] = [];
let emberFields = { pass: 0, total: 0 };
let baselineFields = { pass: 0, total: 0 };
let emberExact = 0;
let baselineExact = 0;
let configCases = 0;
let emberFlags = 0;
let baselineFlags = 0;
let flagCases = 0;

for (const c of setData.cases) {
  const result = await parseGrillz(c.prompt);
  const baseline = runBaseline(c.prompt);
  const promptShort = c.prompt.length > 44 ? `${c.prompt.slice(0, 41)}...` : c.prompt;

  if (isFlagCase(c)) {
    flagCases++;
    const emberPass = result.unsupported.length > 0;
    const baselinePass = baseline !== null && baseline.diff.length > 0;
    if (emberPass) emberFlags++;
    if (baselinePass) baselineFlags++;
    rows.push({
      id: c.id,
      difficulty: c.difficulty,
      prompt: promptShort,
      ember: emberPass ? 'FLAG ok' : 'no flag',
      baseline: baseline === null ? 'n/a' : baselinePass ? 'FLAG ok' : 'no flag',
      emberPass,
      baselinePass,
    });
    continue;
  }

  configCases++;
  const expected = c.expected as EvalConfig;
  const emberConfig: EvalConfig = result.spec ? specToEvalConfig(result.spec) : { top: null, bottom: null };
  const es = scoreConfig(expected, emberConfig);
  emberFields.pass += es.pass;
  emberFields.total += es.total;
  if (es.exact) emberExact++;

  let baselineCell = 'n/a';
  let bs: ReturnType<typeof scoreConfig> | null = null;
  if (baseline !== null) {
    bs = scoreConfig(expected, baseline.config);
    baselineFields.pass += bs.pass;
    baselineFields.total += bs.total;
    if (bs.exact) baselineExact++;
    baselineCell = bs.exact ? 'exact' : `${bs.pass}/${bs.total}`;
  }

  rows.push({
    id: c.id,
    difficulty: c.difficulty,
    prompt: promptShort,
    ember: `${es.exact ? 'exact' : `${es.pass}/${es.total}`}${result.attempts.length > 1 ? ` (${result.attempts.length} attempts)` : ''}`,
    baseline: baselineCell,
    emberPass: es.exact,
    baselinePass: bs?.exact ?? false,
  });
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\nType-a-Grill eval — ${setData.cases.length} cases (parser mode: ${process.env.EMBER_MODE ?? 'mock'})\n`);
console.log(`${pad('id', 4)}${pad('level', 12)}${pad('prompt', 46)}${pad('ember', 22)}baseline`);
console.log('-'.repeat(100));
for (const r of rows) {
  console.log(`${pad(String(r.id), 4)}${pad(r.difficulty, 12)}${pad(r.prompt, 46)}${pad(r.ember, 22)}${r.baseline}`);
}
console.log('-'.repeat(100));
const pct = (p: number, t: number) => (t === 0 ? '—' : `${Math.round((p / t) * 100)}%`);
console.log(`config cases (${configCases}):  ember exact ${emberExact}/${configCases}, field accuracy ${pct(emberFields.pass, emberFields.total)}`);
console.log(`config cases (${configCases}):  baseline exact ${baselineExact}/${configCases}, field accuracy ${pct(baselineFields.pass, baselineFields.total)}`);
console.log(`flag cases (${flagCases}):    ember flagged ${emberFlags}/${flagCases}, baseline flagged ${baselineFlags}/${flagCases}`);
console.log('\nnote: mock mode parses only a few canned inputs exactly; the live run replaces those numbers.');
