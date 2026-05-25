import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Globe, Server, FileText } from "lucide-react"
import type { ServerConfig } from "../types"
import { Card, CardHeader, CardBody } from "./ui/Card"
import StatusBadge from "./ui/StatusBadge"
import Spinner from "./ui/Spinner"
import Button from "./ui/Button"

interface SettingsProps {
  onError: (msg: string) => void
}

export default function Settings({ onError }: SettingsProps) {
  const { t, i18n } = useTranslation()
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data)
        setLoading(false)
      })
      .catch(() => {
        onError(t("settings.error"))
        setLoading(false)
      })
  }, [onError, t])

  function changeLanguage(lng: string) {
    i18n.changeLanguage(lng)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  if (!config) {
    return (
      <Card>
        <CardBody>
          <p className="text-gray-500 text-center py-8">{t("settings.error")}</p>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-100">{t("settings.title")}</h2>
      </CardHeader>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server size={18} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-gray-200">{t("settings.server")}</h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">{t("settings.port")}</p>
              <p className="text-sm text-gray-200 font-mono">{config.server.port}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t("settings.host")}</p>
              <p className="text-sm text-gray-200 font-mono">{config.server.host}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">{t("settings.auth")}</p>
            <StatusBadge variant={config.server.authEnabled ? "success" : "error"}>
              {config.server.authEnabled ? t("dashboard.enabled") : t("dashboard.disabled")}
            </StatusBadge>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-gray-200">{t("settings.logging")}</h3>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">{t("settings.level")}</p>
              <p className="text-sm text-gray-200 font-mono">{config.server.logging.level}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t("settings.file")}</p>
              <p className="text-sm text-gray-200 font-mono">
                {config.server.logging.file || "-"}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-indigo-400" />
            <h3 className="text-sm font-semibold text-gray-200">{t("settings.language")}</h3>
          </div>
        </CardHeader>
        <CardBody className="flex gap-3">
          <Button
            variant={i18n.language?.startsWith("en") ? "primary" : "secondary"}
            size="sm"
            onClick={() => changeLanguage("en")}
          >
            {t("settings.english")}
          </Button>
          <Button
            variant={i18n.language?.startsWith("vi") ? "primary" : "secondary"}
            size="sm"
            onClick={() => changeLanguage("vi")}
          >
            {t("settings.vietnamese")}
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}
