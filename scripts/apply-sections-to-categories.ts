/**
 * Apply section mapping to categories.
 *
 * Reads data/meta/sections.json and writes a `section` field into each
 * data/categories/*.json that belongs to a section.
 *
 * Run: npx tsx scripts/apply-sections-to-categories.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const SECTIONS_FILE = join(ROOT, 'data/meta/sections.json');
const CATS_DIR = join(ROOT, 'data/categories');

type Section = {
  slug: string;
  name: string;
  icon: string;
  description: string;
  order: number;
  categories: string[];
};

const sections = JSON.parse(readFileSync(SECTIONS_FILE, 'utf-8')) as Section[];

// Build category → section map
const categoryToSection = new Map<string, string>();
for (const s of sections) {
  for (const cat of s.categories) {
    categoryToSection.set(cat, s.slug);
  }
}

let updated = 0;
let unmapped: string[] = [];

for (const [cat, sectionSlug] of categoryToSection) {
  const fp = join(CATS_DIR, `${cat}.json`);
  let data: any;
  try {
    data = JSON.parse(readFileSync(fp, 'utf-8'));
  } catch {
    unmapped.push(cat);
    continue;
  }
  data.section = sectionSlug;
  writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
  updated++;
}

// Find categories that exist but aren't in any section
import { readdirSync } from 'fs';
const allCategoryFiles = readdirSync(CATS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
const orphaned = allCategoryFiles.filter((c) => !categoryToSection.has(c));

console.log(`Updated ${updated} category files`);
if (unmapped.length) console.log(`Missing files: ${unmapped.join(', ')}`);
if (orphaned.length) console.log(`Orphaned (no section assigned): ${orphaned.join(', ')}`);
console.log(`Sections total: ${sections.length}`);
