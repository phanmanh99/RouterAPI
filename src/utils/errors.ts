import type { Message } from "../types/openai"

export class BackendError extends Error {
  constructor(
    public status: number,
    public code?: string,
    message?: string,
  ) {
    super(message ?? `Backend error: ${status}`)
    this.name = "BackendError"
  }
}

const RETRYABLE_STATUSES = new Set([429])
const RETRYABLE_CODES = new Set([
  "insufficient_quota",
  "rate_limit_exceeded",
  "context_length_exceeded",
  "token_limit_reached",
])

export function isRetryableError(err: unknown): boolean {
  if (err instanceof BackendError) {
    return (
      RETRYABLE_STATUSES.has(err.status) ||
      (err.code !== undefined && RETRYABLE_CODES.has(err.code))
    )
  }
  return false
}

export function hasToolResults(messages: Message[]): boolean {
  return messages.some((m) => m.role === "tool")
}

export async function parseErrorResponse(response: Response): Promise<BackendError> {
  let code: string | undefined
  let message: string | undefined
  try {
    const body = await response.json()
    code = body.error?.code ?? body.error?.type
    message = body.error?.message
  } catch {}
  return new BackendError(response.status, code, message)
}

export function toOpenAIError(err: unknown): { error: { message: string; type: string; code?: string } } {
  if (err instanceof BackendError) {
    return {
      error: {
        message: err.message,
        type: "backend_error",
        code: err.code,
      },
    }
  }
  return {
    error: {
      message: err instanceof Error ? err.message : "Internal server error",
      type: "internal_error",
    },
  }
}
