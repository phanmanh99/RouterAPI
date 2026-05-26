import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ArrowRight, CheckCircle, XCircle, Edit3, Save, X, Wifi, Plus, Copy, Trash2, LogIn } from "lucide-react"
import type { RouterModelDetail, BackendTestResult } from "../types"
import { Card, CardHeader, CardBody, EmptyState } from "./ui/Card"
import StatusBadge from "./ui/StatusBadge"
import StatusDot from "./ui/StatusDot"
import Spinner from "./ui/Spinner"
import Button from "./ui/Button"

interface AddBackendForm {
  name: string
  provider: string
  model: string
  baseURL: string
  apiKey: string
}

interface AddRouterForm {
  id: string
  name: string
  fallbacks: string
  context: string
  output: string
  tool_call: boolean
  reasoning: boolean
}

const defaultAddBackend: AddBackendForm = {
  name: "", provider: "ollama", model: "", baseURL: "http://", apiKey: "",
}

const defaultAddRouter: AddRouterForm = {
  id: "", name: "", fallbacks: "", context: "", output: "",
  tool_call: false, reasoning: false,
}

export default function Models() {
  const { t } = useTranslation()
  const [models, setModels] = useState<RouterModelDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const [editingRouterId, setEditingRouterId] = useState<string | null>(null)
  const [routerForm, setRouterForm] = useState<{
    name: string; fallbacks: string; context: string; output: string
    tool_call: boolean; reasoning: boolean
  } | null>(null)
  const [savingRouter, setSavingRouter] = useState(false)

  const [editingBackendKey, setEditingBackendKey] = useState<string | null>(null)
  const [backendForm, setBackendForm] = useState<{
    provider: string; model: string; baseURL: string; apiKey: string
  } | null>(null)
  const [savingBackend, setSavingBackend] = useState(false)

  const [testResults, setTestResults] = useState<Record<string, BackendTestResult>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})

  const [showAddBackend, setShowAddBackend] = useState(false)
  const [addBackendForm, setAddBackendForm] = useState<AddBackendForm>(defaultAddBackend)
  const [showAddRouter, setShowAddRouter] = useState(false)
  const [addRouterForm, setAddRouterForm] = useState<AddRouterForm>(defaultAddRouter)
  const [creating, setCreating] = useState(false)

  const fetchModels = useCallback(() => {
    fetch("/api/models/detail")
      .then((r) => r.json())
      .then((data) => { setModels(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchModels()
    const params = new URLSearchParams(location.search)
    if (params.get("auth") === "success") {
      const name = params.get("backend") ?? ""
      showToast(`✅ ${t("models.authSuccess")}: ${name}`)
      window.history.replaceState({}, "", "/")
    }
  }, [fetchModels])

  async function handleOAuth(backendName: string) {
    try {
      const res = await fetch(`/api/auth/start?backend=${encodeURIComponent(backendName)}`)
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const data = await res.json()
      window.location.href = data.authorizeUrl
    } catch (err) {
      showToast(`${t("models.authError")}: ${err instanceof Error ? err.message : "?"}`)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function startRouterEdit(model: RouterModelDetail) {
    setEditingRouterId(model.id)
    setRouterForm({
      name: model.name,
      fallbacks: model.fallbacks.join(","),
      context: model.limit?.context?.toString() ?? "",
      output: model.limit?.output?.toString() ?? "",
      tool_call: model.tool_call,
      reasoning: model.reasoning,
    })
  }

  function cancelRouterEdit() {
    setEditingRouterId(null)
    setRouterForm(null)
  }

  async function saveRouterEdit(model: RouterModelDetail) {
    if (!routerForm) return
    setSavingRouter(true)
    try {
      const fallbacks = routerForm.fallbacks.split(",").map((s) => s.trim()).filter(Boolean)
      const res = await fetch(`/api/router-models/${model.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: routerForm.name,
          fallbacks,
          limit: {
            ...(routerForm.context ? { context: Number(routerForm.context) } : {}),
            ...(routerForm.output ? { output: Number(routerForm.output) } : {}),
          },
          tool_call: routerForm.tool_call,
          reasoning: routerForm.reasoning,
        }),
      })
      if (!res.ok) throw new Error()
      showToast(t("models.saved"))
      cancelRouterEdit()
      fetchModels()
    } catch { showToast(t("models.saveError")) }
    finally { setSavingRouter(false) }
  }

  function startBackendEdit(modelId: string, backend: { name: string; provider: string; model: string; baseURL: string }) {
    setEditingBackendKey(`${modelId}:${backend.name}`)
    setBackendForm({
      provider: backend.provider,
      model: backend.model,
      baseURL: backend.baseURL,
      apiKey: "",
    })
  }

  function cancelBackendEdit() {
    setEditingBackendKey(null)
    setBackendForm(null)
  }

  async function saveBackendEdit(backendName: string) {
    if (!backendForm) return
    setSavingBackend(true)
    try {
      const body: Record<string, unknown> = {
        provider: backendForm.provider,
        model: backendForm.model,
        baseURL: backendForm.baseURL,
      }
      if (backendForm.apiKey) body.apiKey = backendForm.apiKey

      const res = await fetch(`/api/backends/${backendName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      showToast(t("models.saved"))
      cancelBackendEdit()
      fetchModels()
    } catch { showToast(t("models.saveError")) }
    finally { setSavingBackend(false) }
  }

  async function testConnection(backendName: string) {
    setTesting((prev) => ({ ...prev, [backendName]: true }))
    try {
      const res = await fetch(`/api/backends/${backendName}/test`, { method: "POST" })
      const result: BackendTestResult = await res.json()
      setTestResults((prev) => ({ ...prev, [backendName]: result }))
    } catch {
      setTestResults((prev) => ({ ...prev, [backendName]: { name: backendName, reachable: false, latency: 0 } }))
    } finally { setTesting((prev) => ({ ...prev, [backendName]: false })) }
  }

  async function handleCreateBackend() {
    const f = addBackendForm
    if (!f.name || !f.model || !f.baseURL) return
    setCreating(true)
    try {
      const res = await fetch("/api/backends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      showToast(t("models.backendCreated"))
      setShowAddBackend(false)
      setAddBackendForm(defaultAddBackend)
      fetchModels()
    } catch { showToast(t("models.createError")) }
    finally { setCreating(false) }
  }

  async function handleCreateRouter() {
    const f = addRouterForm
    if (!f.id || !f.name) return
    setCreating(true)
    try {
      const fallbacks = f.fallbacks.split(",").map((s) => s.trim()).filter(Boolean)
      const res = await fetch("/api/router-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: f.id, name: f.name, fallbacks,
          context: f.context ? Number(f.context) : undefined,
          output: f.output ? Number(f.output) : undefined,
          tool_call: f.tool_call, reasoning: f.reasoning,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      showToast(t("models.routerModelCreated"))
      setShowAddRouter(false)
      setAddRouterForm(defaultAddRouter)
      fetchModels()
    } catch { showToast(t("models.createError")) }
    finally { setCreating(false) }
  }

  async function handleDeleteBackend(name: string) {
    if (!confirm(t("models.deleteConfirm"))) return
    try {
      const res = await fetch(`/api/backends/${name}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      showToast(t("models.backendDeleted"))
      fetchModels()
    } catch { showToast(t("models.deleteError")) }
  }

  async function handleDeleteRouter(id: string) {
    if (!confirm(t("models.deleteConfirm"))) return
    try {
      const res = await fetch(`/api/router-models/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      showToast(t("models.routerModelDeleted"))
      fetchModels()
    } catch { showToast(t("models.deleteError")) }
  }

  function copyBackend(name: string, b: { provider: string; model: string; baseURL: string }) {
    setAddBackendForm({ name: `${name}-copy`, provider: b.provider, model: b.model, baseURL: b.baseURL, apiKey: "" })
    setShowAddBackend(true)
  }

  function copyRouterModel(model: RouterModelDetail) {
    setAddRouterForm({
      id: `${model.id}-copy`, name: `${model.name} (Copy)`,
      fallbacks: model.fallbacks.join(","),
      context: model.limit?.context?.toString() ?? "",
      output: model.limit?.output?.toString() ?? "",
      tool_call: model.tool_call, reasoning: model.reasoning,
    })
    setShowAddRouter(true)
  }

  const modalBg = "fixed inset-0 bg-black/60 z-40 flex items-center justify-center"

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Spinner /></div>
  }

  return (
    <div className="space-y-6">
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-100">{t("models.title")}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => { setShowAddBackend(true); setAddBackendForm(defaultAddBackend) }}>
            {t("models.addBackend")}
          </Button>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => { setShowAddRouter(true); setAddRouterForm(defaultAddRouter) }}>
            {t("models.addRouterModel")}
          </Button>
        </div>
      </CardHeader>

      {models.length === 0 ? (
        <Card><EmptyState><p className="text-gray-500">{t("models.error")}</p></EmptyState></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {models.map((model) => {
            const isRouterEditing = editingRouterId === model.id

            return (
              <Card key={model.id} hover={!isRouterEditing && !editingBackendKey}>
                <CardHeader>
                  <div className="flex-1 min-w-0">
                    {isRouterEditing && routerForm ? (
                      <input type="text" value={routerForm.name}
                        onChange={(e) => setRouterForm({ ...routerForm, name: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-base font-semibold text-gray-100" />
                    ) : (
                      <><h3 className="text-base font-semibold text-gray-100">{model.name}</h3><code className="text-xs text-gray-500">{model.id}</code></>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {model.tool_call && !isRouterEditing && <StatusBadge variant="info">{t("models.toolCall")}</StatusBadge>}
                    {model.reasoning && !isRouterEditing && <StatusBadge variant="warning">{t("models.reasoning")}</StatusBadge>}
                    {isRouterEditing ? (
                      <div className="flex gap-1">
                        <Button variant="primary" size="sm" icon={<Save size={14} />} loading={savingRouter} onClick={() => saveRouterEdit(model)}>{t("models.save")}</Button>
                        <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={cancelRouterEdit}>{t("models.cancel")}</Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={() => copyRouterModel(model)}>{t("models.copyRouterModel")}</Button>
                        <Button variant="ghost" size="sm" icon={<Edit3 size={14} />} onClick={() => startRouterEdit(model)}>{t("models.edit")}</Button>
                        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={() => handleDeleteRouter(model.id)}>{t("models.deleteRouterModel")}</Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                {isRouterEditing && routerForm && (
                  <div className="mb-4 p-3 bg-gray-800/40 rounded-lg border border-indigo-800/30 space-y-3">
                    <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Router Model</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input type="checkbox" checked={routerForm.tool_call}
                          onChange={(e) => setRouterForm({ ...routerForm, tool_call: e.target.checked })}
                          className="rounded bg-gray-800 border-gray-600" /> {t("models.toolCall")}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input type="checkbox" checked={routerForm.reasoning}
                          onChange={(e) => setRouterForm({ ...routerForm, reasoning: e.target.checked })}
                          className="rounded bg-gray-800 border-gray-600" /> {t("models.reasoning")}
                      </label>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">{t("models.fallbacks")}</label>
                      <input type="text" value={routerForm.fallbacks}
                        onChange={(e) => setRouterForm({ ...routerForm, fallbacks: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
                    </div>
                    <div className="flex gap-4">
                      <div>
                        <label className="text-xs text-gray-500">{t("models.contextLimit")}</label>
                        <input type="number" value={routerForm.context}
                          onChange={(e) => setRouterForm({ ...routerForm, context: e.target.value })}
                          placeholder={t("models.noLimit")}
                          className="w-32 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t("models.outputLimit")}</label>
                        <input type="number" value={routerForm.output}
                          onChange={(e) => setRouterForm({ ...routerForm, output: e.target.value })}
                          placeholder={t("models.noLimit")}
                          className="w-32 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
                      </div>
                    </div>
                  </div>
                )}

                {!isRouterEditing && (
                  <>
                    <div className="flex items-center gap-2 mb-4 text-xs text-gray-500 flex-wrap">
                      {model.fallbacks.map((fb, i) => (
                        <span key={fb} className="flex items-center gap-1">{i > 0 && <ArrowRight size={12} />}{fb}</span>
                      ))}
                    </div>
                    {model.limit && (
                      <div className="flex gap-4 mb-4 text-xs">
                        {model.limit.context && <span className="text-gray-500">{t("models.contextLimit")}: <span className="text-gray-300">{model.limit.context.toLocaleString()}</span></span>}
                        {model.limit.output && <span className="text-gray-500">{t("models.outputLimit")}: <span className="text-gray-300">{model.limit.output.toLocaleString()}</span></span>}
                      </div>
                    )}
                  </>
                )}

                <CardBody>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("models.backends")}</h4>
                  <div className="space-y-2">
                    {model.backends.map((b) => {
                      const bKey = `${model.id}:${b.name}`
                      const isBEditing = editingBackendKey === bKey
                      const bForm = isBEditing ? backendForm : null
                      const testResult = testResults[b.name]
                      const isTesting = testing[b.name]

                      return (
                        <div key={b.name} className="bg-gray-950 rounded-lg px-3 py-2">
                          {isBEditing && bForm ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-200">{b.name}</span>
                                <div className="flex items-center gap-2">
                                  {isTesting ? (
                                    <Button variant="ghost" size="sm" loading>{t("models.testing")}</Button>
                                  ) : (
                                    <Button variant="ghost" size="sm" icon={<Wifi size={12} />} onClick={() => testConnection(b.name)}>{t("models.test")}</Button>
                                  )}
                                  {testResult && <StatusBadge variant={testResult.reachable ? "success" : "error"}>{testResult.reachable ? `${testResult.latency}${t("models.ms")}` : t("models.unreachable")}</StatusBadge>}
                                  <Button variant="primary" size="sm" icon={<Save size={12} />} loading={savingBackend} onClick={() => saveBackendEdit(b.name)}>{t("models.save")}</Button>
                                  <Button variant="ghost" size="sm" icon={<X size={12} />} onClick={cancelBackendEdit}>{t("models.cancel")}</Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-500">{t("models.provider")}</label>
                                  <select value={bForm.provider}
                                    onChange={(e) => setBackendForm({ ...bForm, provider: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200">
                                    <option value="ollama">ollama</option><option value="privategpt">privategpt</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500">{t("dashboard.model")}</label>
                                  <input type="text" value={bForm.model}
                                    onChange={(e) => setBackendForm({ ...bForm, model: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200" />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">{t("dashboard.baseURL")}</label>
                                <input type="text" value={bForm.baseURL}
                                  onChange={(e) => setBackendForm({ ...bForm, baseURL: e.target.value })}
                                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 font-mono" />
                              </div>
                              <div>
                                <label className="text-xs text-gray-500">{t("models.newApiKey")}</label>
                                <input type="password" value={bForm.apiKey}
                                  onChange={(e) => setBackendForm({ ...bForm, apiKey: e.target.value })}
                                  placeholder="********" className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 font-mono" />
                              </div>
                              {bForm.provider === "privategpt" && (
                                <div className="border-t border-gray-700 pt-3 mt-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">OAuth</span>
                                    <Button variant="ghost" size="sm"
                                      icon={<LogIn size={12} />}
                                      onClick={() => handleOAuth(b.name)}
                                      disabled={!bForm.baseURL || bForm.baseURL === "http://"}>
                                      {t("models.authBtn")}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                  <StatusDot variant={b.hasApiKey ? "success" : "warning"} />
                                  <div className="min-w-0">
                                    <p className="text-sm text-gray-200 truncate">{b.name}</p>
                                    <p className="text-xs text-gray-500">{b.provider} / {b.model}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                  <Button variant="ghost" size="sm" icon={<Wifi size={12} />} loading={isTesting} onClick={() => testConnection(b.name)}>{t("models.test")}</Button>
                                  {testResult && <StatusBadge variant={testResult.reachable ? "success" : "error"}>{testResult.reachable ? `${testResult.latency}${t("models.ms")}` : t("models.unreachable")}</StatusBadge>}
                                  {b.provider === "privategpt" && (
                                    <Button variant="ghost" size="sm" icon={<LogIn size={12} />} onClick={() => handleOAuth(b.name)}>{t("models.authBtn")}</Button>
                                  )}
                                  <Button variant="ghost" size="sm" icon={<Edit3 size={12} />} onClick={() => startBackendEdit(model.id, b)} />
                                  <Button variant="ghost" size="sm" icon={<Copy size={12} />} onClick={() => copyBackend(b.name, { provider: b.provider, model: b.model, baseURL: b.baseURL })} />
                                  <Button variant="ghost" size="sm" icon={<Trash2 size={12} />} onClick={() => handleDeleteBackend(b.name)} />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-500 ml-9">
                                <code className="truncate max-w-[200px]">{b.baseURL}</code>
                                {b.hasApiKey ? (
                                  <span className="text-emerald-500 flex items-center gap-1 shrink-0"><CheckCircle size={10} /> {t("models.hasApiKey")}</span>
                                ) : (
                                  <span className="text-gray-600 flex items-center gap-1 shrink-0"><XCircle size={10} /> {t("models.noApiKey")}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}

      {showAddBackend && (
        <div className={modalBg} onClick={() => setShowAddBackend(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-100 mb-4">{t("models.addBackend")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">{t("models.newBackendName")}</label>
                <input type="text" value={addBackendForm.name} onChange={(e) => setAddBackendForm({ ...addBackendForm, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("models.provider")}</label>
                <select value={addBackendForm.provider} onChange={(e) => setAddBackendForm({ ...addBackendForm, provider: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200">
                  <option value="ollama">ollama</option><option value="privategpt">privategpt</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("dashboard.model")}</label>
                <input type="text" value={addBackendForm.model} onChange={(e) => setAddBackendForm({ ...addBackendForm, model: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("dashboard.baseURL")}</label>
                <input type="text" value={addBackendForm.baseURL} onChange={(e) => setAddBackendForm({ ...addBackendForm, baseURL: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("models.apiKeyPlaceholder")}</label>
                <input type="password" value={addBackendForm.apiKey} onChange={(e) => setAddBackendForm({ ...addBackendForm, apiKey: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowAddBackend(false)}>{t("models.cancel")}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreateBackend} disabled={!addBackendForm.name || !addBackendForm.model || !addBackendForm.baseURL}>{t("models.save")}</Button>
            </div>
          </div>
        </div>
      )}

      {showAddRouter && (
        <div className={modalBg} onClick={() => setShowAddRouter(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-100 mb-4">{t("models.addRouterModel")}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">{t("models.newRouterModelId")}</label>
                <input type="text" value={addRouterForm.id} onChange={(e) => setAddRouterForm({ ...addRouterForm, id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 font-mono" />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("models.name")}</label>
                <input type="text" value={addRouterForm.name} onChange={(e) => setAddRouterForm({ ...addRouterForm, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
              </div>
              <div>
                <label className="text-xs text-gray-500">{t("models.fallbacks")}</label>
                <input type="text" value={addRouterForm.fallbacks} onChange={(e) => setAddRouterForm({ ...addRouterForm, fallbacks: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" checked={addRouterForm.tool_call} onChange={(e) => setAddRouterForm({ ...addRouterForm, tool_call: e.target.checked })}
                    className="rounded bg-gray-800 border-gray-600" /> {t("models.toolCall")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" checked={addRouterForm.reasoning} onChange={(e) => setAddRouterForm({ ...addRouterForm, reasoning: e.target.checked })}
                    className="rounded bg-gray-800 border-gray-600" /> {t("models.reasoning")}
                </label>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{t("models.contextLimit")}</label>
                  <input type="number" value={addRouterForm.context} onChange={(e) => setAddRouterForm({ ...addRouterForm, context: e.target.value })}
                    placeholder={t("models.noLimit")} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">{t("models.outputLimit")}</label>
                  <input type="number" value={addRouterForm.output} onChange={(e) => setAddRouterForm({ ...addRouterForm, output: e.target.value })}
                    placeholder={t("models.noLimit")} className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowAddRouter(false)}>{t("models.cancel")}</Button>
              <Button variant="primary" loading={creating} onClick={handleCreateRouter} disabled={!addRouterForm.id || !addRouterForm.name}>{t("models.save")}</Button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-800 border border-gray-700 text-gray-200 px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
