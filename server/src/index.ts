import { createServer } from "node:http";
import { createApp } from "./app.js";
import { logger } from "./middleware/logger.js";

const port = Number(process.env.PPT_STUDIO_PORT || process.env.PORT || 3101);
const host = process.env.PPT_STUDIO_HOST?.trim() || process.env.HOST?.trim() || "127.0.0.1";

const server = createServer(createApp());

server.listen(port, host, () => {
  logger.info({ host, port }, "studio server listening");
});
