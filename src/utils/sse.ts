import type { SSEChunk } from "../types/openai"

export function encodeSSE(chunk: SSEChunk): string {
  return `data: ${JSON.stringify(chunk)}\n\n`
}

export function encodeSSEDone(): string {
  return "data: [DONE]\n\n"
}

export function createContentChunk(
  model: string,
  content: string,
  created: number,
): SSEChunk {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  }
}

export function createStopChunk(model: string, created: number): SSEChunk {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  }
}
