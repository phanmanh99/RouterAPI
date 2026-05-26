import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import puppeteer, { type Page, type Browser } from "puppeteer"

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
  let userDataDir: string | undefined
  let browser: Browser | undefined
  try {
    userDataDir = mkdtempSync(join(tmpdir(), "routerapi-chrome-"))
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized", `--user-data-dir=${userDataDir}`],
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
  } catch (err) {
    const s = sessions.get(backendName)
    if (s) {
      s.status = "error"
      s.error = err instanceof Error ? err.message : "Unknown error"
    }
  } finally {
    try {
      if (browser) await browser.close()
    } catch {}
    if (userDataDir) {
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true })
          break
        } catch {
          await sleep(2000)
        }
      }
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
    let currentUrl: string
    try {
      currentUrl = page.url()
    } catch {
      await sleep(1000)
      continue
    }
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
