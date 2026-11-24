import {
  CUTS,
  DEFAULT_TOOTH,
  GRILLZ_TYPES,
  KARATS,
  METALS,
  SETTINGS,
  STONES,
  STYLES,
  parseRenderSpec,
  type RenderSpec,
  type ToothDesign,
} from './renderSpec.ts';
import { buildRepairMessage, buildSystemPrompt } from './prompt.ts';

/**
 * The Ember parser: free text in, validated RenderSpec out.
 *
 * Flow: system prompt (prompt.ts, generated from the schema) + customer text
 * -> model reply -> JSON extraction -> granular validation -> if invalid,
 * the validation errors are fed back to the model for up to MAX_REPAIRS
 * repair attempts. Every attempt is logged (raw output, errors, token
 * usage) — that log is the prompt/token trace the hackathon submission
 * requires.
 *
 * Modes:
 * - mock (default, and the only mode until Ember credits land): a
 *   deterministic canned client, so the whole pipeline — demo, evals, the
 *   repair loop — runs offline with zero API spend.
 * - live: assembles the real request but does NOT send it yet. The fetch is
 *   a one-line TODO behind `EMBER_LIVE_SEND=1`, to flip when credits land
 *   and the endpoint/model id are confirmed from the hackathon docs.
 */

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type AttemptLog = {
  attempt: number;
  /** Raw model reply for this attempt (null when the call itself failed). */
  rawOutput: string | null;
  valid: boolean;
  errors: string[];
  usage: TokenUsage | null;
  note?: string;
};

export type ParseResult = {
  /** The validated config, or null when no valid config exists. */
  spec: RenderSpec | null;
  /** True when the parser deliberately flagged instead of guessing (empty config + explanation). */
  flagged: boolean;
  /** Request parts the schema cannot represent, in the customer's words. */
  unsupported: string[];
  attempts: AttemptLog[];
  mode: 'mock' | 'live';
  error?: string;
};

export interface EmberClient {
  mode: 'mock' | 'live';
  complete(messages: ChatMessage[]): Promise<{ text: string; usage: TokenUsage | null }>;
}

export const MAX_REPAIRS = 2;

// ---------------------------------------------------------------------------
// Validation. parseRenderSpec() is the final authority but returns only
// null; the repair loop needs to know WHAT was wrong, so these checks mirror
// it and produce one message per problem.
// ---------------------------------------------------------------------------

const enumIds = (list: readonly { id: string }[]) => new Set(list.map((item) => item.id));
const METAL_IDS = enumIds(METALS);
const KARAT_IDS = enumIds(KARATS);
const TYPE_IDS = enumIds(GRILLZ_TYPES);
const STYLE_IDS = enumIds(STYLES);
const SETTING_IDS = enumIds(SETTINGS);
const STONE_IDS = enumIds(STONES);
const CUT_IDS = enumIds(CUTS);

export function validateSpec(candidate: unknown): string[] {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return ['output is not a JSON object'];
  }
  const spec = candidate as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(spec.teeth)) {
    errors.push('"teeth" is missing or is not an array');
  } else {
    if (spec.teeth.length > 32) errors.push(`"teeth" has ${spec.teeth.length} entries; the maximum is 32`);
    const seen = new Set<number>();
    spec.teeth.forEach((raw, i) => {
      const at = `teeth[${i}]`;
      if (!raw || typeof raw !== 'object') {
        errors.push(`${at} is not an object`);
        return;
      }
      const tooth = raw as Record<string, unknown>;
      if (typeof tooth.index !== 'number' || !Number.isInteger(tooth.index) || tooth.index < 0 || tooth.index > 31) {
        errors.push(`${at}.index must be an integer 0-31, got ${JSON.stringify(tooth.index)}`);
      } else if (seen.has(tooth.index)) {
        errors.push(`${at}.index ${tooth.index} is duplicated`);
      } else {
        seen.add(tooth.index);
      }
      const check = (field: string, ids: Set<string>) => {
        if (typeof tooth[field] !== 'string' || !ids.has(tooth[field] as string)) {
          errors.push(`${at}.${field} must be one of ${[...ids].join(' | ')}, got ${JSON.stringify(tooth[field])}`);
        }
      };
      check('metal', METAL_IDS);
      check('karat', KARAT_IDS);
      check('type', TYPE_IDS);
      check('style', STYLE_IDS);
      check('setting', SETTING_IDS);
      check('stone', STONE_IDS);
    });
  }
  if (typeof spec.fangs !== 'boolean') errors.push('"fangs" must be a boolean');
  if (typeof spec.cut !== 'string' || !CUT_IDS.has(spec.cut)) {
    errors.push(`"cut" must be one of ${[...CUT_IDS].join(' | ')}, got ${JSON.stringify(spec.cut)}`);
  }
  if (typeof spec.vision !== 'string') errors.push('"vision" must be a string');
  else if (spec.vision.length > 500) errors.push('"vision" is longer than 500 characters');
  if (spec.unsupported !== undefined) {
    if (!Array.isArray(spec.unsupported) || spec.unsupported.some((u) => typeof u !== 'string')) {
      errors.push('"unsupported" must be an array of strings');
    }
  }
  // Final gate: the production validator must accept what we accept.
  if (errors.length === 0 && Array.isArray(spec.teeth) && spec.teeth.length > 0 && parseRenderSpec(candidate) === null) {
    errors.push('rejected by parseRenderSpec');
  }
  return errors;
}

/** Pull the first JSON object out of a model reply (fences, stray prose, etc.). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Mock client — deterministic canned parses, zero spend. A few eval-set
// inputs are canned exactly; one ("6x6 all open faced") deliberately returns
// an invalid enum on attempt 0 so the repair loop is exercised end-to-end.
// Everything else gets a fixed fallback config so the pipeline still runs.
// ---------------------------------------------------------------------------

const tooth = (index: number, design: Partial<ToothDesign> = {}): ToothDesign & { index: number } => ({
  index,
  ...DEFAULT_TOOTH,
  ...design,
});

/** Indices for `count` front teeth of an arch (base 0 = top, 16 = bottom), centred on the front. */
const frontTeeth = (base: number, count: number, design: Partial<ToothDesign> = {}) => {
  const start = 8 - Math.floor(count / 2);
  return Array.from({ length: count }, (_, i) => tooth(base + start + i, design));
};

const canned = (teeth: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ teeth, fangs: false, cut: 'deep', vision: '', unsupported: [], ...extra });

const CANNED: Record<string, string[]> = {
  'bottom 8 in 14k yellow gold solid': [
    canned(frontTeeth(16, 8, { metal: 'yellow', karat: '14k', type: 'plain', style: 'solid' })),
  ],
  'i want a full set top and bottom 8 silver': [
    canned([
      ...frontTeeth(0, 8, { metal: 'silver', type: 'plain', style: 'solid' }),
      ...frontTeeth(16, 8, { metal: 'silver', type: 'plain', style: 'solid' }),
    ]),
  ],
  '6 by 6 but like not gold the other one and the see through style on the bottoms only': [
    canned([
      ...frontTeeth(0, 6, { metal: 'silver', type: 'plain', style: 'solid' }),
      ...frontTeeth(16, 6, { metal: 'silver', type: 'plain', style: 'open-face' }),
    ]),
  ],
  'how much for 10 top 10 bottom all diamonds vvs': [
    canned(
      [
        ...frontTeeth(0, 10, { metal: 'yellow', type: 'iced', style: 'solid', stone: 'lab' }),
        ...frontTeeth(16, 10, { metal: 'yellow', type: 'iced', style: 'solid', stone: 'lab' }),
      ],
      { unsupported: ['VVS clarity grade'] },
    ),
  ],
  // Attempt 0 uses "open_face" — an enum from the eval-set draft format that
  // does not exist in the production schema ("open-face"). Validation rejects
  // it, the errors go back, and attempt 1 is the corrected config.
  '6x6 all open faced': [
    canned([
      ...frontTeeth(0, 6, { type: 'plain', style: 'open_face' as ToothDesign['style'] }),
      ...frontTeeth(16, 6, { type: 'plain', style: 'open_face' as ToothDesign['style'] }),
    ]),
    canned([
      ...frontTeeth(0, 6, { type: 'plain', style: 'open-face' }),
      ...frontTeeth(16, 6, { type: 'plain', style: 'open-face' }),
    ]),
  ],
};

const FALLBACK = canned([...frontTeeth(0, 6), ...frontTeeth(16, 6)]);

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const fakeUsage = (messages: ChatMessage[], text: string): TokenUsage => ({
  inputTokens: Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4),
  outputTokens: Math.ceil(text.length / 4),
});

export class MockEmberClient implements EmberClient {
  mode = 'mock' as const;

  async complete(messages: ChatMessage[]): Promise<{ text: string; usage: TokenUsage | null }> {
    const firstUser = messages.find((m) => m.role === 'user')?.content ?? '';
    const attempt = messages.filter((m) => m.role === 'assistant').length;
    const responses = CANNED[normalize(firstUser)];
    const text = responses ? responses[Math.min(attempt, responses.length - 1)] : FALLBACK;
    return { text, usage: fakeUsage(messages, text) };
  }
}

// ---------------------------------------------------------------------------
// Live client — stub. Assembles the real request (endpoint, headers, body)
// and records it, but does not send: no credits have landed yet, and the
// exact endpoint/model id must be confirmed from the Ember docs first.
// ---------------------------------------------------------------------------

export class LiveNotReadyError extends Error {
  assembledRequest: unknown;
  constructor(message: string, assembledRequest?: unknown) {
    super(message);
    this.assembledRequest = assembledRequest;
  }
}

export class LiveEmberClient implements EmberClient {
  mode = 'live' as const;
  private apiKey: string | undefined;
  private model: string;
  private baseUrl: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.EMBER_API_KEY ?? env.META_MODEL_API_KEY;
    // PLACEHOLDER values — confirm against the Ember API docs when credits land.
    this.model = env.EMBER_MODEL ?? 'muse-ember';
    this.baseUrl = env.EMBER_API_BASE ?? 'https://api.meta.ai/v1';
  }

  async complete(messages: ChatMessage[]): Promise<{ text: string; usage: TokenUsage | null }> {
    const request = {
      method: 'POST',
      url: `${this.baseUrl}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: 'Bearer <redacted>' },
      body: { model: this.model, messages, temperature: 0, response_format: { type: 'json_object' } },
    };
    if (!this.apiKey) {
      throw new LiveNotReadyError('live mode requested but no EMBER_API_KEY / META_MODEL_API_KEY is set', request);
    }
    // TODO(credits): replace this throw with the actual fetch once Ember
    // credits land and the endpoint/model above are confirmed. Until then
    // live mode assembles the request for the trace and stops — zero spend.
    throw new LiveNotReadyError('live send is stubbed until Ember credits land (request assembled, not sent)', request);
  }
}

export function clientFromEnv(env: NodeJS.ProcessEnv = process.env): EmberClient {
  return env.EMBER_MODE === 'live' ? new LiveEmberClient(env) : new MockEmberClient();
}

// ---------------------------------------------------------------------------
// The parser itself.
// ---------------------------------------------------------------------------

export async function parseGrillz(
  input: string,
  client: EmberClient = clientFromEnv(),
): Promise<ParseResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: input },
  ];
  const attempts: AttemptLog[] = [];
  let lastUnsupported: string[] = [];

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    let raw: { text: string; usage: TokenUsage | null };
    try {
      raw = await client.complete(messages);
    } catch (err) {
      const note = err instanceof Error ? err.message : String(err);
      attempts.push({ attempt, rawOutput: null, valid: false, errors: [note], usage: null, note: 'client error' });
      return { spec: null, flagged: false, unsupported: lastUnsupported, attempts, mode: client.mode, error: note };
    }

    const candidate = extractJson(raw.text);
    if (candidate === undefined) {
      const errors = ['reply contained no parseable JSON object'];
      attempts.push({ attempt, rawOutput: raw.text, valid: false, errors, usage: raw.usage });
      if (attempt < MAX_REPAIRS) {
        messages.push({ role: 'assistant', content: raw.text }, { role: 'user', content: buildRepairMessage(errors, raw.text) });
      }
      continue;
    }

    const record = candidate as Record<string, unknown>;
    lastUnsupported = Array.isArray(record.unsupported)
      ? record.unsupported.filter((u): u is string => typeof u === 'string')
      : [];

    // Deliberate flag: empty config + an explanation is a SUCCESS outcome —
    // the parser saying "I can't build that" instead of hallucinating one.
    if (Array.isArray(record.teeth) && record.teeth.length === 0 && lastUnsupported.length > 0) {
      attempts.push({ attempt, rawOutput: raw.text, valid: true, errors: [], usage: raw.usage, note: 'flagged, no config' });
      return { spec: null, flagged: true, unsupported: lastUnsupported, attempts, mode: client.mode };
    }

    const errors = validateSpec(candidate);
    if (errors.length === 0) {
      attempts.push({ attempt, rawOutput: raw.text, valid: true, errors: [], usage: raw.usage });
      return { spec: parseRenderSpec(candidate), flagged: false, unsupported: lastUnsupported, attempts, mode: client.mode };
    }

    attempts.push({ attempt, rawOutput: raw.text, valid: false, errors, usage: raw.usage });
    if (attempt < MAX_REPAIRS) {
      messages.push({ role: 'assistant', content: raw.text }, { role: 'user', content: buildRepairMessage(errors, raw.text) });
    }
  }

  return {
    spec: null,
    flagged: false,
    unsupported: lastUnsupported,
    attempts,
    mode: client.mode,
    error: `no valid configuration after ${MAX_REPAIRS + 1} attempts`,
  };
}
