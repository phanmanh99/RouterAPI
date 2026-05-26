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

    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.text().includes("msal") || msg.text().includes("token") || msg.text().includes("auth")) {
        log.info("PAGE CONSOLE", { type: msg.type(), text: msg.text() })
      }
    })

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      (window as any).__capturedToken = null;
      const origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        try {
          const headers = (init as any)?.headers;
          if (headers) {
            const h = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
            const auth = h["authorization"] || h["Authorization"];
            if (typeof auth === "string" && auth.startsWith("Bearer ")) {
              (window as any).__capturedToken = auth.slice(7);
            }
          }
        } catch {}
        return origFetch(input, init);
      };
      const OrigXHR = window.XMLHttpRequest.bind(window);
      const origOpen = OrigXHR.prototype.open;
      const origSetHeader = OrigXHR.prototype.setRequestHeader;
      const xhrMap = new WeakMap<any, Record<string, string>>();
      OrigXHR.prototype.open = function (method: string, url: string) {
        xhrMap.set(this, {});
        return origOpen.apply(this, arguments as any);
      };
      OrigXHR.prototype.setRequestHeader = function (name: string, value: string) {
        const m = xhrMap.get(this);
        if (m) m[name.toLowerCase()] = value;
        return origSetHeader.apply(this, arguments as any);
      };
      const origSend = OrigXHR.prototype.send;
      OrigXHR.prototype.send = function () {
        const m = xhrMap.get(this);
        if (m) {
          const auth = m["authorization"];
          if (typeof auth === "string" && auth.startsWith("Bearer ")) {
            (window as any).__capturedToken = auth.slice(7);
          }
        }
        return origSend.apply(this, arguments as any);
      };
    })

    const origin = new URL(baseURL).origin
    log.info(`Navigating to ${origin}...`)

    const gotoResult = await page.goto(origin, { waitUntil: "load", timeout: 30_000 }).catch((err) => {
      log.warn("page.goto failed (non-fatal)", (err as Error)?.message)
      return undefined
    })
    log.info("page.goto resolved", { url: page.url(), status: gotoResult?.status() ?? "N/A" })

    log.info(`Starting token poll loop, origin=${origin}`)
    const result = await waitForMsalTokens(page, origin)

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
  timeoutMs = 300_000,
): Promise<BrowserAuthResult | null> {
  const start = Date.now()
  let pollCount = 0
  let logDeadline = 0
  let msalLoaded = false

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

    // 1. Fetch interception (set up in evaluateOnNewDocument)
    const captured = await page.evaluate(() => (window as any).__capturedToken).catch(() => null)
    if (captured && captured.length > 200) {
      log.info("Captured token from fetch")
      return { accessToken: captured, refreshToken: "" }
    }

    // 2. Load MSAL from CDN and acquire token
    if (!msalLoaded) {
      const loaded = await page.evaluate(async () => {
        if ((window as any).__msalLoaded) return true
        try {
          const s = document.createElement("script")
          s.src = "https://alcdn.msauth.net/browser/3.6.3/js/msal-browser.min.js"
          document.head.appendChild(s)
          await new Promise<void>((resolve, reject) => { s.onload = () => resolve(); s.onerror = reject })
          ;(window as any).__msalLoaded = true
          return true
        } catch { return false }
      }).catch(() => false)
      msalLoaded = loaded
      if (msalLoaded) log.info("MSAL CDN loaded")
    }

    const viaMsal = await page.evaluate(async () => {
      if (!(window as any).__msalLoaded) return null
      try {
        const pca = new (window as any).msal.PublicClientApplication({
          auth: {
            clientId: "75bb3326-a75b-47b0-97f5-67638167d3b7",
            authority: "https://login.microsoftonline.com/f01e930a-b52e-42b1-b70f-a8882b5d043b",
            redirectUri: "https://privategpt.fptconsulting.co.jp/auth",
          },
          cache: { cacheLocation: "localStorage" },
        })
        const accounts = pca.getAllAccounts()
        if (!accounts || accounts.length === 0) return { status: "noAccounts" }
        for (const scopes of [["api://fcj-hrapp/Hrapp.User"], ["api://fcj-hrapp/hrapp.user"], ["email", "openid", "profile", "user.read"]]) {
          try {
            const r = await pca.acquireTokenSilent({ scopes, account: accounts[0], forceRefresh: false })
            if (r?.accessToken) return { status: "ok", accessToken: r.accessToken }
          } catch (e: any) { /* try next scope */ }
        }
        return { status: "acquireFailed" }
      } catch (e: any) {
        return { status: "error", msg: String(e) }
      }
    }).catch(() => null)

    if (viaMsal?.status === "ok") {
      log.info("Got token via CDN MSAL")
      return { accessToken: viaMsal.accessToken, refreshToken: "" }
    }
    if (viaMsal && viaMsal.status !== "noAccounts") {
      log.info("CDN MSAL result", viaMsal)
    }

    // 3. Find existing MSAL instance on window
    const msalToken = await page.evaluate(async () => {
      const search = (obj: any, depth: number, visited: Set<any>): any => {
        if (depth > 6 || !obj || typeof obj !== "object" || visited.has(obj)) return null
        visited.add(obj)
        if (typeof obj.getAllAccounts === "function" && typeof obj.acquireTokenSilent === "function") return obj
        try {
          for (const key of Object.getOwnPropertyNames(obj)) {
            if (key === "constructor" || key.startsWith("__")) continue
            try { const r = search(obj[key], depth + 1, visited); if (r) return r } catch {}
          }
        } catch {}
        return null
      }
      const instance = search(window, 0, new Set())
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

    // 4. localStorage plaintext fallback
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
