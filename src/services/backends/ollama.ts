import type { BackendConfig } from "../../config/types"
import type { Message, ChatRequest, ChatResponse } from "../../types/openai"
import { BackendError, parseErrorResponse } from "../../utils/errors"
import type { BackendAdapter } from "./types"

export function createOllamaAdapter(): BackendAdapter {
  return {
    async chat(backend: BackendConfig, messages: Message[], params: Partial<ChatRequest>) {
      const base = backend.baseURL
      const url = `${base}/chat/completions`

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (backend.apiKey) {
        headers["Authorization"] = `Bearer ${backend.apiKey}`
      }

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: backend.model,
          messages,
          stream: params.stream ?? false,
          temperature: params.temperature,
          max_tokens: params.max_tokens,
          tools: params.tools,
          tool_choice: params.tool_choice,
        }),
      })

      if (!response.ok) throw await parseErrorResponse(response)

      if (params.stream) return response.body as ReadableStream

      const json: ChatResponse = await response.json()
      return json
    },
  }
}
