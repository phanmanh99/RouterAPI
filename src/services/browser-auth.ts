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

  while (Date.now() - start < timeoutMs) {
    let currentUrl: string
    try {
      currentUrl = page.url()
    } catch {
      if (pollCount % 5 === 0) log.warn("page.url() threw (navigation in progress), retrying...")
      await sleep(1000)
      continue
    }

    if (!currentUrl.startsWith(origin)) {
      if (Date.now() > logDeadline) {
        logDeadline = Date.now() + 5000
        const title = await page.title().catch(() => "(no title)")
        log.info("Not on origin URL", { currentUrl, title })
      }
      await sleep(1000)
      pollCount++
      continue
    }

    if (Date.now() > logDeadline) {
      logDeadline = Date.now() + 5000
      log.info("On origin, checking localStorage...", { pollCount })
    }

    const rawDebug = await page.evaluate(() => {
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        allKeys.push(localStorage.key(i)!)
      }
      for (const key of allKeys) {
        if (/[|.]accesstoken[-|]/.test(key)) {
          const raw = localStorage.getItem(key)
          if (raw === null) return { key, err: "getItem null" }
          let val: any
          try { val = JSON.parse(raw) } catch { return { key, raw: raw.substring(0, 300), err: "JSON.parse failed" } }
          const topKeys = Object.keys(val)
          return { key, topKeys, val: JSON.stringify(val).substring(0, 1000) }
        }
      }
      return { keys: allKeys }
    }).catch(() => null)
    log.info("DEBUG ls", rawDebug)

    const tokens = await page.evaluate(() => {
      const allKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        allKeys.push(localStorage.key(i)!)
      }
      for (const key of allKeys) {
        if (/[|.]accesstoken[-|]/.test(key)) {
          try {
            const raw = localStorage.getItem(key)!
            const val = JSON.parse(raw)
            const possibleSecret = val.secret ?? val.token ?? val.access_token ?? val.credential ?? val.value ?? val.data
            if (possibleSecret) {
              return { key, credentialType: val.credentialType, secret: possibleSecret, foundKey: ["secret","token","access_token","credential","value","data"].find(k => val[k]) }
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e)
            return { localStorageKeys: allKeys, debugError: { key, err: errMsg } }
          }
        }
      }
      return { localStorageKeys: allKeys }
    }).catch(() => null)

    if (tokens) {
      if ("localStorageKeys" in tokens) {
        log.info("No MSAL tokens in localStorage", { keys: (tokens as any).localStorageKeys, debug: (tokens as any).debugError })
      } else {
        log.info("Found token in localStorage", { key: tokens.key, type: tokens.credentialType })

        const allTokens = await page.evaluate(() => {
          let at: string | null = null
          let rt: string | null = null
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!
            const raw = localStorage.getItem(key)
            if (!raw) continue
            let val: any
            try { val = JSON.parse(raw) } catch { continue }
            if (!val || typeof val !== "object") continue
            const possibleSecret = val.secret ?? val.token ?? val.access_token ?? val.credential ?? val.value ?? val.data
            if (!possibleSecret) continue
            if (/[|.]accesstoken[-|]/.test(key)) {
              at = possibleSecret
            }
            if (/[|.]refreshtoken[-|]/.test(key)) {
              rt = possibleSecret
            }
          }
          if (at) return { accessToken: at, refreshToken: rt ?? "" }
          return null
        }).catch(() => null)

        if (allTokens) {
          log.info("Returning tokens from waitForMsalTokens")
          return allTokens
        }
      }
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
