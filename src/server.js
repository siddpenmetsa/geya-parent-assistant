import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { config, fallbackMessage } from "./config.js";
import { buildExtractiveAnswer, buildFollowUps } from "./answer.js";
import { buildIndex } from "./ingest.js";
import { generateWithOpenAI } from "./openai.js";
import { retrieve } from "./retriever.js";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function streamJson(response, event, data) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function serveStatic(request, response) {
  const requestedPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const safePath = requestedPath === "/" ? "/index.html" : requestedPath;
  const filePath = path.normalize(path.join(config.publicDir, safePath));

  if (!filePath.startsWith(config.publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function handleChat(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });

  try {
    const body = await readRequestBody(request);
    const question = String(body.message || "").trim();
    const sport = String(body.sport || "all").toLowerCase();
    const ageGroup = String(body.ageGroup || "all").toLowerCase();

    if (!question) {
      streamJson(response, "message", { text: "Please enter a question so I can help." });
      streamJson(response, "done", { sources: [], followUps: buildFollowUps("") });
      response.end();
      return;
    }

    streamJson(response, "status", { text: "Searching GEYA resources..." });
    const chunks = await retrieve({ question, sport, ageGroup });
    const sources = chunks.map((chunk) => ({
      title: chunk.title,
      url: chunk.url,
      score: Number(chunk.score.toFixed(3))
    }));

    if (!chunks.length) {
      streamJson(response, "message", { text: fallbackMessage });
      streamJson(response, "done", { sources: [], followUps: buildFollowUps(question) });
      response.end();
      return;
    }

    streamJson(response, "status", { text: "Composing a grounded answer..." });
    let answer = null;
    try {
      answer = await generateWithOpenAI({ question, chunks });
    } catch {
      answer = null;
    }
    if (!answer) answer = buildExtractiveAnswer({ question, chunks, sport, ageGroup }).answer;

    for (const token of answer.match(/.{1,32}(\s|$)/g) || [answer]) {
      streamJson(response, "message", { text: token });
      await new Promise((resolve) => setTimeout(resolve, 16));
    }

    streamJson(response, "done", {
      sources: answer === fallbackMessage ? [] : sources,
      followUps: buildFollowUps(question)
    });
    response.end();
  } catch {
    streamJson(response, "message", {
      text: "Something went wrong while preparing the answer. Please try again in a moment."
    });
    streamJson(response, "done", { sources: [], followUps: [] });
    response.end();
  }
}

async function handleRefresh(request, response) {
  if (config.adminToken) {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token !== config.adminToken) return sendJson(response, 401, { error: "Unauthorized" });
  }
  const index = await buildIndex();
  sendJson(response, 200, { updatedAt: index.updatedAt, chunks: index.chunks.length });
}

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");

  if (request.method === "POST" && pathname === "/api/chat") return handleChat(request, response);
  if (request.method === "POST" && pathname === "/api/admin/refresh") return handleRefresh(request, response);
  if (request.method === "GET" && pathname === "/api/health") return sendJson(response, 200, { ok: true });
  return serveStatic(request, response);
});

await buildIndex();
server.listen(config.port, () => {
  console.log(`GEYA Parent Assistant is running at http://localhost:${config.port}`);
});
