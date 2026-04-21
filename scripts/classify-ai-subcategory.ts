/**
 * Classify the 700+ tools in category "ai-api-sdk" into subcategories via DeepSeek.
 *
 * Writes the chosen subcategory into companies[*].categories.secondary[0].
 * Subcategories are defined below. All categories map by keyword heuristic
 * first; only the ambiguous ones are sent to the LLM.
 *
 * Run: OPENROUTER_API_KEY=... npx tsx scripts/classify-ai-subcategory.ts
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const COMPANIES_DIR = 'data/companies';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'deepseek/deepseek-chat-v3.1:free'; // free tier on OpenRouter

const SUBCATEGORIES = [
  { slug: 'llm-providers', name: 'LLM Providers & Inference', keywords: ['llm provider', 'language model', 'gpt-', 'chat completion', 'inference api', 'openai', 'anthropic', 'claude', 'gemini', 'deepseek', 'qwen', 'together ai', 'fireworks', 'groq', 'mistral'] },
  { slug: 'agent-frameworks', name: 'Agent Frameworks', keywords: ['agent framework', 'multi-agent', 'autogen', 'crew ai', 'langgraph', 'swarm', 'autonomous agent', 'agentic', 'tool calling', 'function calling orchestration'] },
  { slug: 'vector-databases', name: 'Vector Databases & Retrieval', keywords: ['vector database', 'vector search', 'embedding', 'pinecone', 'weaviate', 'qdrant', 'milvus', 'chroma', 'lancedb', 'retrieval', 'rag'] },
  { slug: 'mlops-experiment', name: 'MLOps / Experiment Tracking', keywords: ['mlops', 'experiment tracking', 'model registry', 'feature store', 'model monitoring', 'ml pipeline', 'weights and biases', 'mlflow', 'clearml', 'neptune.ai', 'comet', 'kubeflow', 'feast'] },
  { slug: 'voice-ai', name: 'Voice AI / TTS / STT', keywords: ['text-to-speech', 'speech-to-text', 'voice ai', 'tts', 'stt', 'asr', 'elevenlabs', 'cartesia', 'deepgram', 'assemblyai', 'voice clone', 'voice agent', 'whisper', 'rime', 'hume'] },
  { slug: 'image-video-gen', name: 'Image / Video / Multimodal AI', keywords: ['image generation', 'video generation', 'text-to-image', 'multimodal', 'stability', 'dall-e', 'midjourney', 'runway', 'synthesia', 'image api', 'computer vision model', 'image editing ai', 'video ai', 'generative image'] },
  { slug: 'ai-platform-other', name: 'General AI Platforms & Tooling', keywords: [] /* fallback */ },
];

function classifyByKeyword(name: string, description: string): string | null {
  const text = `${name} ${description}`.toLowerCase();
  for (const sub of SUBCATEGORIES) {
    for (const kw of sub.keywords) {
      if (text.includes(kw)) return sub.slug;
    }
  }
  return null;
}

async function classifyWithLLM(name: string, description: string): Promise<string> {
  if (!OPENROUTER_KEY) return 'ai-platform-other';
  const prompt = `Classify this AI/ML developer tool into ONE of these subcategories (reply with just the slug):

${SUBCATEGORIES.map((s) => `- ${s.slug}: ${s.name}`).join('\n')}

Tool: ${name}
Description: ${description}

Reply with only the slug (e.g. "llm-providers").`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 20,
      }),
    });
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim().toLowerCase() ?? '';
    const match = SUBCATEGORIES.find((s) => content.includes(s.slug));
    return match?.slug ?? 'ai-platform-other';
  } catch (e) {
    console.warn(`LLM call failed: ${(e as Error).message}`);
    return 'ai-platform-other';
  }
}

async function main() {
  const files = readdirSync(COMPANIES_DIR).filter((f) => f.endsWith('.json'));
  let total = 0;
  let keywordHits = 0;
  let llmHits = 0;
  const counts: Record<string, number> = {};

  for (const file of files) {
    const fp = join(COMPANIES_DIR, file);
    const data = JSON.parse(readFileSync(fp, 'utf-8'));
    if (data.categories?.primary?.slug !== 'ai-api-sdk') continue;

    total++;
    const name = data.name ?? '';
    const description = data.description ?? '';

    let sub = classifyByKeyword(name, description);
    if (sub) {
      keywordHits++;
    } else {
      sub = await classifyWithLLM(name, description);
      llmHits++;
      await new Promise((r) => setTimeout(r, 300)); // 300ms between LLM calls
    }

    data.categories.secondary = data.categories.secondary ?? [];
    if (!data.categories.secondary.includes(sub)) {
      data.categories.secondary.unshift(sub);
    }
    writeFileSync(fp, JSON.stringify(data, null, 2) + '\n');
    counts[sub] = (counts[sub] ?? 0) + 1;

    if (total % 50 === 0) console.log(`  ${total} done (keyword: ${keywordHits}, llm: ${llmHits})`);
  }

  console.log(`\nTotal AI/SDK tools classified: ${total}`);
  console.log(`  By keyword: ${keywordHits}`);
  console.log(`  By LLM: ${llmHits}`);
  console.log(`\nSubcategory distribution:`);
  for (const [slug, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)} ${slug}`);
  }
}

main();
