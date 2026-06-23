const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "for", "from", "how",
  "i", "in", "is", "it", "my", "of", "on", "or", "our", "that", "the", "their",
  "this", "to", "we", "what", "when", "where", "who", "why", "with", "you", "your"
]);

export function normalizeText(value = "") {
  return String(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenize(value = "") {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

export function chunkText(text, maxWords = 170, overlap = 35) {
  const words = normalizeText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [words.join(" ")].filter(Boolean);

  const chunks = [];
  for (let start = 0; start < words.length; start += maxWords - overlap) {
    chunks.push(words.slice(start, start + maxWords).join(" "));
    if (start + maxWords >= words.length) break;
  }
  return chunks;
}

export function parseFrontMatter(rawText, fallbackTitle) {
  const text = normalizeText(rawText);
  const result = {
    title: fallbackTitle,
    url: "",
    sport: "all",
    ageGroup: "all",
    body: text
  };

  if (!text.startsWith("---")) return result;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return result;

  const header = text.slice(3, end).trim();
  result.body = text.slice(end + 4).trim();
  for (const line of header.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    const value = rest.join(":").trim();
    if (key.trim() in result) result[key.trim()] = value;
  }
  return result;
}

export function htmlToText(html = "") {
  return normalizeText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
  );
}
