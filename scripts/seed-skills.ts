import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../data/ai-skills.json');
const OUT_DIR = path.resolve(__dirname, '../data/ai-skills-catalog');

const raw: Array<Record<string, unknown>> = JSON.parse(fs.readFileSync(SOURCE, 'utf-8'));

// Ensure output directory exists (clean previous)
if (fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
}
fs.mkdirSync(OUT_DIR, { recursive: true });

const formatLabel: Record<string, string> = {
  cursorrules: 'Cursor Rules',
  'claude-skill': 'Claude Skill',
  copilot: 'GitHub Copilot',
  windsurf: 'Windsurf',
  instructions: 'Instructions',
  prompt: 'Prompt',
  other: 'Other',
};

const categoryLabel: Record<string, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  mobile: 'Mobile',
  devops: 'DevOps',
  'ai-ml': 'AI / ML',
  database: 'Database',
  testing: 'Testing',
  security: 'Security',
  api: 'API',
  design: 'Design',
  architecture: 'Architecture',
  documentation: 'Documentation',
  accessibility: 'Accessibility',
  performance: 'Performance',
  other: 'Other',
};

let count = 0;
for (const skill of raw) {
  const slug = skill.slug as string;
  if (!slug) {
    console.warn('Skipping skill without slug:', skill.name);
    continue;
  }

  const name = (skill.name as string) || slug;
  const fmt = (skill.format as string) || '';
  const cat = (skill.category as string) || '';
  const framework = (skill.framework as string) || '';

  // Build SEO-friendly title and description
  const fmtLabel = formatLabel[fmt] || fmt;
  const catLabel = categoryLabel[cat] || cat;

  const seoTitle = `${name} — ${fmtLabel || 'AI Skill'} for ${catLabel || 'Development'}`;
  const seoDescription = (skill.description as string) ||
    `${name} is a ${fmtLabel || 'coding skill'} for ${catLabel || 'software development'}${framework ? ` with ${framework}` : ''}.`;

  // Strip null values so Zod .optional() is satisfied (null !== undefined)
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(skill)) {
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

  const outFile = path.join(OUT_DIR, `${slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(entry, null, 2) + '\n');
  count++;
}

console.log(`Seeded ${count} skills into ${OUT_DIR}`);
