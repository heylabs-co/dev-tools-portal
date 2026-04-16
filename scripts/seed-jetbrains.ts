import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../data/jetbrains/plugins.json');
const OUT_DIR = path.resolve(__dirname, '../data/jetbrains-catalog');

interface Plugin {
  name: string;
  slug: string;
  publisher?: string;
  description?: string;
  category?: string;
  ide?: string;
}

const raw: Plugin[] = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));

// Clean previous output
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const categoryLabels: Record<string, string> = {
  ai: 'AI',
  database: 'Database',
  design: 'Design',
  devops: 'DevOps',
  docker: 'Docker',
  framework: 'Framework',
  git: 'Git',
  language: 'Language',
  linting: 'Linting',
  other: 'Other',
  productivity: 'Productivity',
  testing: 'Testing',
};

const ideLabels: Record<string, string> = {
  all: 'All IDEs',
  intellij: 'IntelliJ IDEA',
  pycharm: 'PyCharm',
  webstorm: 'WebStorm',
  phpstorm: 'PhpStorm',
  rider: 'Rider',
  clion: 'CLion',
};

let count = 0;

for (const plugin of raw) {
  if (!plugin.slug) {
    console.warn('Skipping plugin without slug:', plugin.name);
    continue;
  }

  const cat = plugin.category || 'other';
  const catLabel = categoryLabels[cat] || cat;
  const publisher = plugin.publisher || '';
  const ide = plugin.ide || 'all';
  const ideLabel = ideLabels[ide] || ide;

  const seoTitle = `${plugin.name} — JetBrains Plugin${publisher ? ` by ${publisher}` : ''} for ${ideLabel}`;
  const seoDescription = plugin.description
    ? `${plugin.name}: ${plugin.description.slice(0, 130)}. Install in ${ideLabel}, features, and alternatives.`
    : `Install ${plugin.name} JetBrains plugin${publisher ? ` by ${publisher}` : ''}. Category: ${catLabel}. Works with ${ideLabel}.`;

  // Strip null values
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(plugin)) {
    if (v !== null && v !== undefined) {
      clean[k] = v;
    }
  }

  const entry = {
    ...clean,
    seo: {
      title: seoTitle,
      meta_description: seoDescription,
    },
  };

  const outFile = path.join(OUT_DIR, `${plugin.slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(entry, null, 2) + '\n');
  count++;
}

console.log(`Seeded ${count} JetBrains plugins into ${OUT_DIR}`);
