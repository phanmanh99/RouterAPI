import { readFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { AppConfig, BackendConfig, RouterModelConfig } from "./types"

const __dirname = dirname(fileURLToPath(import.meta.url))

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, key) => {
    return process.env[key] ?? ""
  })
}

function resolveBackendEnvVars(backend: BackendConfig): BackendConfig {
  return {
    ...backend,
    apiKey: resolveEnvVars(backend.apiKey),
    baseURL: resolveEnvVars(backend.baseURL),
  }
}

function findConfigPath(configPath?: string): string {
  if (configPath) return configPath

  const candidates = [
    join(__dirname, "..", "..", "models.json"),
    join(process.cwd(), "models.json"),
  ]

  for (const p of candidates) {
    if (existsSync(p)) return p
  }

  return candidates[0]
}

export function loadConfig(configPath?: string): AppConfig {
  const path = findConfigPath(configPath)

  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`)
  }

  const raw = readFileSync(path, "utf-8")
  const config: AppConfig = JSON.parse(raw)

  const resolved: AppConfig = {
    ...config,
    backends: Object.fromEntries(
      Object.entries(config.backends).map(([key, backend]) => [
        key,
        resolveBackendEnvVars(backend),
      ]),
    ),
  }

  return resolved
}

function validateBackend(name: string, backend: BackendConfig): void {
  if (!backend.baseURL) {
    throw new Error(
      `Backend "${name}" is missing "baseURL"`,
    )
  }
}

export function validateConfig(config: AppConfig): void {
  for (const [name, backend] of Object.entries(config.backends)) {
    validateBackend(name, backend)
  }

  for (const [name, router] of Object.entries(config.router_models)) {
    for (const backendName of router.fallbacks) {
      if (!config.backends[backendName]) {
        throw new Error(
          `Router model "${name}" references unknown backend "${backendName}"`,
        )
      }
    }
  }
}
