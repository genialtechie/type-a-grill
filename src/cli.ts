import { describeSpec, priceBreakdown } from './renderSpec.ts';
import { parseGrillz } from './parse.ts';

/**
 * CLI demo: `npm run parse -- "bottom six silver and the top rose gold"`
 * Prints the validated config, a plain-language description, the sample
 * price, any unsupported flags, and the full attempt trace.
 */
const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  console.error('usage: npm run parse -- "<customer order text>"');
  process.exit(1);
}

const result = await parseGrillz(input);
console.log(`mode: ${result.mode}`);
if (result.spec) {
  console.log(JSON.stringify(result.spec, null, 2));
  console.log(`\ndescription: ${describeSpec(result.spec)}`);
  console.log(`sample price: $${priceBreakdown(result.spec.teeth, result.spec).total}`);
} else if (result.flagged) {
  console.log('no configuration — the parser flagged this instead of guessing');
} else {
  console.log(`no configuration — ${result.error ?? 'parse failed'}`);
}
if (result.unsupported.length) console.log(`unsupported: ${result.unsupported.join('; ')}`);
console.log('\nattempt trace:');
for (const a of result.attempts) {
  const tokens = a.usage ? ` (${a.usage.inputTokens} in / ${a.usage.outputTokens} out tokens)` : '';
  console.log(`  attempt ${a.attempt}: ${a.valid ? 'valid' : `invalid — ${a.errors.join('; ')}`}${tokens}`);
}
