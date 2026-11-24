# Type-a-Grill

An Ember-powered parser that turns plain-language grillz orders into exact build configurations.

Built for the Meta Muse Ember Hackathon (Nov 23 – Dec 2, 2026). The parser is a
standalone service: free text in, validated JSON configuration out, using the
same design schema as the production VVS Lab builder.

## Contents

- `src/renderSpec.ts` — the design catalog and schema (metals, karats, styles,
  settings, stones, per-tooth designs), validation, and spec description.
  Extracted from the production builder; this is the exact output format the
  parser must produce.
- `evals/eval-set.json` — 40 customer-style prompts with hand-checked expected
  configurations (easy / medium / hard / adversarial), used to score parser
  accuracy.

## Status

Schema and eval set in place. Parser (Muse Ember, schema-constrained tool call
plus a validation-and-repair loop) in build.
