import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import puppeteer, { type Page, type Browser } from "puppeteer"
import { Logger } from "../utils/logger"
import { findConfigPath } from "../config/loader"

function createLogger(): Logger {
  try {
    const configPath = findConfigPath()
    if (configPath && existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8")
      const config = JSON.parse(raw)
      const logging = config.server?.logging
      return new Logger(logging)
    }
  } catch {}
  return new Logger({ level: "info" })
}

const log = createLogger()

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
  log.info(`startBrowserAuth: backend=${backendName} url=${baseURL}`)
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
    const tmp = tmpdir()
    log.info("tmpdir", tmp)
    userDataDir = mkdtempSync(join(tmp, "routerapi-chrome-"))
    log.info("userDataDir", userDataDir)

    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: [
        "--start-maximized",
        `--user-data-dir=${userDataDir}`,
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--disable-default-apps",
        "--no-default-browser-check",
      ],
    })
    log.info(`Browser launched, PID: ${browser.process()?.pid}`)

    const page = await browser.newPage()

    let capturedToken: string | null = null

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.text().includes("msal") || msg.text().includes("token") || msg.text().includes("auth")) {
        log.info("PAGE CONSOLE", { type: msg.type(), text: msg.text() })
      }
    })

    page.on("request", (req) => {
      try {
        const auth = req.headers()["authorization"]
        if (typeof auth === "string" && auth.startsWith("Bearer ")) {
          const token = auth.slice(7)
          if (token.length > 200 && !capturedToken) {
            capturedToken = token
            log.info("Captured Bearer token from request", { url: req.url().substring(0, 80) })
          }
        }
      } catch {}
    })

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false })
    })

    const origin = new URL(baseURL).origin
    log.info(`Navigating to ${origin}...`)

    const gotoResult = await page.goto(origin, { waitUntil: "load", timeout: 30_000 }).catch((err) => {
      log.warn("page.goto failed (non-fatal)", (err as Error)?.message)
      return undefined
    })
    log.info("page.goto resolved", { url: page.url(), status: gotoResult?.status() ?? "N/A" })

    log.info(`Starting token poll loop, origin=${origin}`)
    const result = await waitForMsalTokens(page, origin, () => capturedToken)

    if (result) {
      log.info(`Auth SUCCESS: accessToken length=${result.accessToken.length}, hasRefresh=${!!result.refreshToken}`)
      const s = sessions.get(backendName)!
      s.status = "success"
      s.result = result
    } else {
      log.error("Auth FAILED: null result from waitForMsalTokens")
      const s = sessions.get(backendName)!
      s.status = "error"
      s.error = "Authentication timeout or cancelled"
    }
  } catch (err) {
    log.error("runAuth EXCEPTION", err instanceof Error ? err.message : err)
    const s = sessions.get(backendName)
    if (s) {
      s.status = "error"
      s.error = err instanceof Error ? err.message : "Unknown error"
    }
  } finally {
    log.info("Closing browser...")
    try {
      if (browser) await browser.close()
      log.info("Browser closed")
    } catch { log.warn("Browser close error (ignored)") }
    if (userDataDir) {
      log.info("Cleaning up userDataDir", { path: userDataDir })
      for (let i = 0; i < 5; i++) {
        try {
          rmSync(userDataDir, { recursive: true, force: true })
          log.info("userDataDir cleaned up")
          break
        } catch {
          log.warn(`userDataDir cleanup attempt ${i + 1} failed, retrying...`)
          await sleep(2000)
        }
      }
    }
  }
}

async function waitForMsalTokens(
  page: Page,
  origin: string,
  getCapturedToken: () => string | null,
  timeoutMs = 300_000,
): Promise<BrowserAuthResult | null> {
  const start = Date.now()
  let pollCount = 0
  let logDeadline = 0

  while (Date.now() - start < timeoutMs) {
    let currentUrl: string
    try {
      currentUrl = page.url()
    } catch {
      await sleep(1000)
      continue
    }

    if (!currentUrl.startsWith(origin)) {
      if (Date.now() > logDeadline) {
        logDeadline = Date.now() + 5000
        const title = await page.title().catch(() => "(no title)")
        log.info("Not on origin URL", { currentUrl: currentUrl.substring(0, 120), title })
      }
      await sleep(1000)
      pollCount++
      continue
    }

    if (Date.now() > logDeadline) {
      logDeadline = Date.now() + 5000
      log.info("On origin, pollCount=" + pollCount)
    }

    // 1. Captured Bearer token from request interception
    const captured = getCapturedToken()
    if (captured && captured.length > 200) {
      log.info("Captured token from request")
      return { accessToken: captured, refreshToken: "" }
    }

    // 2. Try MSAL PublicClientApplication instance on page
    const msalToken = await page.evaluate(async () => {
      const visited = new Set<any>()
      const search = (obj: any, depth: number): any => {
        if (depth > 5 || !obj || typeof obj !== "object" || visited.has(obj)) return null
        visited.add(obj)
        if (typeof obj.getAllAccounts === "function" && typeof obj.acquireTokenSilent === "function") return obj
        try {
          for (const key of Object.getOwnPropertyNames(obj)) {
            if (key === "constructor") continue
            try { const r = search(obj[key], depth + 1); if (r) return r } catch {}
          }
        } catch {}
        return null
      }
      const instance = search(window, 0)
      if (!instance) return null
      const accounts = instance.getAllAccounts()
      if (!accounts || accounts.length === 0) return null
      for (const scopes of [["api://fcj-hrapp/Hrapp.User"], ["api://fcj-hrapp/hrapp.user"], ["email", "openid", "profile", "user.read"]]) {
        try { const r = await instance.acquireTokenSilent({ scopes, account: accounts[0], forceRefresh: false }); if (r?.accessToken) return { accessToken: r.accessToken, refreshToken: "" } } catch {}
      }
      return null
    }).catch(() => null)
    if (msalToken) {
      log.info("Got token via MSAL instance")
      return msalToken
    }

    // 3. localStorage plaintext fallback
    const lsResult = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!
        if (!key.includes("accesstoken")) continue
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const val = JSON.parse(raw)
          if (val.secret && typeof val.secret === "string" && val.secret.length > 200)
            return { accessToken: val.secret, refreshToken: "" }
        } catch {}
      }
      return null
    }).catch(() => null)
    if (lsResult) {
      log.info("Got token from localStorage (plaintext)")
      return lsResult
    }

    await sleep(2000)
    pollCount++
  }

  log.info("Token poll timeout", { elapsedMs: Date.now() - start })
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
