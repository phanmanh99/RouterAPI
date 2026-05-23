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

## ⬜ Phase 2 — Embeddings

| Step | File | Status |
|------|------|--------|
| 2.1 | `src/routes/embeddings.ts` — POST /v1/embeddings | ⬜ |
| 2.2 | Backend adapter + models.json config | ⬜ |

## ⬜ Phase 3 — Image & Audio

| Step | File | Status |
|------|------|--------|
| 3.1 | `src/routes/images.ts` — POST /v1/images/generations | ⬜ |
| 3.2 | `src/routes/audio.ts` — Transcriptions + speech | ⬜ |

## ⬜ Phase 4 — Production hardening

| Step | File | Status |
|------|------|--------|
| 4.1 | Graceful shutdown | ⬜ |
| 4.2 | Request logging middleware | ⬜ |
| 4.3 | GET /health (built into index.ts) | ✅ |
| 4.4 | Rate limiting | ⬜ |

---

## Cách chạy

```bash
cd opencode-provider-server

cp models.example.json models.json
# Sửa models.json với API keys / URLs của bạn

bun run dev      # Dev mode (auto-reload)
bun run start    # Production

# Test
curl http://localhost:3000/v1/models
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"local-llama","messages":[{"role":"user","content":"hello"}]}'
```
