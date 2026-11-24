import type { KaratId, MetalId, SettingId, StyleId } from './renderSpec.ts';

/**
 * Default rulings for ambiguous customer language.
 *
 * Customers almost never specify everything ("bottom six rose gold" — what
 * karat?). The parser must still return a complete, schema-valid config, so
 * every gap gets ONE documented ruling instead of a guess that changes from
 * call to call. Each ruling below is an ASSUMPTION (marked as such): they are
 * product decisions, they live in exactly one place, and changing one line
 * here changes the system prompt, the mock parser, and the eval expectations
 * together. Rulings were set Nov 24, 2026 for the Ember hackathon build.
 */

export type DefaultRuling = {
  /** The situation the ruling covers, in the customer's words. */
  situation: string;
  /** What the parser does. */
  ruling: string;
};

export const DEFAULT_RULINGS: DefaultRuling[] = [
  {
    situation: 'A gold colour is named with no karat ("rose gold", "white gold")',
    ruling: 'Use 10k — the entry karat, most durable, and the price the customer most likely expects.',
  },
  {
    situation: 'A karat is named with no colour ("18k", "14k ones")',
    ruling: 'Use yellow gold — the default gold colour when none is stated.',
  },
  {
    situation: 'No metal is named at all',
    ruling: 'Use 10k yellow gold — the most common grillz order — unless the wording implies otherwise (see "the other one" below).',
  },
  {
    situation: 'Stones are named with no setting ("rubies set in 14k yellow")',
    ruling: 'Use the prong setting — uniform rows are the neutral way to set stones that were not described as iced out.',
  },
  {
    situation: '"The other one" / "not gold" with no metal named',
    ruling: 'Use silver — in context it means the non-gold metal, and silver is the standard alternative customers mean.',
  },
  {
    situation: '"See-through style" / "see through" / "windows"',
    ruling: 'Use the open-face style — a metal frame with the natural tooth showing through is the see-through design.',
  },
  {
    situation: 'No finish or style is named',
    ruling: 'Use solid — a clean mirror polish is the unmarked default finish.',
  },
  {
    situation: 'Silver or platinum (non-gold metals)',
    ruling: 'Karat does not apply; the schema still requires the field, so emit 10k and let pricing/rendering ignore it.',
  },
  {
    situation: 'Anything the schema cannot represent (a VVS clarity grade, enamel colours, charms, per-tooth different stones, all-pointed teeth)',
    ruling: 'NEVER invent an enum value or force-fit the closest option. Build the closest VALID config from what was specified and list the unrepresentable part in the "unsupported" array, in the customer\'s own words.',
  },
];

/** ASSUMPTION: a gold colour named without a karat means 10k. */
export const DEFAULT_KARAT: KaratId = '10k';

/** ASSUMPTION: a karat named without a colour means yellow gold. */
export const DEFAULT_GOLD_METAL: MetalId = 'yellow';

/** ASSUMPTION: no metal named at all means 10k yellow gold. */
export const DEFAULT_METAL: MetalId = 'yellow';

/** ASSUMPTION: stones named without a setting get the prong setting. */
export const DEFAULT_SETTING_FOR_STONES: SettingId = 'prong';

/** ASSUMPTION: "the other one" (the non-gold one) means silver. */
export const OTHER_ONE_METAL: MetalId = 'silver';

/** ASSUMPTION: "see-through style" means the open-face style. */
export const SEE_THROUGH_STYLE: StyleId = 'open-face';

/** Phrases that mean open-face even though they never say "open". */
export const SEE_THROUGH_PHRASES = ['see-through', 'see through', 'seethrough', 'windows', 'window'] as const;

/** Phrases that mean "the other one" — the non-gold metal, i.e. silver. */
export const OTHER_ONE_PHRASES = ['the other one', 'not gold', 'no gold'] as const;
