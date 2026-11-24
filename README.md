# Type-a-Grill

An Ember-powered parser that turns plain-language grillz orders into exact build configurations.

Built for the Meta Muse Ember Hackathon (Nov 23 – Dec 2, 2026). The parser is a
standalone service: free text in, validated JSON configuration out, using the
same design schema as the production VVS Lab builder.

A customer types what they would say to a jeweler —

> "bottom six silver and the top rose gold"
> "make the canines open face, rest of the top 8 solid 14k yellow"
> "6 by 6 but like NOT gold, the other one, and the see-through style on the bottoms only"

— and gets back the exact per-tooth configuration the builder needs: metal,
karat, finish, stones, per tooth, with the parts the product cannot do
**flagged instead of hallucinated**.

## How it works

1. **System prompt generated from the schema** (`src/prompt.ts`) — the enum
   lists are read from the production catalog, so the prompt can never drift
   from what the validator enforces.
2. **Schema-constrained parse** (`src/parse.ts`) — the model returns one JSON
   object; anything else is rejected.
3. **Validation-and-repair loop** — output is checked field by field against
   the production validator (`parseRenderSpec` in `src/renderSpec.ts`). On
   failure, the specific validation errors are fed back to the model, up to
   2 repair attempts. Every attempt — raw output, errors, token usage — is
   logged; that log is the prompt/token trace.
4. **Flag, don't guess** — requests the schema cannot represent (a VVS
   clarity grade, rubies, a different stone on every tooth) come back in an
   `unsupported` list, in the customer's own words, next to the closest valid
   config. A message with no order in it returns an empty config plus a flag,
   never an invented one.

## Contents

- `src/renderSpec.ts` — the design catalog and schema (metals, karats, styles,
  settings, stones, per-tooth designs), validation, and spec description.
  Extracted from the production builder; this is the exact output format the
  parser must produce.
- `src/defaults.ts` — the documented rulings for ambiguous input (see below).
- `src/prompt.ts` — builds the system prompt from the schema + the rulings.
- `src/parse.ts` — the Ember client wrapper (mock + live modes), the granular
  validator, and the validation-and-repair loop.
- `src/cli.ts` — one-shot CLI: parse a prompt, print config + description +
  sample price + attempt trace.
- `src/baseline-wish.js` — the baseline: `wish()`, the regex word-matcher the
  v2 builder prototype used as its "stand-in for the AI", extracted verbatim.
  One patch applied to the whole set — no split metals per arch, no per-tooth
  exceptions, coloured stones snap to the closest match. The before picture.
- `evals/eval-set.json` — 40 customer-style prompts with hand-checked expected
  configurations (easy / medium / hard / adversarial), used to score parser
  accuracy.
- `evals/run.ts` — the eval runner: every case through the Ember parser AND
  the baseline, scored identically, with a comparison table.
- `demo/` — a minimal demo harness: text box → parsed JSON → 2D tooth map.

## Running it

```bash
npm install

npm run parse -- "bottom six silver and the top rose gold"   # CLI one-shot
npm run demo        # web harness at http://localhost:4173
npm run eval        # the 40-case eval, parser vs baseline
npm run typecheck
```

### Mock mode (default — zero API spend)

Until Ember credits land, the parser runs against a deterministic mock
client: a handful of eval inputs have canned parses (one deliberately
returns an invalid enum first, so the repair loop fires), everything else
gets a fixed fallback config. Mock eval scores are therefore **not**
representative of the live model — they prove the pipeline runs end to end
and show the shape of the report.

Current mock-mode eval (Nov 24, 2026):

|                    | exact match | field accuracy | flags raised |
| ------------------ | ----------- | -------------- | ------------ |
| Ember parser (mock) | 5/35       | 50%            | 0/5          |
| Baseline `wish()`  | 6/35        | 81%            | 0/5          |

Read the baseline row carefully: the regex matcher is decent at individual
fields on simple prompts, which is exactly why it survived as a stand-in —
but a jeweler builds from the *exact* configuration, and on splits,
per-tooth exceptions and anything adversarial it force-fits an answer
instead of flagging. Exact match and flag behaviour are the numbers that
matter, and both are where the Ember parser is built to win once live.

### Live mode (when credits land)

Set `EMBER_API_KEY` (or `META_MODEL_API_KEY`) and `EMBER_MODE=live`. The
live client already assembles the real request (endpoint, headers, JSON
body) and records it in the attempt trace; the actual send is a one-line
TODO in `src/parse.ts`, gated until the endpoint and model id are confirmed
from the Ember docs and the $10 credit budget is in hand. Every token is
budgeted: temperature 0, one system prompt, max 2 repairs.

## Defaults and assumptions

Customers under-specify. Rather than let the model improvise differently
each call, every gap has one ruling in `src/defaults.ts` (each marked as an
assumption, all in one place):

- Gold colour with no karat ("rose gold") → **10k**
- Karat with no colour ("18k") → **yellow gold**
- No metal at all → **10k yellow gold**
- Stones named with no setting → **prong setting**
- "The other one" / "not gold" → **silver**
- "See-through style" / "windows" → **open-face**
- No finish named → **solid**
- Silver/platinum still emit a karat (schema requires it); it is ignored
- Anything the schema cannot represent → **flagged in `unsupported`, never
  invented or force-fit**

## Status

Skeleton complete and running in mock mode: prompt generation, validator,
repair loop, CLI, demo harness, and the parser-vs-baseline eval all work
offline. Next: Ember credits → flip live mode → real eval numbers →
3-minute demo video. Submission due Dec 2, 9:00 PM ET.
