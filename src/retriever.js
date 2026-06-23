import fs from "node:fs/promises";
import { config } from "./config.js";
import { tokenize } from "./text.js";

function termCounts(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function cosineScore(queryTerms, chunkTerms) {
  let dot = 0;
  let queryNorm = 0;
  let chunkNorm = 0;

  for (const [, count] of queryTerms) queryNorm += count * count;
  for (const [, count] of chunkTerms) chunkNorm += count * count;
  for (const [term, count] of queryTerms) dot += count * (chunkTerms.get(term) || 0);

  if (!queryNorm || !chunkNorm) return 0;
  return dot / (Math.sqrt(queryNorm) * Math.sqrt(chunkNorm));
}

export async function loadIndex() {
  try {
    const raw = await fs.readFile(config.indexFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return { updatedAt: null, chunks: [] };
  }
}

export async function retrieve({ question, sport = "all", ageGroup = "all", limit = 5 }) {
  const index = await loadIndex();
  const queryTokens = tokenize(`${question} ${sport} ${ageGroup}`);
  const queryTerms = termCounts(queryTokens);

  const scored = index.chunks
    .filter((chunk) => sport === "all" || chunk.sport === "all" || chunk.sport === sport)
    .filter((chunk) => ageGroup === "all" || chunk.ageGroup === "all" || chunk.ageGroup === ageGroup)
    .map((chunk) => ({
      ...chunk,
      score: cosineScore(queryTerms, termCounts(chunk.tokens || []))
    }))
    .filter((chunk) => chunk.score > 0.06)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
