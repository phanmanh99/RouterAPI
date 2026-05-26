export interface BackendStatus {
  name: string
  provider: string
  model: string
  baseURL: string
  hasApiKey: boolean
  reachable: boolean
}

export interface ServerStatus {
  status: string
  uptime: number
  routerModelCount: number
  backendCount: number
  backends: BackendStatus[]
  routerModels: string[]
}

export interface ModelBackendInfo {
  name: string
  provider: string
  model: string
  baseURL: string
  hasApiKey: boolean
  hasOauth: boolean
  reachable: boolean
}

export interface RouterModelDetail {
  id: string
  name: string
  fallbacks: string[]
  backends: ModelBackendInfo[]
  reachable: boolean
  limit?: { context?: number; output?: number }
  tool_call: boolean
  reasoning: boolean
}

export interface ServerConfig {
  server: {
    port: number
    host: string
    authEnabled: boolean
    logging: { level: string; file?: string }
  }
  backends: Record<
    string,
    { provider: string; model: string; baseURL: string; hasApiKey: boolean }
  >
  routerModels: Record<
    string,
    {
      name: string
      fallbacks: string[]
      limit?: { context?: number; output?: number }
      tool_call: boolean
      reasoning: boolean
    }
  >
}

export interface LogResponse {
  lines: string[]
}

export interface BackendTestResult {
  name: string
  reachable: boolean
  latency: number
}

export type View =
  | "dashboard"
  | "chat"
  | "models"
  | "settings"
