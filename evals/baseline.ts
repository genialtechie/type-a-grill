import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import type { EvalArch, EvalConfig } from './convert.ts';

/**
 * Runs the baseline `wish()` matcher (src/baseline-wish.js) outside the
 * artifact it was extracted from. wish() is not standalone code — it reads
 * and mutates the artifact's app globals (T, SET, DEF, counts(), onList(),
 * setRange(), receipt(), ...). This harness stubs those globals with the
 * smallest faithful builder state, runs one prompt per fresh state, then
 * reads the resulting tooth state back out and converts it to the eval
 * format so the baseline is scored exactly like the Ember parser.
 *
 * The conversion is approximate by necessity: wish() applies ONE patch to
 * the whole scope, so per-arch splits and most overrides simply never exist
 * in its output — which is precisely the gap the eval set measures.
 */

type StubTooth = {
  on: boolean;
  metal: string;
  karat: string;
  type: string;
  style: string;
  setting: string;
  stone: string;
  opal?: string;
};

const freshTooth = (): StubTooth => ({
  on: false,
  metal: 'yellow',
  karat: '10k',
  type: 'plain',
  style: 'solid',
  setting: 'honeycomb',
  stone: 'moissanite',
});

/** Turn on `count` centred front teeth of an arch, like the artifact's setRange. */
function setRangeIn(T: StubTooth[], top: number, bot: number) {
  const apply = (base: number, count: number) => {
    for (let p = 0; p < 16; p++) T[base + p].on = false;
    const start = 8 - Math.floor(count / 2);
    for (let i = 0; i < count; i++) T[base + start + i].on = true;
  };
  apply(0, top);
  apply(16, bot);
}

function makeSandbox() {
  const T: StubTooth[] = Array.from({ length: 32 }, freshTooth);
  const SET = { fangs: false, cut: 'deep', ins: { text: '', style: '', tooth: null as number | null } };
  const DEF = freshTooth();
  const counts = () => [
    T.slice(0, 16).filter((t) => t.on).length,
    T.slice(16).filter((t) => t.on).length,
  ];
  const sandbox: Record<string, unknown> = {
    T,
    SET,
    DEF,
    counts,
    onList: () => T.flatMap((t, i) => (t.on ? [i] : [])),
    setRange: (top: number, bot: number) => setRangeIn(T, top, bot),
    cur: () => DEF,
    groupTeeth: () => [5, 6, 7, 8, 9, 10, 21, 22, 23, 24, 25, 26].filter((i) => T[i].on),
    firstFront: () => 7,
    insOn: () => Boolean(SET.ins.text),
    receipt: () => {
      const [top, bot] = counts();
      return `${top} top + ${bot} bottom`;
    },
    ui: { visited: {} as Record<string, number> },
    STYLES: { open: ['Open-face'], cut: ['Diamond-cut'], dust: ['Diamond-dust'], engr: ['Engraving'], opal: ['Opals'], solid: ['Solid'] },
    STONES: { moissanite: ['Moissanite'], lab: ['Lab diamond'], natural: ['Natural diamond'] },
  };
  sandbox.globalThis = sandbox;
  return { sandbox, T, SET };
}

let wishSource: string | null = null;
function loadWish(): string {
  wishSource ??= readFileSync(new URL('../src/baseline-wish.js', import.meta.url), 'utf8');
  return wishSource;
}

const baseMetal = (t: StubTooth): string => {
  if (t.metal === 'silver') return 'silver';
  if (t.metal === 'platinum') return 'platinum';
  return `${t.karat}_${t.metal}`;
};

const baseFinish = (t: StubTooth): string => {
  if (t.type === 'iced') return 'iced_out';
  switch (t.style) {
    case 'open':
      return 'open_face';
    case 'opal':
      return 'opal_inlay';
    case 'dust':
      return 'diamond_dust';
    default:
      return 'solid';
  }
};

const baseStones = (t: StubTooth): string[] => {
  if (t.style === 'opal') return ['opal'];
  if (t.type === 'iced') return [t.stone === 'moissanite' ? 'moissanite' : 'diamond'];
  return [];
};

function archFrom(teeth: StubTooth[]): EvalArch | null {
  const on = teeth.filter((t) => t.on);
  if (on.length === 0) return null;
  const tally = new Map<string, number>();
  for (const t of on) {
    const key = `${baseMetal(t)}|${baseFinish(t)}|${baseStones(t).join(',')}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [dominant] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [metal, finish, stones] = dominant.split('|');
  return { teeth: on.length, metal, finish, stones: stones ? stones.split(',') : [], extras: [], overrides: {} };
}

/** Run one prompt through the baseline. Returns null when wish() cannot run at all. */
export function runBaseline(prompt: string): { config: EvalConfig; diff: string[] } | null {
  try {
    const { sandbox, T, SET } = makeSandbox();
    const context = vm.createContext(sandbox);
    vm.runInContext(loadWish(), context, { filename: 'baseline-wish.js' });
    const wish = sandbox.wish as (text: string, pic?: unknown) => { built: string; diff: string[] };
    if (typeof wish !== 'function') return null;
    const result = wish(prompt, undefined);
    return {
      config: { top: archFrom(T.slice(0, 16)), bottom: archFrom(T.slice(16)) },
      diff: result?.diff ?? [],
    };
  } catch {
    return null;
  }
}
