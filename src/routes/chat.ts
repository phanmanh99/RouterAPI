import type { AppConfig } from "../config/types"
import type { ChatRequest, ChatResponse } from "../types/openai"
import { handleChatRequest } from "../services/fallback"
import { encodeSSE, encodeSSEDone } from "../utils/sse"
import { toOpenAIError } from "../utils/errors"
import type { Logger } from "../utils/logger"

let counter = 0
function nextId(): string {
  return `chatcmpl-${Date.now()}-${counter++}`
}

export async function handleChat(
  body: ChatRequest,
  config: AppConfig,
  logger?: Logger,
): Promise<Response> {
  logger?.debug("Chat request", { model: body.model, messages: body.messages, stream: body.stream })
  const id = nextId()
  const created = Math.floor(Date.now() / 1000)

  try {
    const result = await handleChatRequest(body.model, body.messages, body, config)

    if (!result) {
      return new Response(
        JSON.stringify({
          error: {
            message: `Model "${body.model}" not found`,
            type: "invalid_request_error",
          },
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      )
    }

    const { response, fallbackHeader } = result

    if (body.stream) {
      logger?.debug("Chat streaming response started", { model: body.model })
      const stream = response as ReadableStream
      const fallback = fallbackHeader

      const transformed = new ReadableStream({
        async start(controller) {
          const reader = stream.getReader()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                controller.enqueue(new TextEncoder().encode(encodeSSEDone()))
                break
              }
              controller.enqueue(value)
            }
            controller.close()
          } catch (err) {
            controller.error(err)
          }
        },
      })

      return new Response(transformed, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Fallback": fallback,
        },
      })
    }

    const chatResponse: ChatResponse = {
      ...(response as any),
      id,
      created,
    }

    logger?.debug("Chat response", { model: body.model, choices: chatResponse.choices })

    return new Response(JSON.stringify(chatResponse), {
      headers: {
        "Content-Type": "application/json",
        "X-Fallback": fallbackHeader,
      },
    })
  } catch (err) {
    logger?.debug("Chat request failed", { error: err instanceof Error ? err.message : String(err) })
    const openaiErr = toOpenAIError(err)
    const status = openaiErr.error.type === "backend_error" ? 502 : 500
    return new Response(JSON.stringify(openaiErr), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  }
}
