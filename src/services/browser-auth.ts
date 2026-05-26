import { mkdtempSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import puppeteer, { type Page, type Browser } from "puppeteer"

const log = (...args: unknown[]) => console.log(`[BrowserAuth] ${new Date().toISOString()}`, ...args)

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
  log(`startBrowserAuth: backend=${backendName} url=${baseURL}`)
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
    log(`userDataDir created: ${userDataDir}`)

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized", `--user-data-dir=${userDataDir}`],
    })
    log(`Browser launched, PID: ${browser.process()?.pid}`)

    const page = await browser.newPage()
    const origin = new URL(baseURL).origin
    log(`Navigating to ${origin}...`)

    const gotoResult = await page.goto(origin, { waitUntil: "load", timeout: 30_000 }).catch((err) => {
      log(`page.goto failed (non-fatal):`, (err as Error)?.message)
      return undefined
    })
    log(`page.goto resolved, url=${page.url()}, status=${gotoResult?.status() ?? "N/A"}`)

    log(`Starting token poll loop, origin=${origin}`)
    const result = await waitForMsalTokens(page, origin)

    if (result) {
      log(`Auth SUCCESS: accessToken length=${result.accessToken.length}, hasRefresh=${!!result.refreshToken}`)
      const s = sessions.get(backendName)!
      s.status = "success"
      s.result = result
    } else {
      log(`Auth FAILED: null result from waitForMsalTokens`)
      const s = sessions.get(backendName)!
      s.status = "error"
      s.error = "Authentication timeout or cancelled"
    }
  } catch (err) {
    log(`runAuth EXCEPTION:`, err instanceof Error ? err.message : err)
    const s = sessions.get(backendName)
    if (s) {
      s.status = "error"
      s.error = err instanceof Error ? err.message : "Unknown error"
    }
  } finally {
    log(`Closing browser...`)
    try {
      if (browser) await browser.close()
      log(`Browser closed`)
    } catch { log(`Browser close error (ignored)`) }
    if (userDataDir) {
      log(`Cleaning up userDataDir: ${userDataDir}`)
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true })
          log(`userDataDir cleaned up`)
          break
        } catch {
          log(`userDataDir cleanup attempt ${i + 1} failed, retrying...`)
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
  let pollCount = 0

  while (Date.now() - start < timeoutMs) {
    let currentUrl: string
    try {
      currentUrl = page.url()
    } catch {
      if (pollCount % 5 === 0) log(`page.url() threw (navigation in progress), retrying...`)
      await sleep(1000)
      continue
    }

    if (!currentUrl.startsWith(origin)) {
      if (pollCount === 0 || pollCount % 15 === 0) {
        log(`Waiting for origin URL... current=${currentUrl}`)
      }
      await sleep(1000)
      pollCount++
      continue
    }

    if (pollCount % 10 === 0 || pollCount === 0) {
      log(`On origin URL, checking localStorage for MSAL tokens... (poll #${pollCount})`)
    }

    const tokens = await page.evaluate(() => {
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        allKeys.push(localStorage.key(i)!)
      }
      for (const key of allKeys) {
        if (key.includes(".accesstoken-") || key.includes(".refreshtoken-")) {
          try {
            const val = JSON.parse(localStorage.getItem(key)!)
            if (val.secret) return { key, credentialType: val.credentialType, secret: val.secret }
          } catch {}
        }
      }
      return null
    }).catch(() => null)

    if (tokens) {
      log(`Found token in localStorage: key=${tokens.key}, type=${tokens.credentialType}`)

      const allTokens = await page.evaluate(() => {
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

      if (allTokens) return allTokens
    }

    await sleep(2000)
    pollCount++
  }

  log(`Token poll timeout after ${Date.now() - start}ms`)
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
