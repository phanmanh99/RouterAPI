import type { AppConfig, BackendConfig } from "../config/types"
import { updateBackendTokens, saveBackendOAuthConfig } from "../config/loader"
import { createAuthSession, consumeAuthSession, buildAuthorizeUrl, exchangeCode, discoverOAuthConfig } from "../services/oauth"

export async function handleAuthStart(
  backendName: string,
  origin: string,
  config: AppConfig,
): Promise<{ authorizeUrl: string } | Response> {
  const backend = config.backends[backendName]
  if (!backend) {
    return new Response(JSON.stringify({ error: `Backend "${backendName}" not found` }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  let { oauthTenantId, oauthClientId, oauthClientSecret, oauthScope } = backend

  if (!oauthTenantId || !oauthClientId) {
    const discovered = await discoverOAuthConfig(backend.baseURL)
    if (!discovered) {
      return new Response(JSON.stringify({ error: "Could not discover OAuth config from this URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    oauthClientId = discovered.oauthClientId
    oauthTenantId = discovered.oauthTenantId
    oauthScope = discovered.oauthScope
    saveBackendOAuthConfig(backendName, discovered.oauthClientId, discovered.oauthTenantId, discovered.oauthScope)
    config = (await import("../config/loader")).reloadConfig()
    backend.oauthClientId = discovered.oauthClientId
    backend.oauthTenantId = discovered.oauthTenantId
    backend.oauthScope = discovered.oauthScope
  }

  const redirectUri = `${origin}/api/auth/callback`
  const scope = oauthScope ?? oauthClientId

  const { codeChallenge, state } = await createAuthSession(backendName, redirectUri)
  const authorizeUrl = buildAuthorizeUrl(oauthTenantId!, oauthClientId!, scope, redirectUri, codeChallenge, state)

  return { authorizeUrl }
}

export async function handleAuthCallback(
  url: URL,
): Promise<Response> {
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return new Response(
      `<html><body><h2>Authentication failed</h2><p>${error}</p><a href="/">Back to Web UI</a></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }

  if (!code || !state) {
    return new Response(
      `<html><body><h2>Missing parameters</h2><a href="/">Back to Web UI</a></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }

  const session = consumeAuthSession(state)
  if (!session) {
    return new Response(
      `<html><body><h2>Session expired or invalid</h2><a href="/">Back to Web UI</a></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }

  const backendName = session.backendName
  const config = await import("../config/loader").then((m) => m.reloadConfig())
  const backend = config.backends[backendName]

  if (!backend || !backend.oauthTenantId || !backend.oauthClientId) {
    return new Response(
      `<html><body><h2>Backend config lost</h2><a href="/">Back to Web UI</a></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }

  const scope = backend.oauthScope ?? backend.oauthClientId

  try {
    const result = await exchangeCode(
      backend.oauthTenantId,
      backend.oauthClientId,
      backend.oauthClientSecret,
      code,
      session.redirectUri,
      session.codeVerifier,
    )

    updateBackendTokens(backendName, result.accessToken, result.refreshToken ?? "")

    const redirectUrl = `/?auth=success&backend=${encodeURIComponent(backendName)}`
    return new Response(null, {
      status: 302,
      headers: { Location: redirectUrl },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token exchange failed"
    return new Response(
      `<html><body><h2>Authentication failed</h2><p>${msg}</p><a href="/">Back to Web UI</a></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    )
  }
}

export async function handleAuthDiscover(
  baseURL: string,
): Promise<Response> {
  if (!baseURL) {
    return new Response(
      JSON.stringify({ error: "Missing baseURL query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }

  const result = await discoverOAuthConfig(baseURL)
  if (!result) {
    return new Response(
      JSON.stringify({ error: "Could not discover OAuth config from this URL" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    )
  }

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  })
}
