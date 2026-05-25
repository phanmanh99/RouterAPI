import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { RefreshCw, Activity, Box, Shield, Clock } from "lucide-react"
import type { ServerStatus, LogResponse } from "../types"
import { Card, CardHeader, CardBody } from "./ui/Card"
import StatusBadge from "./ui/StatusBadge"
import StatusDot from "./ui/StatusDot"
import Spinner from "./ui/Spinner"
import Button from "./ui/Button"

interface DashboardProps {
  onError: (msg: string) => void
}

export default function Dashboard({ onError }: DashboardProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [logs, setLogs] = useState<LogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "logs">("overview")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/logs"),
      ])
      if (!statusRes.ok) throw new Error("Failed to fetch status")
      setStatus(await statusRes.json())
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (err) {
      onError(t("dashboard.error"))
    } finally {
      setLoading(false)
    }
  }, [onError, t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}d ${h}h ${m}m`
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  const reachableCount = status?.backends.filter((b) => b.reachable).length ?? 0

  return (
    <div className="space-y-6">
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-100">{t("dashboard.title")}</h2>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={fetchData}>
          {t("dashboard.refresh")}
        </Button>
      </CardHeader>

      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "overview"
              ? "bg-indigo-600/20 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {t("dashboard.tab.overview")}
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "logs"
              ? "bg-indigo-600/20 text-indigo-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {t("dashboard.tab.logs")}
        </button>
      </div>

      {activeTab === "overview" && status && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card hover>
              <div className="flex items-center gap-3">
                <Box size={24} className="text-indigo-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{t("dashboard.routerModels")}</p>
                  <p className="text-2xl font-bold text-gray-100">{status.routerModelCount}</p>
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-center gap-3">
                <Activity size={24} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{t("dashboard.backends")}</p>
                  <p className="text-2xl font-bold text-gray-100">{status.backendCount}</p>
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-center gap-3">
                <Shield size={24} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{t("dashboard.reachable")}</p>
                  <p className="text-2xl font-bold text-gray-100">
                    {reachableCount}/{status.backendCount}
                  </p>
                </div>
              </div>
            </Card>

            <Card hover>
              <div className="flex items-center gap-3">
                <Clock size={24} className="text-blue-400 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{t("dashboard.uptime")}</p>
                  <p className="text-2xl font-bold text-gray-100">
                    {formatUptime(status.uptime)}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-gray-200">
                {t("dashboard.backendStatus")}
              </h3>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-4 font-medium">Name</th>
                    <th className="text-left py-2 pr-4 font-medium">{t("dashboard.provider")}</th>
                    <th className="text-left py-2 pr-4 font-medium">{t("dashboard.model")}</th>
                    <th className="text-left py-2 pr-4 font-medium">{t("dashboard.baseURL")}</th>
                    <th className="text-left py-2 pr-4 font-medium">{t("dashboard.apiKey")}</th>
                    <th className="text-left py-2 font-medium">{t("dashboard.reachable")}</th>
                  </tr>
                </thead>
                <tbody>
                  {status.backends.map((b) => (
                    <tr key={b.name} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <StatusDot variant={b.reachable ? "success" : "error"} />
                          <span className="text-gray-200">{b.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{b.provider}</td>
                      <td className="py-3 pr-4 text-gray-400">{b.model}</td>
                      <td className="py-3 pr-4">
                        <code className="text-xs text-gray-400">{b.baseURL}</code>
                      </td>
                      <td className="py-3">
                        <StatusBadge variant={b.hasApiKey ? "success" : "warning"}>
                          {b.hasApiKey
                            ? t("dashboard.configured")
                            : t("dashboard.notConfigured")}
                        </StatusBadge>
                      </td>
                      <td className="py-3">
                        <StatusBadge variant={b.reachable ? "success" : "error"}>
                          {b.reachable
                            ? t("dashboard.reachable")
                            : t("dashboard.unreachable")}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                  {status.backends.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-600">
                        No backends configured
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {activeTab === "logs" && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-200">
              {t("dashboard.tab.logs")}
            </h3>
          </CardHeader>
          <CardBody>
            {!logs || logs.lines.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">
                {t("dashboard.noLogs")}
              </p>
            ) : (
              <div className="bg-gray-950 rounded-lg p-4 max-h-96 overflow-y-auto">
                {logs.lines.map((line, i) => (
                  <pre
                    key={i}
                    className="text-xs font-mono leading-6 text-gray-400 hover:text-gray-300"
                  >
                    {line}
                  </pre>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
