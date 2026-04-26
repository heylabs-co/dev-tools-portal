/**
 * Split /tmp/migration-targets.json into per-agent chunks.
 *
 * Each chunk is a JSON array of {source, target, source_hwm, target_hwm}
 * objects. Agents read their chunk file, generate one migration-guide JSON
 * per pair, and write all of them into a single output file.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const CHUNK_SIZE = 10;
const SRC = '/tmp/migration-targets.json';

const targets = JSON.parse(readFileSync(SRC, 'utf-8')) as Array<{
  source: { slug: string; name: string };
  target: { slug: string; name: string };
  pair_slug: string;
  category?: string;
  score: number;
  source_hwm: boolean;
  target_hwm: boolean;
}>;

console.log(`Total targets: ${targets.length}`);

const chunks = [];
for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
  chunks.push(targets.slice(i, i + CHUNK_SIZE));
}

console.log(`Splitting into ${chunks.length} chunks of up to ${CHUNK_SIZE} pairs each`);

for (let i = 0; i < chunks.length; i++) {
  const path = `/tmp/migration-chunk-${i + 1}.json`;
  writeFileSync(path, JSON.stringify(chunks[i], null, 2), 'utf-8');
  console.log(`  ${path} — ${chunks[i].length} pairs`);
}
