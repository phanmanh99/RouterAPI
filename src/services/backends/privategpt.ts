import type { BackendConfig } from "../../config/types"
import type { Message, ChatRequest, ChatResponse } from "../../types/openai"
import { BackendError } from "../../utils/errors"
import { readLines } from "../../utils/stream"
import { createContentChunk, createStopChunk, encodeSSE } from "../../utils/sse"
import type { BackendAdapter } from "./types"
import { updateBackendTokens } from "../../config/loader"

async function refreshAccessToken(backend: BackendConfig): Promise<boolean> {
  if (!backend.refreshToken || !backend.refreshEndpoint) return false

  try {
    const res = await fetch(`${backend.baseURL}${backend.refreshEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: backend.refreshToken }),
    })

    if (!res.ok) return false

    const data = await res.json()
    if (!data.accessToken) return false

    backend.apiKey = data.accessToken
    backend.refreshToken = data.refreshToken ?? backend.refreshToken

    if (backend.name) {
      updateBackendTokens(backend.name, backend.apiKey, backend.refreshToken ?? "")
    }

    return true
  } catch {
    return false
  }
}

async function tryRequest(
  backend: BackendConfig,
  body: unknown,
): Promise<Response> {
  const url = `${backend.baseURL}/api/chat/v1/conversations`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backend.apiKey}`,
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (response.status === 401 && backend.refreshToken) {
    const refreshed = await refreshAccessToken(backend)
    if (!refreshed) throw new BackendError(401, "auth_failed", "Token expired and refresh failed")

    const retry = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${backend.apiKey}`,
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!retry.ok) throw new BackendError(retry.status)
    return retry
  }

  if (!response.ok) throw new BackendError(response.status)

  return response
}

function extractContent(event: string, data: string): string | null {
  if (event !== "data" || !data) return null
  try {
    const node = JSON.parse(data)
    return node.v != null ? String(node.v) : null
  } catch {
    return null
  }
}

async function collectSSEText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const parts: string[] = []
  let event = ""

  for await (const raw of readLines(stream)) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith("event:")) {
      event = line.slice(6).trim()
    } else if (line.startsWith("data:")) {
      const content = extractContent(event, line.slice(5).trim())
      if (content != null) parts.push(content)
    }
  }

  return parts.join("")
}

function transformToSSEStream(
  body: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const created = Math.floor(Date.now() / 1000)

  return new ReadableStream({
    async start(controller) {
      let event = ""

      try {
        for await (const raw of readLines(body)) {
          const line = raw.trim()
          if (!line) continue

          if (line.startsWith("event:")) {
            event = line.slice(6).trim()
            continue
          }

          if (!line.startsWith("data:")) continue
          const content = extractContent(event, line.slice(5).trim())
          if (content == null) continue

          const chunk = createContentChunk(model, content, created)
          controller.enqueue(new TextEncoder().encode(encodeSSE(chunk)))
        }

        controller.enqueue(
          new TextEncoder().encode(encodeSSE(createStopChunk(model, created))),
        )
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

export function createPrivateGPTAdapter(): BackendAdapter {
  return {
    async chat(backend: BackendConfig, messages: Message[], params: Partial<ChatRequest>) {
      const body = {
        question: JSON.stringify({ conversation: messages }),
        modelId: backend.model,
      }

      const response = await tryRequest(backend, body)

      if (!response.body) {
        throw new BackendError(500, "empty_body", "No response body")
      }

      if (params.stream) return transformToSSEStream(response.body, backend.model)

      const text = await collectSSEText(response.body)

      const chatResponse: ChatResponse = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: backend.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: text },
            finish_reason: "stop",
          },
        ],
      }

      return chatResponse
    },
  }
}
