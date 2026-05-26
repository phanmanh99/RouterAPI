import { Elysia } from "elysia"
import { staticPlugin } from "@elysiajs/static"
import { loadConfig, validateConfig, reloadConfig } from "./config/loader"
import type { AppConfig } from "./config/types"
import { handleChat } from "./routes/chat"
import { handleModels } from "./routes/models"
import {
  handleStatus,
  handleModelsDetail,
  handleConfig,
  handleLogs,
  handleBackendTest,
  handleUpdateBackend,
  handleUpdateRouterModel,
  handleCreateBackend,
  handleDeleteBackend,
  handleCreateRouterModel,
  handleDeleteRouterModel,
} from "./routes/admin"
import { handleAuthStart, handleAuthCallback, handleAuthDiscover, handleDeviceCodeStart, handleDeviceCodePoll } from "./routes/auth"
import { createApiKeyValidator } from "./middleware/auth"
import { Logger } from "./utils/logger"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

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
    let path = "/unknown"
    try { path = new URL(request.url).pathname } catch {}
    logger.warn("Request rejected", {
      method: request.method,
      path,
      status: authErr.status,
    })
    return authErr
  }
})

app.onAfterResponse(({ request, responseValue }) => {
  const status = responseValue instanceof Response ? responseValue.status : 200
  let path = "/unknown"
  try { path = new URL(request.url).pathname } catch {}
  logger.info("Request handled", {
    method: request.method,
    path,
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

app.get("/api/status", () => handleStatus(config))
app.get("/api/models/detail", async () => handleModelsDetail(config))
app.get("/api/config", () => handleConfig(config))
app.get("/api/logs", () => handleLogs(config))

app.post("/api/backends/:name/test", async ({ params }) => {
  return handleBackendTest(params.name, config)
})

app.put("/api/backends/:name", async ({ params, body }) => {
  return handleUpdateBackend(params.name, body as any, config)
})

app.put("/api/router-models/:id", async ({ params, body }) => {
  return handleUpdateRouterModel(params.id, body as any, config)
})

app.post("/api/backends", async ({ body }) => {
  return handleCreateBackend(body as any, config)
})

app.delete("/api/backends/:name", async ({ params }) => {
  return handleDeleteBackend(params.name, config)
})

app.post("/api/router-models", async ({ body }) => {
  return handleCreateRouterModel(body as any, config)
})

app.delete("/api/router-models/:id", async ({ params }) => {
  return handleDeleteRouterModel(params.id, config)
})

app.get("/api/auth/start", async ({ query, request }) => {
  const origin = new URL(request.url).origin
  return handleAuthStart(query.backend as string, origin, config)
})

app.get("/api/auth/callback", async ({ request }) => {
  return handleAuthCallback(new URL(request.url))
})

app.get("/api/auth/discover", async ({ query }) => {
  return handleAuthDiscover(query.baseURL as string)
})

app.get("/api/auth/device-code", async ({ query }) => {
  return handleDeviceCodeStart(query.backend as string, config)
})

app.get("/api/auth/device-code/status", async ({ query }) => {
  return handleDeviceCodePoll(query.backend as string)
})

app.post("/api/config/reload", () => {
  try {
    config = reloadConfig()
    validateConfig(config)
    return { success: true }
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `Config reload failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})

const webDist = join(__dirname, "web", "dist")

const silentPaths = ["/sw.js", "/favicon.ico", "/robots.txt"]
for (const p of silentPaths) {
  app.get(p, () => new Response(null, { status: 204 }))
}

app.use(
  staticPlugin({
    assets: webDist,
    prefix: "/",
    alwaysStatic: true,
  }),
)

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
