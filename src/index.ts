import { app } from "./app";
import { apiConfig } from "./lib/config";
import { logger } from "./lib/logger";

app.listen({ port: apiConfig.port, hostname: apiConfig.host });

logger.info("API server started", {
  hostname: app.server?.hostname,
  port: app.server?.port,
  nodeEnv: apiConfig.nodeEnv,
  frontendUrl: apiConfig.frontendUrl,
  sqlitePath: apiConfig.database.sqlitePath,
  csrfSecret: apiConfig.csrfSecret ? "***" : "<missing>",
});
