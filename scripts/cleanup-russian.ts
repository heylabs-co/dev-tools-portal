#!/usr/bin/env npx ts-node

/**
 * Cleanup script: removes all Cyrillic (Russian) text from company JSON files.
 *
 * Strategy:
 * 1. Apply a phrase-level translation dictionary (longest phrases first).
 * 2. Apply a word-level translation dictionary.
 * 3. Strip any remaining isolated Cyrillic characters/words.
 * 4. Clean up double-spaces and other artifacts left by removal.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPANIES_DIR = path.resolve(__dirname, "../data/companies");

// ── Translation dictionary (longer phrases first) ──────────────────────────
const PHRASE_MAP: [string, string][] = [
  ["проприетарные токены в vault", "proprietary tokens in vault"],
  ["глубокая привязка к Google ecosystem", "deep binding to Google ecosystem"],
  [
    "реактивная модель данных проприетарная",
    "reactive data model is proprietary",
  ],
  [
    "требует координации с migrations team",
    "requires coordination with migrations team",
  ],
  ["токены переносимы между провайдерами", "tokens portable between providers"],
  ["Мета-API поверх провайдеров", "Meta-API over providers"],
  ["стандартные протоколы", "standard protocols"],
  ["стандартный SQL", "standard SQL"],
  ["стандартный PostgreSQL", "standard PostgreSQL"],
  ["проприетарный", "proprietary"],
  ["проприетарные", "proprietary"],
  ["ограниченная", "limited"],
  ["Полный", "Full"],
  ["привязка", "binding/lock-in"],
  ["привязана", "tied to"],
  ["через", "via"],
  ["требует", "requires"],
  ["глубокая", "deep"],
  ["токены", "tokens"],
  ["данные", "data"],
  ["формат", "format"],
  ["модель", "model"],
  ["бизнес", "business"],
  ["компаний", "companies"],
  ["организаций", "organizations"],
  ["разработчиков", "developers"],
  ["пользователей", "users"],
  ["бизнесов", "businesses"],
  ["клиентов", "customers"],
  ["сотрудников", "employees"],
  ["подписчиков", "subscribers"],
  ["приложений", "apps"],
  ["транзакция", "transaction"],
  ["транзакций", "transactions"],
  ["платящих", "paying"],
  ["бесплатно", "free"],
  ["бесплатный", "free"],
  ["снижение", "decline/down"],
  ["рост", "growth"],
  ["год", "year"],
  ["мес", "month"],
  ["день", "day"],
  ["млн", "M"],
  ["млрд", "B"],
  ["тысяч", "K"],
  ["нет", "no"],
  ["или", "or"],
  ["но", "but"],
  ["для", "for"],
  ["от", "from"],
  ["до", "up to"],
  ["в", "in"],
  ["с", "with"],
  ["и", "and"],
  ["на", "on"],
  ["к", "to"],
  ["по", "by"],
];

// Sort by source length descending so longer phrases match first.
PHRASE_MAP.sort((a, b) => b[0].length - a[0].length);

const CYRILLIC_RE = /[а-яА-ЯёЁ]/;
const CYRILLIC_WORD_RE = /[а-яА-ЯёЁ]+/g;

function cleanString(value: string): string {
  if (!CYRILLIC_RE.test(value)) return value;

  let result = value;

  // Phase 1: dictionary replacements (case-insensitive for each phrase).
  for (const [rus, eng] of PHRASE_MAP) {
    const escaped = rus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    result = result.replace(re, eng);
  }

  // Phase 2: strip any remaining Cyrillic words.
  if (CYRILLIC_RE.test(result)) {
    result = result.replace(CYRILLIC_WORD_RE, "");
  }

  // Phase 3: tidy up whitespace artifacts.
  result = result
    .replace(/\s{2,}/g, " ") // collapse multiple spaces
    .replace(/\s+([,.\-:;!?)])/g, "$1") // remove space before punctuation
    .replace(/([(])\s+/g, "$1") // remove space after opening paren
    .replace(/^\s+|\s+$/g, ""); // trim

  return result;
}

/**
 * Recursively walk a JSON value and clean every string leaf.
 */
function cleanValue(val: unknown): unknown {
  if (typeof val === "string") return cleanString(val);
  if (Array.isArray(val)) return val.map(cleanValue);
  if (val !== null && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = cleanValue(v);
    }
    return out;
  }
  return val;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const files = fs
    .readdirSync(COMPANIES_DIR)
    .filter((f) => f.endsWith(".json"));

  let totalFiles = 0;
  let fixedFiles = 0;

  for (const file of files) {
    totalFiles++;
    const filePath = path.join(COMPANIES_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");

    if (!CYRILLIC_RE.test(raw)) continue;

    const data = JSON.parse(raw);
    const cleaned = cleanValue(data);
    const output = JSON.stringify(cleaned, null, 2) + "\n";

    if (output !== raw) {
      fs.writeFileSync(filePath, output, "utf-8");
      fixedFiles++;
      console.log(`  FIXED: ${file}`);
    }
  }

  console.log(`\nScanned ${totalFiles} files, fixed ${fixedFiles} files.`);
}

main();
