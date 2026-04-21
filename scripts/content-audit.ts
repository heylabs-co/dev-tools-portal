/**
 * Content audit — one-shot completeness scan across all collections.
 * Read-only. Prints a structured report so we know what to fix.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const DIR = {
  companies: join(ROOT, 'data/companies'),
  categories: join(ROOT, 'data/categories'),
  useCases: join(ROOT, 'data/use-cases'),
  comparisons: join(ROOT, 'data/comparisons'),
  mcp: join(ROOT, 'data/mcp-servers'),
  skills: join(ROOT, 'data/ai-skills-catalog'),
  vscode: join(ROOT, 'data/vscode-catalog'),
  jetbrains: join(ROOT, 'data/jetbrains-catalog'),
  logos: join(ROOT, 'public/logos'),
};

function loadDir(path: string): Array<{ file: string; data: any }> {
  if (!existsSync(path)) return [];
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(join(path, file), 'utf-8')),
    }));
}

const pct = (n: number, total: number) =>
  total === 0 ? '—' : `${((n / total) * 100).toFixed(1)}%`;

// ── Companies ────────────────────────────────────────────────────────────
const companies = loadDir(DIR.companies);
const companySlugs = new Set(companies.map((c) => c.data.slug));
const total = companies.length;

let missingPricing = 0;
let missingLockIn = 0;
let missingTransparency = 0;
let missingDx = 0;
let missingLogo = 0;
let missingLogoFile = 0;
let missingSeoTitle = 0;
let missingSeoDesc = 0;
let missingPrimaryCat = 0;
let missingDescription = 0;

const brokenAlts: Array<{ slug: string; broken: string[] }> = [];

for (const { data } of companies) {
  if (!data.pricing?.model) missingPricing++;
  if (!data.scores?.lock_in?.level) missingLockIn++;
  if (!data.scores?.transparency?.level) missingTransparency++;
  if (!data.scores?.developer_experience?.level) missingDx++;

  if (!data.logo) missingLogo++;
  else {
    const logoName = data.logo.replace(/^\/?logos\//, '').replace(/^\//, '');
    if (!existsSync(join(DIR.logos, logoName))) missingLogoFile++;
  }

  if (!data.seo?.title) missingSeoTitle++;
  if (!data.seo?.meta_description) missingSeoDesc++;
  if (!data.categories?.primary?.slug) missingPrimaryCat++;
  if (!data.description) missingDescription++;

  const alts: string[] = Array.isArray(data.alternatives) ? data.alternatives : [];
  const broken = alts.filter((s) => !companySlugs.has(s));
  if (broken.length) brokenAlts.push({ slug: data.slug, broken });
}

// ── Categories ──────────────────────────────────────────────────────────
const categories = loadDir(DIR.categories);
const emptyCats = categories.filter(
  (c) => !c.data.companies || c.data.companies.length === 0
);

// Cross-check: do category.companies[] slugs all exist?
const brokenCatRefs: Array<{ cat: string; broken: string[] }> = [];
for (const { data } of categories) {
  const refs: string[] = Array.isArray(data.companies) ? data.companies : [];
  const broken = refs.filter((s) => !companySlugs.has(s));
  if (broken.length) brokenCatRefs.push({ cat: data.slug, broken });
}

// ── Use Cases ───────────────────────────────────────────────────────────
const useCases = loadDir(DIR.useCases);
const brokenUcRefs: Array<{ uc: string; broken: string[] }> = [];
for (const { data } of useCases) {
  const toolSlugs: string[] = Array.isArray(data.tools)
    ? data.tools.map((t: any) => t.slug).filter(Boolean)
    : [];
  const broken = toolSlugs.filter((s) => !companySlugs.has(s));
  if (broken.length) brokenUcRefs.push({ uc: data.slug, broken });
}

// ── Comparisons ─────────────────────────────────────────────────────────
const comparisons = loadDir(DIR.comparisons);
const brokenCompare: Array<{ file: string; broken: string[] }> = [];
for (const { file, data } of comparisons) {
  const candidates: string[] = [];
  // Common shapes: { a, b } | { tool_a, tool_b } | { slug_a, slug_b } | { pair: [a, b] }
  if (data.a) candidates.push(data.a);
  if (data.b) candidates.push(data.b);
  if (data.tool_a) candidates.push(data.tool_a);
  if (data.tool_b) candidates.push(data.tool_b);
  if (Array.isArray(data.pair)) candidates.push(...data.pair);
  if (Array.isArray(data.tools)) candidates.push(...data.tools);
  const broken = candidates.filter((s) => typeof s === 'string' && !companySlugs.has(s));
  if (broken.length) brokenCompare.push({ file, broken });
}

// ── Other collections ───────────────────────────────────────────────────
const mcp = loadDir(DIR.mcp);
const mcpMissingRepo = mcp.filter((x) => !x.data.github_repo).length;
const mcpMissingDesc = mcp.filter((x) => !x.data.description).length;

const skills = loadDir(DIR.skills);
const skillsMissingSource = skills.filter((x) => !x.data.source_url).length;
const skillsMissingDesc = skills.filter((x) => !x.data.description).length;

const vscode = loadDir(DIR.vscode);
const vscodeMissingPub = vscode.filter((x) => !x.data.publisher).length;
const vscodeMissingDesc = vscode.filter((x) => !x.data.description).length;

const jb = loadDir(DIR.jetbrains);
const jbMissingPub = jb.filter((x) => !x.data.publisher).length;
const jbMissingDesc = jb.filter((x) => !x.data.description).length;

// ── Report ──────────────────────────────────────────────────────────────
const line = '─'.repeat(64);
console.log(line);
console.log(`CONTENT AUDIT — ${new Date().toISOString()}`);
console.log(line);

console.log(`\n▼ COMPANIES  (${total})`);
console.log(`  pricing.model missing        ${missingPricing.toString().padStart(4)}  (${pct(missingPricing, total)})`);
console.log(`  scores.lock_in missing       ${missingLockIn.toString().padStart(4)}  (${pct(missingLockIn, total)})`);
console.log(`  scores.transparency missing  ${missingTransparency.toString().padStart(4)}  (${pct(missingTransparency, total)})`);
console.log(`  scores.dev_experience missing${missingDx.toString().padStart(4)}  (${pct(missingDx, total)})`);
console.log(`  logo field missing           ${missingLogo.toString().padStart(4)}  (${pct(missingLogo, total)})`);
console.log(`  logo file missing on disk    ${missingLogoFile.toString().padStart(4)}  (${pct(missingLogoFile, total)})`);
console.log(`  seo.title missing            ${missingSeoTitle.toString().padStart(4)}  (${pct(missingSeoTitle, total)})`);
console.log(`  seo.meta_description missing ${missingSeoDesc.toString().padStart(4)}  (${pct(missingSeoDesc, total)})`);
console.log(`  categories.primary missing   ${missingPrimaryCat.toString().padStart(4)}  (${pct(missingPrimaryCat, total)})`);
console.log(`  description missing          ${missingDescription.toString().padStart(4)}  (${pct(missingDescription, total)})`);
console.log(`  broken alternatives          ${brokenAlts.length.toString().padStart(4)} companies`);

console.log(`\n▼ CATEGORIES  (${categories.length})`);
console.log(`  empty (0 companies)          ${emptyCats.length}`);
if (emptyCats.length) console.log(`    → ${emptyCats.slice(0, 10).map((c) => c.data.slug).join(', ')}${emptyCats.length > 10 ? ', …' : ''}`);
console.log(`  with broken company refs     ${brokenCatRefs.length}`);

console.log(`\n▼ USE CASES  (${useCases.length})`);
console.log(`  with broken tool slugs       ${brokenUcRefs.length}`);
if (brokenUcRefs.length) {
  for (const b of brokenUcRefs.slice(0, 5)) console.log(`    → ${b.uc}: ${b.broken.join(', ')}`);
}

console.log(`\n▼ COMPARISONS  (${comparisons.length})`);
console.log(`  with broken tool slugs       ${brokenCompare.length}`);
if (brokenCompare.length) {
  for (const b of brokenCompare.slice(0, 5)) console.log(`    → ${b.file}: ${b.broken.join(', ')}`);
}

console.log(`\n▼ MCP SERVERS  (${mcp.length})`);
console.log(`  github_repo missing          ${mcpMissingRepo}  (${pct(mcpMissingRepo, mcp.length)})`);
console.log(`  description missing          ${mcpMissingDesc}  (${pct(mcpMissingDesc, mcp.length)})`);

console.log(`\n▼ AI SKILLS  (${skills.length})`);
console.log(`  source_url missing           ${skillsMissingSource}  (${pct(skillsMissingSource, skills.length)})`);
console.log(`  description missing          ${skillsMissingDesc}  (${pct(skillsMissingDesc, skills.length)})`);

console.log(`\n▼ VS CODE  (${vscode.length})`);
console.log(`  publisher missing            ${vscodeMissingPub}`);
console.log(`  description missing          ${vscodeMissingDesc}`);

console.log(`\n▼ JETBRAINS  (${jb.length})`);
console.log(`  publisher missing            ${jbMissingPub}`);
console.log(`  description missing          ${jbMissingDesc}`);

console.log(`\n${line}`);
