import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { AppConfig, BackendConfig, RouterModelConfig } from "../config/types"
import { saveConfig } from "../config/loader"

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function handleStatus(config: AppConfig) {
  const routerModelCount = Object.keys(config.router_models).length
  const backendCount = Object.keys(config.backends).length

  const backends = await Promise.all(
    Object.entries(config.backends).map(async ([name, backend]) => {
      const reachable = await pingBackend(backend.baseURL)
      return {
        name,
        provider: backend.provider,
        model: backend.model,
        baseURL: backend.baseURL,
        hasApiKey: backend.apiKey.length > 0,
        reachable,
      }
    }),
  )

  return {
    status: "ok",
    uptime: process.uptime(),
    routerModelCount,
    backendCount,
    backends,
    routerModels: Object.keys(config.router_models),
  }
}

async function pingBackend(baseURL: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(baseURL, { method: "GET", signal: controller.signal })
    clearTimeout(timeout)
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

const pingCache = new Map<string, boolean>()

async function pingCached(baseURL: string): Promise<boolean> {
  if (pingCache.has(baseURL)) return pingCache.get(baseURL)!
  const result = await pingBackend(baseURL)
  pingCache.set(baseURL, result)
  return result
}

export async function handleModelsDetail(config: AppConfig) {
  pingCache.clear()

  const results = await Promise.all(
    Object.entries(config.router_models).map(async ([id, router]) => {
      const backends = await Promise.all(
        router.fallbacks.map(async (name) => {
          const b = config.backends[name]
          if (!b) return { name, provider: "unknown" as const, model: "", baseURL: "", hasApiKey: false, reachable: false }
          const reachable = await pingCached(b.baseURL)
          return {
            name,
            provider: b.provider,
            model: b.model,
            baseURL: b.baseURL,
            hasApiKey: b.apiKey.length > 0,
            reachable,
          }
        }),
      )

      return {
        id,
        name: router.name,
        fallbacks: router.fallbacks,
        backends,
        reachable: backends.some((b) => b.reachable),
        limit: router.limit,
        tool_call: router.tool_call ?? false,
        reasoning: router.reasoning ?? false,
      }
    }),
  )

  return results
}

export function handleConfig(config: AppConfig) {
  return {
    server: {
      port: config.server?.port ?? 3000,
      host: config.server?.host ?? "0.0.0.0",
      authEnabled: (config.server?.apiKey?.length ?? 0) > 0,
      logging: config.server?.logging ?? { level: "info" },
    },
    backends: Object.fromEntries(
      Object.entries(config.backends).map(([name, b]) => [
        name,
        {
          provider: b.provider,
          model: b.model,
          baseURL: b.baseURL,
          hasApiKey: b.apiKey.length > 0,
        },
      ]),
    ),
    routerModels: Object.fromEntries(
      Object.entries(config.router_models).map(([id, r]) => [
        id,
        {
          name: r.name,
          fallbacks: r.fallbacks,
          limit: r.limit,
          tool_call: r.tool_call ?? false,
          reasoning: r.reasoning ?? false,
        },
      ]),
    ),
  }
}

export function handleLogs(config: AppConfig) {
  const logFile = config.server?.logging?.file
  if (!logFile || !existsSync(logFile)) {
    return { lines: [] }
  }

  const content = readFileSync(logFile, "utf-8")
  const lines = content.trim().split("\n").slice(-200)

  return { lines }
}

export async function handleBackendTest(name: string, config: AppConfig) {
  const backend = config.backends[name]
  if (!backend) {
    return new Response(
      JSON.stringify({ error: `Backend "${name}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  const start = Date.now()
  const reachable = await pingBackend(backend.baseURL)
  const latency = Date.now() - start

  return { name, reachable, latency }
}

export function handleUpdateBackend(
  name: string,
  body: Partial<BackendConfig>,
  config: AppConfig,
) {
  if (!config.backends[name]) {
    return new Response(
      JSON.stringify({ error: `Backend "${name}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  config.backends[name] = { ...config.backends[name], ...body }
  saveConfig(config)

  return { success: true }
}

export function handleUpdateRouterModel(
  id: string,
  body: Partial<RouterModelConfig>,
  config: AppConfig,
) {
  if (!config.router_models[id]) {
    return new Response(
      JSON.stringify({ error: `Router model "${id}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  config.router_models[id] = { ...config.router_models[id], ...body }
  saveConfig(config)

  return { success: true }
}

export function handleCreateBackend(
  body: { name: string; provider: string; model: string; apiKey: string; baseURL: string } & Partial<BackendConfig>,
  config: AppConfig,
) {
  if (config.backends[body.name]) {
    return new Response(
      JSON.stringify({ error: `Backend "${body.name}" already exists` }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )
  }

  config.backends[body.name] = {
    provider: body.provider as BackendConfig["provider"],
    model: body.model,
    apiKey: body.apiKey,
    baseURL: body.baseURL,
    refreshToken: body.refreshToken,
    oauthClientId: body.oauthClientId,
    oauthClientSecret: body.oauthClientSecret,
    oauthTenantId: body.oauthTenantId,
    oauthScope: body.oauthScope,
  }
  saveConfig(config)

  return { success: true }
}

export function handleDeleteBackend(name: string, config: AppConfig) {
  if (!config.backends[name]) {
    return new Response(
      JSON.stringify({ error: `Backend "${name}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  delete config.backends[name]

  for (const router of Object.values(config.router_models)) {
    router.fallbacks = router.fallbacks.filter((fb) => fb !== name)
  }

  saveConfig(config)

  return { success: true }
}

export function handleCreateRouterModel(
  body: { id: string; name: string; fallbacks: string[]; context?: number; output?: number; tool_call?: boolean; reasoning?: boolean },
  config: AppConfig,
) {
  if (config.router_models[body.id]) {
    return new Response(
      JSON.stringify({ error: `Router model "${body.id}" already exists` }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )
  }

  config.router_models[body.id] = {
    name: body.name,
    fallbacks: body.fallbacks,
    limit: body.context || body.output
      ? { ...(body.context ? { context: body.context } : {}), ...(body.output ? { output: body.output } : {}) }
      : undefined,
    tool_call: body.tool_call,
    reasoning: body.reasoning,
  }
  saveConfig(config)

  return { success: true }
}

export function handleDeleteRouterModel(id: string, config: AppConfig) {
  if (!config.router_models[id]) {
    return new Response(
      JSON.stringify({ error: `Router model "${id}" not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  delete config.router_models[id]
  saveConfig(config)

  return { success: true }
}

export interface BackendStatus {
  name: string
  provider: string
  model: string
  baseURL: string
  hasApiKey: boolean
  reachable: boolean
}

export interface BackendTestResult {
  name: string
  reachable: boolean
  latency: number
}
