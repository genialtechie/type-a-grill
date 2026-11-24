import type { RenderSpec, RenderTooth } from '../src/renderSpec.ts';

/**
 * Converts a parser-produced RenderSpec into the eval set's arch format
 * (evals/eval-set.json predates the production schema: it describes a set as
 * top/bottom arch objects with combined metal ids like "14k_yellow").
 *
 * Scoring conventions (also printed by the runner):
 * - An expected metal of null means the prompt never named one, so any metal
 *   the parser chose passes that field (the schema forces a choice).
 * - RenderSpec stones lab/natural are diamonds; moissanite stays moissanite.
 * - Set-level fangs become per-canine {finish: "fang"} overrides, or the
 *   arch finish itself when the arch is only the two canines.
 */

export type EvalArch = {
  teeth: number;
  metal: string | null;
  finish: string;
  stones: string[];
  extras: string[];
  overrides: Record<string, Record<string, unknown>>;
};

export type EvalConfig = { top: EvalArch | null; bottom: EvalArch | null };

const CANINE = new Set([5, 10]);
const LATERAL = new Set([6, 9]);
const CENTRAL = new Set([7, 8]);

const evalMetal = (tooth: RenderTooth): string => {
  if (tooth.metal === 'silver') return 'silver';
  if (tooth.metal === 'platinum') return 'platinum';
  return `${tooth.karat}_${tooth.metal}`;
};

const evalStone = (stone: string): string => (stone === 'moissanite' ? 'moissanite' : 'diamond');

const evalFinish = (tooth: RenderTooth): string => {
  if (tooth.type === 'iced') return 'iced_out';
  switch (tooth.style) {
    case 'open-face':
      return 'open_face';
    case 'opals':
      return 'opal_inlay';
    case 'diamond-dust':
      return 'diamond_dust';
    case 'diamond-cut':
      return 'diamond_cut';
    case 'engraving':
      return 'engraving';
    default:
      return 'solid';
  }
};

const evalStones = (tooth: RenderTooth): string[] => {
  if (tooth.style === 'opals') return ['opal'];
  if (tooth.type === 'iced') return [evalStone(tooth.stone)];
  return [];
};

/** Position key for a tooth within its arch, matching the eval set's override keys. Centrals are handled by the caller as "front_two". */
const positionKey = (tooth: RenderTooth): string | null => {
  const pos = tooth.index % 16;
  if (pos === 5) return 'canine_left';
  if (pos === 10) return 'canine_right';
  if (pos === 6) return 'lateral_left';
  if (pos === 9) return 'lateral_right';
  return null;
};

function convertArch(teeth: RenderTooth[], fangs: boolean): EvalArch | null {
  if (teeth.length === 0) return null;
  // Arch defaults = the most common design in the arch; deviations become overrides.
  const tally = new Map<string, number>();
  for (const t of teeth) {
    const key = `${evalMetal(t)}|${evalFinish(t)}|${evalStones(t).join(',')}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const [dominantKey] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  const [dMetal, dFinish, dStones] = dominantKey.split('|');

  const overrides: EvalArch['overrides'] = {};
  const frontTwo: RenderTooth[] = [];
  const backTeeth: RenderTooth[] = [];
  for (const t of teeth) {
    const pos = t.index % 16;
    const diff: Record<string, unknown> = {};
    if (evalMetal(t) !== dMetal) diff.metal = evalMetal(t);
    if (evalFinish(t) !== dFinish) diff.finish = evalFinish(t);
    const stones = evalStones(t);
    if (stones.join(',') !== dStones) diff.stones = stones;
    if (fangs && CANINE.has(pos) && dFinish !== 'fang') diff.finish = 'fang';
    if (Object.keys(diff).length === 0) continue;
    if (CENTRAL.has(pos)) frontTwo.push(t);
    else if (!CANINE.has(pos) && !LATERAL.has(pos) && !CENTRAL.has(pos)) backTeeth.push(t);
    else {
      const key = positionKey(t);
      if (key) overrides[key] = diff;
    }
  }
  if (frontTwo.length) {
    // Centrals deviating from the arch design = the eval set's "front_two" key.
    const first = frontTwo[0];
    const diff: Record<string, unknown> = {};
    if (evalMetal(first) !== dMetal) diff.metal = evalMetal(first);
    if (evalFinish(first) !== dFinish) diff.finish = evalFinish(first);
    const stones = evalStones(first);
    if (stones.join(',') !== dStones) diff.stones = stones;
    if (Object.keys(diff).length) overrides.front_two = diff;
    delete overrides.central_left;
    delete overrides.central_right;
  }
  if (backTeeth.length) {
    const first = backTeeth[0];
    const diff: Record<string, unknown> = {};
    if (evalFinish(first) !== dFinish) diff.finish = evalFinish(first);
    if (evalMetal(first) !== dMetal) diff.metal = evalMetal(first);
    if (Object.keys(diff).length) overrides.back_teeth = diff;
  }

  // An arch that is ONLY the two canines, with fangs on, is a fang arch.
  const onlyCanines = teeth.length === 2 && teeth.every((t) => CANINE.has(t.index % 16));
  const finish = onlyCanines && fangs ? 'fang' : dFinish;
  if (onlyCanines && fangs) {
    delete overrides.canine_left;
    delete overrides.canine_right;
  }

  return {
    teeth: teeth.length,
    metal: dMetal,
    finish,
    stones: dStones ? dStones.split(',').filter(Boolean) : [],
    extras: [],
    overrides,
  };
}

export function specToEvalConfig(spec: RenderSpec): EvalConfig {
  return {
    top: convertArch(spec.teeth.filter((t) => t.index < 16), spec.fangs),
    bottom: convertArch(spec.teeth.filter((t) => t.index >= 16), spec.fangs),
  };
}
