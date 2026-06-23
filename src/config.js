import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const config = {
  rootDir,
  publicDir: path.join(rootDir, "public"),
  dataDir: path.join(rootDir, "data"),
  indexFile: path.join(rootDir, "data", "index.json"),
  port: Number(process.env.PORT || 3000),
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  adminToken: process.env.GEYA_ADMIN_TOKEN || ""
};

export const fallbackMessage =
  "I couldn't find that information in the available GEYA resources. Please check the official GEYA website or contact GEYA directly for confirmation.";
