import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../data/vscode-extensions.json');
const OUT_DIR = path.resolve(__dirname, '../data/vscode-catalog');

interface Extension {
  name: string;
  slug: string;
  publisher?: string;
  description?: string;
  category?: string;
  installs?: string;
  vscode_id?: string;
}

const raw: Extension[] = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));

// Clean previous output
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const categoryLabels: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  database: 'Database',
  debug: 'Debug',
  devops: 'DevOps',
  docker: 'Docker',
  docs: 'Documentation',
  framework: 'Framework',
  git: 'Git',
  language: 'Language',
  linting: 'Linting',
  other: 'Other',
  remote: 'Remote',
  snippets: 'Snippets',
  testing: 'Testing',
  'C# / .NET': 'C# / .NET',
  'Docker / Kubernetes': 'Docker / Kubernetes',
  'Flutter / Dart': 'Flutter / Dart',
  Go: 'Go',
  Java: 'Java',
  'JavaScript / TypeScript': 'JavaScript / TypeScript',
  PHP: 'PHP',
  Python: 'Python',
  React: 'React',
  Ruby: 'Ruby',
  Rust: 'Rust',
  Swift: 'Swift',
  'Tailwind CSS': 'Tailwind CSS',
  Terraform: 'Terraform',
  Vue: 'Vue',
};

let count = 0;

for (const ext of raw) {
  if (!ext.slug) {
    console.warn('Skipping extension without slug:', ext.name);
    continue;
  }

  const cat = ext.category || 'other';
  const catLabel = categoryLabels[cat] || cat;
  const publisher = ext.publisher || '';

  const seoTitle = `${ext.name} — VS Code Extension${publisher ? ` by ${publisher}` : ''}`;
  const seoDescription = ext.description
    ? `${ext.name}: ${ext.description.slice(0, 130)}. Install in VS Code, features, and alternatives.`
    : `Install ${ext.name} VS Code extension${publisher ? ` by ${publisher}` : ''}. Category: ${catLabel}.`;

  // Strip null values
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ext)) {
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

  const outFile = path.join(OUT_DIR, `${ext.slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(entry, null, 2) + '\n');
  count++;
}

console.log(`Seeded ${count} extensions into ${OUT_DIR}`);
