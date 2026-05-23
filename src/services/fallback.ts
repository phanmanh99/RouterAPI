import type { AppConfig, BackendConfig } from "../config/types"
import type { Message, ChatRequest } from "../types/openai"
import { getAdapter } from "./backends/registry"
import { isRetryableError, hasToolResults, BackendError } from "../utils/errors"

export interface FallbackResult {
  response: unknown
  fallbackHeader: string
}

export async function handleChatRequest(
  routerModel: string,
  messages: Message[],
  params: Partial<ChatRequest>,
  config: AppConfig,
): Promise<FallbackResult | null> {
  const router = config.router_models[routerModel]
  if (!router) return null

  const chain = router.fallbacks

  for (const [i, backendName] of chain.entries()) {
    const backend = config.backends[backendName]

    if (i > 0 && hasToolResults(messages)) {
      const last = chain[i - 1]
      throw new BackendError(
        500,
        "cannot_fallback",
        `Backend ${last} failed after tool execution, cannot fallback`,
      )
    }

    try {
      const adapter = getAdapter(backend.provider)
      const response = await adapter.chat(backend, messages, params)

      return {
        response,
        fallbackHeader:
          i === 0
            ? backendName
            : `${chain.slice(0, i + 1).join("→")}`,
      }
    } catch (err) {
      const retryable = isRetryableError(err)
      if (!retryable || i === chain.length - 1) {
        throw err
      }
      console.warn(
        `[Fallback] ${backendName} failed, trying ${chain[i + 1]}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  throw new Error("Unreachable: fallback chain exhausted")
}

async function pingBackend(backend: BackendConfig): Promise<boolean> {
  try {
    const adapter = getAdapter(backend.provider)
    await adapter.chat(backend, [{ role: "user", content: "ping" }], {
      max_tokens: 1,
    })
    return true
  } catch {
    return false
  }
}

export async function handleStreamingRequest(
  routerModel: string,
  messages: Message[],
  params: Partial<ChatRequest>,
  config: AppConfig,
): Promise<ReadableStream> {
  const router = config.router_models[routerModel]

  for (const [i, backendName] of router.fallbacks.entries()) {
    const backend = config.backends[backendName]
    const reachable = await pingBackend(backend)

    if (reachable) {
      const adapter = getAdapter(backend.provider)
      return adapter.chat(backend, messages, {
        ...params,
        stream: true,
      }) as Promise<ReadableStream>
    }

    if (i < router.fallbacks.length - 1) {
      console.warn(`[Stream] ${backendName} unreachable, trying next...`)
    }
  }

  throw new Error("All backends unreachable for streaming")
}
