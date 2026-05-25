import { useState, useEffect, useCallback } from "react"
import Sidebar from "./components/Sidebar"
import Dashboard from "./components/Dashboard"
import Chat from "./components/Chat"
import Models from "./components/Models"
import Settings from "./components/Settings"
import type { View } from "./types"

export default function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard")
  const [connected, setConnected] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch("/health")
      .then((r) => {
        setConnected(r.ok)
      })
      .catch(() => setConnected(false))
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  return (
    <div className="flex h-screen bg-gray-950">
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        connected={connected}
      />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {currentView === "dashboard" && <Dashboard onError={showToast} />}
          {currentView === "chat" && <Chat onError={showToast} />}
          {currentView === "models" && <Models />}
          {currentView === "settings" && <Settings onError={showToast} />}
        </div>
      </main>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-700 text-gray-200 px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
