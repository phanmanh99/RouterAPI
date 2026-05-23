import type { AppConfig } from "../config/types"
import type { ModelList, ModelInfo } from "../types/openai"

const EPOCH = 1700000000

export function handleModels(config: AppConfig): ModelList {
  let idx = 0
  const data: ModelInfo[] = Object.entries(config.router_models).map(
    ([id, router]) => ({
      id,
      object: "model" as const,
      created: EPOCH + idx++,
      owned_by: "me",
    }),
  )

  return { object: "list", data }
}
