import type { BackendConfig } from "../../config/types"
import type { Message, ChatRequest } from "../../types/openai"

export interface BackendAdapter {
  chat(
    backend: BackendConfig,
    messages: Message[],
    params: Partial<ChatRequest>,
  ): Promise<unknown>
}
