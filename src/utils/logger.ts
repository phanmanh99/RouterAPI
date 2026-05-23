import { appendFileSync } from "fs"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[36m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
}

const RESET = "\x1b[0m"

function timestamp(): string {
  return new Date().toISOString()
}

export interface LoggerConfig {
  level: LogLevel
  file?: string
}

export class Logger {
  private level: number
  private file?: string

  constructor(config?: { level?: LogLevel; file?: string }) {
    this.level = config?.level ? LEVELS[config.level] : LEVELS.info
    this.file = config?.file
  }

  private log(level: LogLevel, msg: string, meta?: unknown): void {
    if (LEVELS[level] < this.level) return

    const line = `[${timestamp()}] [${level.toUpperCase()}] ${msg}${meta ? ` ${JSON.stringify(meta)}` : ""}`

    console.log(`${COLORS[level]}${line}${RESET}`)

    if (this.file) {
      appendFileSync(this.file, line + "\n")
    }
  }

  debug(msg: string, meta?: unknown): void {
    this.log("debug", msg, meta)
  }

  info(msg: string, meta?: unknown): void {
    this.log("info", msg, meta)
  }

  warn(msg: string, meta?: unknown): void {
    this.log("warn", msg, meta)
  }

  error(msg: string, meta?: unknown): void {
    this.log("error", msg, meta)
  }
}
