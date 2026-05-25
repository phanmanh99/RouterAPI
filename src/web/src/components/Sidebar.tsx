import { useTranslation } from "react-i18next"
import {
  LayoutDashboard,
  MessageSquare,
  Box,
  Settings,
} from "lucide-react"
import type { View } from "../types"
import StatusDot from "./ui/StatusDot"

interface SidebarProps {
  currentView: View
  onNavigate: (view: View) => void
  connected: boolean
}

const navItems: { view: View; labelKey: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", labelKey: "sidebar.dashboard", icon: LayoutDashboard },
  { view: "chat", labelKey: "sidebar.chat", icon: MessageSquare },
  { view: "models", labelKey: "sidebar.models", icon: Box },
  { view: "settings", labelKey: "sidebar.settings", icon: Settings },
]

export default function Sidebar({ currentView, onNavigate, connected }: SidebarProps) {
  const { t } = useTranslation()

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col h-screen shrink-0">
      <div className="p-4 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔀</span>
          <h1 className="text-sm font-bold text-gray-100">OpenCode Provider</h1>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {t("app.description")}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ view, labelKey, icon: Icon }) => (
          <button
            key={view}
            onClick={() => onNavigate(view)}
            className={`sidebar-link w-full text-left ${
              currentView === view ? "active" : "text-gray-400"
            }`}
          >
            <Icon size={18} />
            {t(labelKey)}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <StatusDot variant={connected ? "success" : "error"} />
          <span>
            {connected ? t("sidebar.status") : t("sidebar.disconnected")}
          </span>
        </div>
      </div>
    </aside>
  )
}
