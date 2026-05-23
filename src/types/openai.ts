export interface Message {
  role: "system" | "user" | "assistant" | "tool"
  content: string | ContentPart[]
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ContentPart {
  type: "text" | "image_url"
  text?: string
  image_url?: { url: string; detail?: "low" | "high" | "auto" }
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDefinition {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface ChatRequest {
  model: string
  messages: Message[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  tools?: ToolDefinition[]
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } }
}

export interface ChatResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: Choice[]
  usage?: Usage
}

export interface Choice {
  index: number
  message: AssistantMessage
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null
}

export interface AssistantMessage {
  role: "assistant"
  content: string | null
  tool_calls?: ToolCall[]
}

export interface Usage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface SSEChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: SSEChoice[]
}

export interface SSEChoice {
  index: number
  delta: SSEDelta
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null
}

export interface SSEDelta {
  role?: "assistant"
  content?: string
  tool_calls?: ToolCall[]
}

export interface ModelList {
  object: "list"
  data: ModelInfo[]
}

export interface ModelInfo {
  id: string
  object: "model"
  created: number
  owned_by: string
}

export interface EmbeddingRequest {
  model: string
  input: string | string[]
}

export interface EmbeddingResponse {
  object: "list"
  data: EmbeddingData[]
  model: string
  usage: Usage
}

export interface EmbeddingData {
  object: "embedding"
  index: number
  embedding: number[]
}
