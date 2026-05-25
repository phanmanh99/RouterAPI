# Progress: OpenCode Provider Server

> Bun + Elysia (TypeScript) — OpenAI-compatible server với multi-LLM fallback

---

## ✅ Phase 1 — Core (completed)

| Step | File / Feature | Status |
|------|----------------|--------|
| 1.1 | `src/types/openai.ts` — OpenAI-compatible types | ✅ |
| 1.2 | `src/config/types.ts` — Config types | ✅ |
| 1.3 | `src/config/loader.ts` — Config loader (models.json + env vars + validation) | ✅ |
| 1.4 | `src/middleware/auth.ts` — API key validation | ✅ |
| 1.5 | `src/utils/errors.ts` — Error classification | ✅ |
| 1.6 | `src/utils/sse.ts` — SSE helper | ✅ |
| 1.7 | `src/utils/stream.ts` — Stream line reader | ✅ |
| 1.8 | `src/services/backends/types.ts` — BackendAdapter interface | ✅ |
| 1.9 | `src/services/backends/registry.ts` — Provider registry | ✅ |
| 1.10 | `src/services/backends/ollama.ts` — Ollama adapter | ✅ |
| 1.11 | `src/services/backends/privategpt.ts` — PrivateGPT adapter | ✅ |
| 1.12 | `src/services/fallback.ts` — Core fallback logic | ✅ |
| 1.13 | `src/routes/chat.ts` — POST /v1/chat/completions | ✅ |
| 1.14 | `src/routes/models.ts` — GET /v1/models | ✅ |
| 1.15 | `src/index.ts` — Entry point | ✅ |
| 1.16 | `models.example.json` — Config template | ✅ |
| 1.17 | `opencode.example.json` — OpenCode config template | ✅ |
| 1.18 | Config validation: baseURL required, no hardcoded defaults | ✅ |

---

## ✅ Phase 2 — Web UI (completed)

| Step | File / Feature | Status |
|------|----------------|--------|
| 2.1 | `src/routes/admin.ts` — Management API (status, models/detail, config, logs) | ✅ |
| 2.2 | `src/web/` — Vite + React + Tailwind scaffold | ✅ |
| 2.3 | `src/web/src/i18n.ts` — i18next setup (EN/VN) | ✅ |
| 2.4 | UI primitives (Button, Card, Spinner, StatusBadge, StatusDot) | ✅ |
| 2.5 | Sidebar with view routing | ✅ |
| 2.6 | Dashboard page (overview + logs tab) | ✅ |
| 2.7 | Chat playground (stream + non-stream, fallback display) | ✅ |
| 2.8 | Models page (router models + backend details) | ✅ |
| 2.9 | Settings page (config display + language switcher) | ✅ |
| 2.10 | `@elysiajs/static` integration + SPA serving | ✅ |
| 2.11 | `src/index.ts` — Admin routes registration | ✅ |

---

## ⬜ Phase 3 — Embeddings

| Step | File | Status |
|------|------|--------|
| 3.1 | `src/routes/embeddings.ts` — POST /v1/embeddings | ⬜ |
| 3.2 | Backend adapter + models.json config | ⬜ |

## ⬜ Phase 4 — Image & Audio

| Step | File | Status |
|------|------|--------|
| 4.1 | `src/routes/images.ts` — POST /v1/images/generations | ⬜ |
| 4.2 | `src/routes/audio.ts` — Transcriptions + speech | ⬜ |

## ⬜ Phase 5 — Production hardening

| Step | File | Status |
|------|------|--------|
| 5.1 | Graceful shutdown | ⬜ |
| 5.2 | Rate limiting | ⬜ |
| 5.3 | Request logging middleware (built into index.ts) | ✅ |
| 5.4 | GET /health | ✅ |

---

## Cách chạy

```bash
cd opencode-provider-server

cp models.example.json models.json
# Sửa models.json với API keys / URLs của bạn

bun run dev      # Dev mode (auto-reload)
bun run start    # Production

# Build web UI (cần chạy 1 lần, hoặc sau khi sửa frontend)
bun run build:web

# Dev web UI (Vite HMR, cổng 5173)
bun run dev:web

# Test
curl http://localhost:3000/v1/models
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"local-llama","messages":[{"role":"user","content":"hello"}]}'
```
