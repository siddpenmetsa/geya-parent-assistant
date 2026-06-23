import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { chunkText, htmlToText, normalizeText, parseFrontMatter, tokenize } from "./text.js";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : full;
      })
    );
    return files.flat();
  } catch {
    return [];
  }
}

async function ingestLocalFiles() {
  const files = [
    ...(await listFiles(path.join(config.dataDir, "pages"))),
    ...(await listFiles(path.join(config.dataDir, "docs")))
  ].filter((file) => /\.(md|txt|json)$/i.test(file));

  const resources = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const name = path.basename(file, path.extname(file)).replace(/[-_]/g, " ");
    if (file.endsWith(".json")) {
      const data = JSON.parse(raw);
      for (const item of Array.isArray(data) ? data : [data]) {
        resources.push({
          title: item.title || name,
          url: item.url || "",
          sport: item.sport || "all",
          ageGroup: item.ageGroup || "all",
          body: normalizeText(item.body || item.text || "")
        });
      }
    } else {
      resources.push(parseFrontMatter(raw, name));
    }
  }
  return resources;
}

async function ingestWebsiteUrls() {
  const sources = await readJson(path.join(config.dataDir, "sources.json"), { websiteUrls: [] });
  const resources = [];

  for (const url of sources.websiteUrls || []) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const html = await response.text();
      const title = html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.trim() || url;
      resources.push({
        title,
        url,
        sport: "all",
        ageGroup: "all",
        body: htmlToText(html)
      });
    } catch {
      // Individual page failures should not block the whole refresh.
    }
  }
  return resources;
}

export async function buildIndex() {
  await fs.mkdir(config.dataDir, { recursive: true });
  const resources = [...(await ingestLocalFiles()), ...(await ingestWebsiteUrls())];
  const chunks = [];

  for (const resource of resources) {
    for (const [index, text] of chunkText(resource.body).entries()) {
      if (!text) continue;
      chunks.push({
        id: `${resource.title}-${index}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: resource.title,
        url: resource.url,
        sport: resource.sport || "all",
        ageGroup: resource.ageGroup || "all",
        text,
        tokens: tokenize(`${resource.title} ${text} ${resource.sport} ${resource.ageGroup}`)
      });
    }
  }

  const index = { updatedAt: new Date().toISOString(), chunks };
  await fs.writeFile(config.indexFile, JSON.stringify(index, null, 2));
  return index;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildIndex()
    .then((index) => {
      console.log(`Indexed ${index.chunks.length} chunks from GEYA resources.`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
