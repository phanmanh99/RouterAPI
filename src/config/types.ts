export interface BackendConfig {
  provider: "ollama" | "privategpt"
  model: string
  apiKey: string
  baseURL: string
  name?: string
  refreshToken?: string
  oauthClientId?: string
  oauthClientSecret?: string
  oauthTenantId?: string
  oauthScope?: string
}

export interface RouterModelConfig {
  name: string
  fallbacks: string[]
  limit?: {
    context?: number
    output?: number
  }
  tool_call?: boolean
  reasoning?: boolean
}

export interface AppConfig {
  backends: Record<string, BackendConfig>
  router_models: Record<string, RouterModelConfig>
  server?: {
    port?: number
    host?: string
    apiKey?: string
    logging?: {
      level?: "debug" | "info" | "warn" | "error"
      file?: string
    }
  }
}
