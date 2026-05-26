import puppeteer, { type Page } from "puppeteer"

interface BrowserAuthResult {
  accessToken: string
  refreshToken: string
}

interface Session {
  status: "pending" | "success" | "error"
  result?: BrowserAuthResult
  error?: string
  createdAt: number
}

const sessions = new Map<string, Session>()

const CLEANUP_INTERVAL = 5 * 60 * 1000
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id)
  }
}, CLEANUP_INTERVAL)

export function startBrowserAuth(backendName: string, baseURL: string): void {
  sessions.set(backendName, { status: "pending", createdAt: Date.now() })
  runAuth(backendName, baseURL)
}

export function getAuthStatus(backendName: string): Session | null {
  return sessions.get(backendName) ?? null
}

async function runAuth(backendName: string, baseURL: string) {
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"],
    })

    const page = await browser.newPage()
    const origin = new URL(baseURL).origin

    await page.goto(origin, { waitUntil: "load", timeout: 30_000 }).catch(() => {})

    const result = await waitForMsalTokens(page, origin)

    if (result) {
      const s = sessions.get(backendName)!
      s.status = "success"
      s.result = result
    } else {
      const s = sessions.get(backendName)!
      s.status = "error"
      s.error = "Authentication timeout or cancelled"
    }

    await browser.close().catch(() => {})
  } catch (err) {
    const s = sessions.get(backendName)
    if (s) {
      s.status = "error"
      s.error = err instanceof Error ? err.message : "Unknown error"
    }
  }
}

async function waitForMsalTokens(
  page: Page,
  origin: string,
  timeoutMs = 300_000,
): Promise<BrowserAuthResult | null> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const currentUrl = page.url()
    if (!currentUrl.startsWith(origin)) {
      await sleep(1000)
      continue
    }

    const tokens = await page.evaluate(() => {
      let at: string | null = null
      let rt: string | null = null

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (key.includes(".accesstoken-")) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!)
            if (val.secret) at = val.secret
          } catch {}
        }
        if (key.includes(".refreshtoken-")) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!)
            if (val.secret) rt = val.secret
          } catch {}
        }
      }

      if (at) return { accessToken: at, refreshToken: rt ?? "" }
      return null
    }).catch(() => null)

    if (tokens) return tokens

    await sleep(2000)
  }

  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
