import { createOllamaAdapter } from "./ollama"
import { createPrivateGPTAdapter } from "./privategpt"
import type { BackendAdapter } from "./types"

const adapters: Record<string, BackendAdapter> = {
  ollama: createOllamaAdapter(),
  privategpt: createPrivateGPTAdapter(),
}

export function getAdapter(provider: string): BackendAdapter {
  const adapter = adapters[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  return adapter
}
