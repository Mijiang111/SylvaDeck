import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { logger } from "./middleware/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(__dirname, "..", ".env"));

const port = Number(process.env.PPT_STUDIO_PORT || process.env.PORT || 3101);
const host = process.env.PPT_STUDIO_HOST?.trim() || process.env.HOST?.trim() || "127.0.0.1";

const server = createServer(createApp());

server.listen(port, host, () => {
  logger.info({ host, port }, "studio server listening");
});
