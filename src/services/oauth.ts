import { BackendError } from "../utils/errors"

export async function getClientCredentialsToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  scope: string,
): Promise<string> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${scope}/.default`,
  })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new BackendError(res.status, "oauth_failed", `Client credentials grant failed: ${text}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new BackendError(500, "oauth_failed", "No access_token in client credentials response")

  return data.access_token
}

export async function refreshTokenGrant(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  scope: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    scope: `${scope}/.default`,
  })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new BackendError(res.status, "oauth_failed", `Refresh token grant failed: ${text}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new BackendError(500, "oauth_failed", "No access_token in refresh response")

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
  }
}

export async function authorizeWithBrowser(
  tenantId: string,
  clientId: string,
  clientSecret: string | undefined,
  scope: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const port = await findAvailablePort()
  const redirectUri = `http://localhost:${port}/callback`

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  const authorizeUrl =
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(`openid offline_access ${scope}`)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`

  console.log(`\n🔐 Opening browser for Microsoft authentication...`)
  console.log(`   Redirect URI: ${redirectUri}\n`)

  const code = await startCallbackServer(port, authorizeUrl)

  if (!code) throw new BackendError(500, "oauth_failed", "No authorization code received or user cancelled")

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  if (clientSecret) params.set("client_secret", clientSecret)

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new BackendError(res.status, "oauth_failed", `Token exchange failed: ${text}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new BackendError(500, "oauth_failed", "No access_token in token exchange response")

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
  }
}

async function findAvailablePort(): Promise<number> {
  const server = Bun.serve({
    port: 0,
    hostname: "localhost",
    fetch() {
      return new Response("")
    },
  })
  const port = server.port!
  server.stop()
  return port
}

interface PendingAuth {
  codeVerifier: string
  backendName: string
  redirectUri: string
}

const pendingAuths = new Map<string, PendingAuth>()

export async function createAuthSession(
  backendName: string,
  redirectUri: string,
): Promise<{ codeVerifier: string; codeChallenge: string; state: string }> {
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateCodeVerifier()
  pendingAuths.set(state, { codeVerifier, backendName, redirectUri })
  return { codeVerifier, codeChallenge, state }
}

export function consumeAuthSession(
  state: string,
): PendingAuth | null {
  const session = pendingAuths.get(state)
  if (session) pendingAuths.delete(state)
  return session ?? null
}

export function buildAuthorizeUrl(
  tenantId: string,
  clientId: string,
  scope: string,
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  return (
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(`openid offline_access ${scope}`)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256` +
    `&state=${encodeURIComponent(state)}`
  )
}

export async function exchangeCode(
  tenantId: string,
  clientId: string,
  clientSecret: string | undefined,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  if (clientSecret) params.set("client_secret", clientSecret)

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new BackendError(res.status, "oauth_failed", `Token exchange failed: ${text}`)
  }

  const data = await res.json()
  if (!data.access_token) throw new BackendError(500, "oauth_failed", "No access_token in token exchange response")

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
  }
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

async function startCallbackServer(
  port: number,
  authorizeUrl: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const server = Bun.serve({
      port,
      hostname: "localhost",
      async fetch(req) {
        const url = new URL(req.url)
        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code")
          const error = url.searchParams.get("error")

          if (error) {
            resolve(null)
            return new Response(`Authentication failed: ${error}`, { status: 400 })
          }

          if (code) {
            resolve(code)
            return new Response("✅ Authentication successful! You can close this tab.", {
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          }

          resolve(null)
          return new Response("No authorization code received", { status: 400 })
        }

        return new Response("Not found", { status: 404 })
      },
      error() {
        resolve(null)
      },
    })

    openBrowser(authorizeUrl)

    setTimeout(() => {
      try { server.stop() } catch {}
      resolve(null)
    }, 300_000)
  })
}

export async function discoverOAuthConfig(
  baseURL: string,
): Promise<{ oauthClientId: string; oauthTenantId: string; oauthScope: string } | null> {
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10_000)
    let text: string
    try {
      const html = await fetch(baseURL, { signal: ac.signal })
      if (!html.ok) return null
      text = await html.text()
    } finally {
      clearTimeout(timer)
    }

    const scriptPattern = /<script[^>]+src="([^"]+)"[^>]*>/g
    const jsUrls: string[] = []
    let match: RegExpExecArray | null
    while ((match = scriptPattern.exec(text)) !== null) {
      const src = match[1]
      if (src.includes("index-") || src.includes("vendor-msal")) {
        jsUrls.push(new URL(src, baseURL).href)
      }
    }

    if (jsUrls.length === 0) return null

    let jsContent = ""
    for (const url of jsUrls) {
      const ac2 = new AbortController()
      const timer2 = setTimeout(() => ac2.abort(), 10_000)
      try {
        const res = await fetch(url, { signal: ac2.signal })
        if (res.ok) jsContent += await res.text()
      } finally {
        clearTimeout(timer2)
      }
    }

    if (!jsContent) return null

    const clientIdMatch = jsContent.match(/clientId:\x60([^\x60]+)\x60/)
    if (!clientIdMatch) return null
    const oauthClientId = clientIdMatch[1]

    const authorityMatch = jsContent.match(/authority:\x60[^\x60]*login\.microsoftonline\.com\/([^\x60\/]+)\x60/)
    if (!authorityMatch) return null
    const oauthTenantId = authorityMatch[1]

    const scopeMatch = jsContent.match(/api:\/\/[\w-]+\/[\w.-]+/)
    const oauthScope = scopeMatch ? scopeMatch[0] : oauthClientId

    return { oauthClientId, oauthTenantId, oauthScope }
  } catch {
    return null
  }
}

export async function deviceCodeGrant(
  tenantId: string,
  clientId: string,
  scope: string,
): Promise<{
  userCode: string
  deviceCode: string
  verificationUri: string
  interval: number
}> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/devicecode`
  const params = new URLSearchParams({
    client_id: clientId,
    scope: `openid offline_access ${scope}`,
  })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new BackendError(res.status, "oauth_failed", `Device code request failed: ${text}`)
  }

  const data = await res.json()
  return {
    userCode: data.user_code,
    deviceCode: data.device_code,
    verificationUri: data.verification_uri,
    interval: data.interval,
  }
}

export async function pollDeviceCodeToken(
  tenantId: string,
  clientId: string,
  deviceCode: string,
): Promise<{ accessToken: string; refreshToken?: string } | { interval: number } | null> {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: clientId,
    device_code: deviceCode,
  })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  const data = await res.json()

  if (res.ok) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? undefined,
    }
  }

  if (data.error === "authorization_pending") return null
  if (data.error === "slow_down") return { interval: data.interval ?? 10 }

  throw new BackendError(res.status, "oauth_failed", `Device code poll failed: ${data.error}`)
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "start"
    : "xdg-open"

  Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore" })
}
