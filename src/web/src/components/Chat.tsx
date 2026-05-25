import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { Send, Trash2, Copy, CheckCheck, Play } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { RouterModelDetail } from "../types"
import { CardHeader } from "./ui/Card"
import StatusBadge from "./ui/StatusBadge"
import Button from "./ui/Button"

interface Message {
  role: "system" | "user" | "assistant"
  content: string
}

interface ChatProps {
  onError: (msg: string) => void
}

function extractText(node: unknown): string {
  if (typeof node === "string") return node
  if (typeof node === "number" || typeof node === "boolean") return String(node)
  if (Array.isArray(node)) return node.map(extractText).join("")
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as any).props.children)
  }
  return ""
}

export default function Chat({ onError }: ChatProps) {
  const { t } = useTranslation()
  const [models, setModels] = useState<RouterModelDetail[]>([])
  const [selectedModel, setSelectedModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(true)
  const [loading, setLoading] = useState(false)
  const [fallback, setFallback] = useState("")
  const [copied, setCopied] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    fetch("/api/models/detail")
      .then((r) => r.json())
      .then((data: RouterModelDetail[]) => {
        setModels(data)
        const firstReachable = data.find((m) => m.reachable)
        if (firstReachable) setSelectedModel(firstReachable.id)
        else if (data.length > 0) setSelectedModel(data[0].id)
      })
      .catch(() => onError(t("chat.noModels")))
  }, [onError, t])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || !selectedModel || loading) return
    const selected = models.find((m) => m.id === selectedModel)
    if (!selected?.reachable) {
      onError(t("chat.modelOffline"))
      return
    }

    const userMsg: Message = { role: "user", content: input.trim() }
    const newMessages = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages, userMsg]
      : [...messages, userMsg]

    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    setFallback("")

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const body = {
        model: selectedModel,
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        stream: streaming,
      }

      if (streaming) {
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error?.message || res.statusText)
        }

        const fb = res.headers.get("X-Fallback") || ""
        setFallback(fb)

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let assistantContent = ""
        let rafId: number | null = null

        function flushContent() {
          rafId = null
          setMessages((prev) => {
            const updated = [...prev]
            if (updated.length > 0 && updated[updated.length - 1].role === "assistant") {
              updated[updated.length - 1] = { role: "assistant", content: assistantContent }
            }
            return updated
          })
        }

        function scheduleFlush() {
          if (rafId === null) {
            rafId = requestAnimationFrame(() => flushContent())
          }
        }

        setMessages((prev) => [...prev, { role: "assistant", content: "" }])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

          for (const line of lines) {
            const data = line.slice(6)
            if (data === "[DONE]") continue

            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                assistantContent += delta
                scheduleFlush()
              }
            } catch {
              // ignore parse errors
            }
          }
        }

        if (rafId !== null) cancelAnimationFrame(rafId)
        flushContent()
      } else {
        const res = await fetch("/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error?.message || res.statusText)
        }

        const fb = res.headers.get("X-Fallback") || ""
        setFallback(fb)

        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ""
        setMessages((prev) => [...prev, { role: "assistant", content }])
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${t("chat.error")}: ${err instanceof Error ? err.message : String(err)}` },
      ])
    } finally {
      setLoading(false)
      setAbortController(null)
    }
  }, [input, selectedModel, loading, messages, systemPrompt, streaming, t, onError, models])

  function stopStreaming() {
    abortController?.abort()
  }

  function clearChat() {
    setMessages([])
    setFallback("")
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  async function copyResponse(content: string) {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-100">{t("chat.title")}</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={streaming}
              onChange={(e) => setStreaming(e.target.checked)}
              className="rounded bg-gray-800 border-gray-600"
            />
            {streaming ? t("chat.sseEnabled") : t("chat.sseDisabled")}
          </label>
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={clearChat}
          >
            {t("chat.clear")}
          </Button>
        </div>
      </CardHeader>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">{t("chat.model")}:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id} disabled={!m.reachable}>
                  {m.reachable ? "✓ " : "✗ "}{m.name}{m.reachable ? "" : " (offline)"}
                </option>
              ))}
            </select>
          </div>

          {fallback && (
            <StatusBadge variant="info">
              {`${t("chat.fallback")}: ${fallback}`}
            </StatusBadge>
          )}
        </div>

        <div className="mb-4">
          <label className="text-sm text-gray-500 block mb-1">
            {t("chat.systemPrompt")}
          </label>
          <input
            type="text"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t("chat.systemPromptPlaceholder")}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-gray-900/50 rounded-xl p-4 min-h-0">
          {messages.length === 0 && (
            <p className="text-gray-600 text-center py-8">{t("chat.selectModel")}</p>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400">
                {msg.role === "user" ? "U" : msg.role === "system" ? "S" : "A"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-1 font-medium uppercase">
                  {msg.role}
                </div>
                <div className="text-sm text-gray-200 break-words">
                  {msg.role === "assistant" && msg.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || "")
                          const isInline = !match
                          if (isInline) {
                            return (
                              <code className="bg-gray-800 text-pink-300 px-1.5 py-0.5 rounded text-xs" {...props}>
                                {children}
                              </code>
                            )
                          }
                          const [copiedCode, setCopiedCode] = useState(false)
                          function handleCopy() {
                            const text = extractText(children)
                            navigator.clipboard.writeText(text)
                            setCopiedCode(true)
                            setTimeout(() => setCopiedCode(false), 2000)
                          }
                          return (
                            <div className="relative group my-2">
                              <pre className="bg-gray-950 text-gray-200 rounded-lg p-4 overflow-x-auto text-xs">
                                <code className={className} {...props}>
                                  {children}
                                </code>
                              </pre>
                              <button
                                onClick={handleCopy}
                                className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-700 hover:text-gray-200 transition-all"
                              >
                                {copiedCode ? <CheckCheck size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                          )
                        },
                        pre({ children }) {
                          return <>{children}</>
                        },
                        p({ children }) {
                          return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
                        },
                        ul({ children }) {
                          return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>
                        },
                        ol({ children }) {
                          return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>
                        },
                        a({ href, children }) {
                          return (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">
                              {children}
                            </a>
                          )
                        },
                        h1({ children }) { return <h1 className="text-lg font-bold mb-2 mt-4 text-gray-100">{children}</h1> },
                        h2({ children }) { return <h2 className="text-base font-bold mb-2 mt-3 text-gray-100">{children}</h2> },
                        h3({ children }) { return <h3 className="text-sm font-bold mb-1 mt-2 text-gray-100">{children}</h3> },
                        blockquote({ children }) {
                          return <blockquote className="border-l-4 border-gray-600 pl-4 my-2 text-gray-400 italic">{children}</blockquote>
                        },
                        table({ children }) {
                          return (
                            <div className="overflow-x-auto my-2">
                              <table className="min-w-full text-xs border-collapse border border-gray-700">{children}</table>
                            </div>
                          )
                        },
                        th({ children }) { return <th className="border border-gray-700 px-3 py-1.5 bg-gray-800 text-left font-medium">{children}</th> },
                        td({ children }) { return <td className="border border-gray-700 px-3 py-1.5">{children}</td> },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {msg.content || (loading && i === messages.length - 1 && msg.role === "assistant" ? (
                        <span className="text-gray-500">{t("chat.thinking")}</span>
                      ) : msg.content)}
                    </span>
                  )}
                </div>
                {msg.role === "assistant" && msg.content && (
                  <button
                    onClick={() => copyResponse(msg.content)}
                    className="mt-1 text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1"
                  >
                    {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
                    {copied ? t("chat.copied") : t("chat.copy")}
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.placeholder")}
            rows={2}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500"
            disabled={loading}
          />
          {loading ? (
            <Button variant="danger" onClick={stopStreaming} icon={<Play size={16} />}>
              {t("chat.stop")}
            </Button>
          ) : (
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || !selectedModel}
              icon={<Send size={16} />}
            >
              {t("chat.send")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
