import express from "express";
import { ZodError } from "zod";
import { logger, httpLogger } from "./middleware/logger.js";
import { studioRoutes } from "./routes/studio.js";

export function createApp() {
  const app = express();

  app.use(express.json({ limit: "8mb" }));
  app.use(httpLogger);

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "studio",
      now: new Date().toISOString(),
    });
  });

  app.use("/api", studioRoutes());
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ZodError) {
      const details = err.errors.map((detail) => ({
        path: detail.path,
        message: detail.message,
      }));
      logger.warn({ details }, "request validation failed");
      res.status(400).json({
        error: "Invalid request payload",
        details,
      });
      return;
    }

    const message =
      err instanceof Error && err.message.trim().length > 0
        ? err.message
        : "Internal server error";
    logger.error({ err }, "unhandled request error");
    res.status(500).json({ error: message });
  });

  return app;
}
