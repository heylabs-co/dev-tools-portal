import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const COMPANIES_DIR = join(import.meta.dirname, "..", "data", "companies");
const OUTPUT_DIR = join(import.meta.dirname, "..", "public", "api");
const OUTPUT_FILE = join(OUTPUT_DIR, "companies.json");

interface CompanyData {
  slug?: string;
  name?: string;
  logo?: string;
  website?: string;
  categories?: {
    primary?: {
      slug?: string;
      name?: string;
    };
  };
  pricing?: {
    model?: string;
    has_free_tier?: boolean;
    entry_price?: string;
  };
  scores?: {
    lock_in?: {
      level?: string;
      score?: number;
    };
  };
  scale?: {
    customers?: string;
    revenue?: string;
  };
}

interface CompactCompany {
  s: string;
  n: string;
  c?: string;
  cn?: string;
  l?: string;
  w?: string;
  p?: { m?: string; f?: boolean; e?: string };
  li?: { l?: string; s?: number };
  sc?: { cu?: string; r?: string };
}

function compact(data: CompanyData): CompactCompany | null {
  if (!data.slug || !data.name) return null;

  const entry: CompactCompany = {
    s: data.slug,
    n: data.name,
  };

  if (data.categories?.primary?.slug) entry.c = data.categories.primary.slug;
  if (data.categories?.primary?.name) entry.cn = data.categories.primary.name;
  if (data.logo) entry.l = data.logo;
  if (data.website) entry.w = data.website;

  // Pricing
  const pr = data.pricing;
  if (pr && (pr.model || pr.has_free_tier !== undefined || pr.entry_price)) {
    const p: CompactCompany["p"] = {};
    if (pr.model) p.m = pr.model;
    if (pr.has_free_tier !== undefined) p.f = pr.has_free_tier;
    if (pr.entry_price) p.e = pr.entry_price;
    if (Object.keys(p).length) entry.p = p;
  }

  // Lock-in
  const li = data.scores?.lock_in;
  if (li && (li.level || li.score !== undefined)) {
    const lockIn: CompactCompany["li"] = {};
    if (li.level) lockIn.l = li.level;
    if (li.score !== undefined) lockIn.s = li.score;
    if (Object.keys(lockIn).length) entry.li = lockIn;
  }

  // Scale
  const sc = data.scale;
  if (sc && (sc.customers || sc.revenue)) {
    const scale: CompactCompany["sc"] = {};
    if (sc.customers) scale.cu = sc.customers;
    if (sc.revenue) scale.r = sc.revenue;
    if (Object.keys(scale).length) entry.sc = scale;
  }

  return entry;
}

async function main() {
  const files = (await readdir(COMPANIES_DIR)).filter((f) =>
    f.endsWith(".json")
  );

  console.log(`Reading ${files.length} company files...`);

  const results: CompactCompany[] = [];

  for (const file of files) {
    try {
      const raw = await readFile(join(COMPANIES_DIR, file), "utf-8");
      const data: CompanyData = JSON.parse(raw);
      const entry = compact(data);
      if (entry) results.push(entry);
    } catch (err) {
      console.warn(`Skipping ${file}: ${(err as Error).message}`);
    }
  }

  results.sort((a, b) => a.n.localeCompare(b.n));

  await mkdir(OUTPUT_DIR, { recursive: true });
  const json = JSON.stringify(results);
  await writeFile(OUTPUT_FILE, json, "utf-8");

  const sizeKB = (Buffer.byteLength(json, "utf-8") / 1024).toFixed(1);
  console.log(
    `Generated ${OUTPUT_FILE} — ${results.length} companies, ${sizeKB} KB`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
