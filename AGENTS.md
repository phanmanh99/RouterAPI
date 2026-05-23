# AGENTS.md — OpenCode Provider Server

## Runtime & toolchain

- **Runtime:** Bun, not Node.js. Use `bun` for everything (install, run, typecheck).
- **Server:** Elysia (`^1.2.0`). Uses Bun-native `fetch` — no `axios`/`undici`.
- **TypeScript:** `bunx --bun tsc --noEmit` (must prefix with `--bun`).
- **Commands:**
  - `bun install` — install deps
  - `bun run dev` — dev server with file watching
  - `bun run start` — production start
- **No test framework** configured yet.

## Project structure

```
opencode-provider-server/
├── src/
│   ├── index.ts              # Entry point, Elysia app setup
│   ├── config/
│   │   ├── loader.ts         # Reads models.json, resolves ${ENV_VAR}, validates required fields
│   │   └── types.ts          # BackendConfig, RouterModelConfig types
│   ├── routes/
│   │   ├── chat.ts           # POST /v1/chat/completions
│   │   └── models.ts         # GET /v1/models
│   ├── services/
│   │   ├── fallback.ts       # Core transparent fallback logic
│   │   └── backends/
│   │       ├── registry.ts   # provider string → adapter mapping
│   │       ├── types.ts      # BackendAdapter interface
│   │       ├── ollama.ts     # Ollama adapter
│   │       └── privategpt.ts # PrivateGPT adapter
│   ├── middleware/
│   │   └── auth.ts           # Optional Bearer token validation
│   ├── types/openai.ts       # OpenAI-compatible request/response types
│   └── utils/
│       ├── errors.ts         # BackendError, isRetryableError, hasToolResults
│       ├── sse.ts            # SSE encode helpers
│       └── stream.ts         # Stream line reader utility
├── models.example.json       # Backend + router model config template
├── opencode.example.json     # OpenCode provider config template
├── PROGRESS.md               # Implementation phase tracking
└── README.md                 # Project documentation
```

## Architecture

- **Config-driven:** All backend/model config lives in `models.json`. `${ENV_VAR}` syntax in apiKey/baseURL fields is auto-resolved at startup. Backend must have `baseURL` — no hardcoded defaults in source.
- **Validation:** `validateConfig()` runs at startup. Missing `baseURL` or unknown backend references throw immediately.
- **Router models** abstract over real backends. Clients call `local-llama` or `my-privategpt`, the server routes through a fallback chain.
- **Adapters** (`src/services/backends/`) implement `BackendAdapter.chat()`. Add a new provider by creating an adapter and registering it in `registry.ts`.
- **Fallback** (`src/services/fallback.ts`):
  - Retries next backend on 429 / `insufficient_quota` / `context_length_exceeded` / `token_limit_reached`.
  - Never falls back after tool results are in messages, after sending first SSE chunk, or on 400/500 errors.
  - Response includes `X-Fallback` header (e.g. `ollama-llama3→privategpt-4o`).
- **Auth** is optional; enable by adding `"server.apiKey"` to `models.json`.
- **Security:** `models.json` and `opencode.json` are in `.gitignore`. Use `*.example.json` as templates.

## Implementation state

| Phase | Status |
|-------|--------|
| Phase 1 — Core (chat + models + fallback) | ✅ Complete |
| Phase 2 — Embeddings | ⬜ Not started |
| Phase 3 — Image & Audio | ⬜ Not started |
| Phase 4 — Production hardening | ⬜ Not started |

## Conventions

- No comments in production code.
- `BackendError` is the only custom error type. Always throw `BackendError` with `(status, code?, message?)` from adapters.
- All adapters return raw JSON for non-streaming, `ReadableStream` for streaming.
- New routes go in `src/routes/` and are registered in `src/index.ts` on the Elysia app.
- `GET /v1/models` returns only router_models, never backend models.
- `models.json` is the single source of truth for backends — no hardcoded URLs or API keys in source files.
