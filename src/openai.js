import { config, fallbackMessage } from "./config.js";
import { buildPrompt } from "./answer.js";

export async function generateWithOpenAI({ question, chunks }) {
  if (!config.openaiApiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiApiKey}`
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages: buildPrompt({ question, chunks }),
      temperature: 0.2,
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) return fallbackMessage;
  return answer;
}
