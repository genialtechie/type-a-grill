import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { describeSpec, priceBreakdown, summarizeDesign } from '../src/renderSpec.ts';
import { parseGrillz } from '../src/parse.ts';

/**
 * Demo harness server: `npm run demo`, then open http://localhost:4173
 * Serves demo/index.html and a POST /parse endpoint backed by the real
 * parser (mock mode until Ember credits land — zero API spend).
 */
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const port = Number(process.env.PORT ?? 4173);

createServer(async (req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (req.method === 'POST' && req.url === '/parse') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { text } = JSON.parse(body) as { text?: string };
      if (!text?.trim()) throw new Error('empty input');
      const result = await parseGrillz(text);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          mode: result.mode,
          spec: result.spec,
          flagged: result.flagged,
          unsupported: result.unsupported,
          error: result.error ?? null,
          attempts: result.attempts.map((a) => ({
            attempt: a.attempt,
            valid: a.valid,
            errors: a.errors,
            usage: a.usage,
            note: a.note ?? null,
          })),
          description: result.spec ? describeSpec(result.spec) : null,
          summary: result.spec ? summarizeDesign(result.spec) : [],
          price: result.spec ? priceBreakdown(result.spec.teeth, result.spec).total : null,
        }),
      );
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
}).listen(port, () => console.log(`Type-a-Grill demo: http://localhost:${port}`));
