/**
 * Split 0002_seed.sql into smaller chunk files (100KB each) to work around
 * the D1 /import endpoint's apparent timeout on larger payloads.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '0002_seed.sql'), 'utf-8');

const statements = src.split(/;\s*\n/).filter(s => s.trim().startsWith('INSERT'));
const CHUNK_BYTES = 80_000;

let chunkIdx = 1;
let current = '';
let current_stmts = 0;

function flush() {
  if (!current) return;
  const out = join(__dirname, `0002_seed_${String(chunkIdx).padStart(2, '0')}.sql`);
  writeFileSync(out, current);
  console.log(`  ${out}: ${current.length} bytes, ${current_stmts} stmts`);
  current = '';
  current_stmts = 0;
  chunkIdx++;
}

for (const s of statements) {
  const stmt = s.trim() + ';\n\n';
  if (current.length + stmt.length > CHUNK_BYTES && current.length > 0) flush();
  current += stmt;
  current_stmts++;
}
flush();
console.log(`Total ${chunkIdx - 1} chunks`);
