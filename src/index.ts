import { Elysia } from "elysia"
import { loadConfig, validateConfig } from "./config/loader"
import type { AppConfig } from "./config/types"
import { handleChat } from "./routes/chat"
import { handleModels } from "./routes/models"
import { createApiKeyValidator } from "./middleware/auth"
import { Logger } from "./utils/logger"

let config: AppConfig

try {
  config = loadConfig()
  validateConfig(config)
} catch (err) {
  console.error(`[Config] Failed to load config: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

const PORT = config.server?.port ?? 3000
const HOST = config.server?.host ?? "0.0.0.0"
const API_KEY = config.server?.apiKey

const logger = new Logger(config.server?.logging)

const authMiddleware = createApiKeyValidator(API_KEY)

const app = new Elysia()

app.onBeforeHandle(({ request }) => {
  const authErr = authMiddleware(request)
  if (authErr) {
    logger.warn("Request rejected", {
      method: request.method,
      path: new URL(request.url).pathname,
      status: authErr.status,
    })
    return authErr
  }
})

app.onAfterResponse(({ request, responseValue }) => {
  const status = responseValue instanceof Response ? responseValue.status : 200
  logger.info("Request handled", {
    method: request.method,
    path: new URL(request.url).pathname,
    status,
  })
})

app.get("/v1/models", () => {
  return handleModels(config)
})

app.post("/v1/chat/completions", async ({ body, request }) => {
  return handleChat(body as any, config, logger)
})

app.get("/health", () => ({
  status: "ok",
  version: "1.0.0",
  models: Object.keys(config.router_models),
}))

if (typeof Bun !== "undefined") {
  app.listen({ port: PORT, hostname: HOST })
} else {
  const { createServer } = await import("http")
  createServer(app.fetch as any).listen(PORT, HOST)
}

logger.info("Server started", {
  host: HOST,
  port: PORT,
  models: Object.keys(config.router_models),
  auth: API_KEY ? "enabled" : "disabled",
})

export type { AppConfig }
