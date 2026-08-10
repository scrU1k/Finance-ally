import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Allow remote model loading in Node environment
env.allowRemoteModels = true;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RawRule {
  id: string;
  intent: string;
  scope: string;
  requiresBaseline: boolean;
  templateVars: string[];
  text: string;
  actionable: string;
}

interface ComputedRule extends RawRule {
  vector384: number[];
}

async function buildDB() {
  console.log('[build:db] Loading Xenova/bge-small-en-v1.5 in Node...');
  
  const extractor = await pipeline(
    'feature-extraction',
    'Xenova/bge-small-en-v1.5',
    { quantized: true }
  );

  const rawPath = path.resolve(__dirname, 'raw_financial_rules.json');
  const rawRules: RawRule[] = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));

  console.log(`[build:db] Computing embeddings for ${rawRules.length} rules...`);

  const computed: ComputedRule[] = [];

  for (const rule of rawRules) {
    const embeddingInput = `${rule.text} ${rule.actionable}`;
    const output = await extractor(embeddingInput, { pooling: 'cls', normalize: true });
    const vector = Array.from(output.data as Float32Array);

    computed.push({ ...rule, vector384: vector });
    process.stdout.write('.');
  }

  console.log('\n[build:db] Writing financialRulesDB.json...');

  const outputPath = path.resolve(__dirname, '../public/financialRulesDB.json');
  const publicDir = path.dirname(outputPath);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(computed));

  const stats = fs.statSync(outputPath);
  const sizeKB = Math.round(stats.size / 1024);
  console.log(`[build:db] Done. Output: ${sizeKB}KB (budget: 1500KB)`);

  if (sizeKB > 1500) {
    console.error('[build:db] WARNING: Output exceeds 1500KB budget. Reduce rule count or compress.');
    process.exit(1);
  }
}

buildDB().catch(err => {
  console.error('[build:db] FAILED:', err);
  process.exit(1);
});
