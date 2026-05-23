import { Elysia } from "elysia"
import { loadConfig, validateConfig } from "./config/loader"
import type { AppConfig } from "./config/types"
import { handleChat } from "./routes/chat"
import { handleModels } from "./routes/models"
import { createApiKeyValidator } from "./middleware/auth"

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

const authMiddleware = createApiKeyValidator(API_KEY)

const app = new Elysia()

app.onBeforeHandle(({ request }) => {
  const authErr = authMiddleware(request)
  if (authErr) return authErr
})

app.get("/v1/models", () => {
  return handleModels(config)
})

app.post("/v1/chat/completions", async ({ body, request }) => {
  return handleChat(body as any, config)
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

console.log(`
╔══════════════════════════════════════════╗
║     OpenCode Provider Server v1.0.0     ║
║──────────────────────────────────────────║
║  Server:  http://${HOST}:${PORT}              ║
║  Models:  ${Object.keys(config.router_models).join(", ")}
║  Auth:    ${API_KEY ? "enabled" : "disabled"}
╚══════════════════════════════════════════╝
`)

export type { AppConfig }
