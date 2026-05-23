export function createAuthMiddleware(apiKey?: string) {
  return (request: Request): Response | null => {
    if (!apiKey) return null

    const auth = request.headers.get("Authorization")
    if (!auth || !auth.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: { message: "Missing or invalid API key", type: "auth_error" },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      )
    }

    const token = auth.slice(7)
    if (token !== apiKey) {
      return new Response(
        JSON.stringify({
          error: { message: "Invalid API key", type: "auth_error" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }

    return null
  }
}

export function createApiKeyValidator(apiKey?: string) {
  return (request: Request): Response | null => createAuthMiddleware(apiKey)(request)
}
