# AGENTS.md — OpenCode Provider Server

## Runtime & toolchain

- **Runtime:** Bun, not Node.js. Use `bun` for everything (install, run, typecheck).
- **Server:** Elysia (`^1.2.0`). Uses Bun-native `fetch` — no `axios`/`undici`.
- **Frontend:** React 19 + Vite 7 + Tailwind CSS 3 + i18next (EN/VN).
- **TypeScript:** `bunx --bun tsc --noEmit` (must prefix with `--bun`).
- **Commands:**
  - `bun install` — install deps
  - `bun run dev` — dev server with file watching
  - `bun run start` — production start
  - `bun run build:web` — build frontend (run before start if frontend changed)
  - `bun run dev:web` — Vite dev server (HMR at port 5173, proxies `/v1` and `/api` to backend)
- **No test framework** configured yet.

## Project structure

```
opencode-provider-server/
├── src/
│   ├── index.ts              # Entry point, Elysia app setup + static serving + admin routes
│   ├── config/
│   │   ├── loader.ts         # Reads models.json, resolves ${ENV_VAR}, validates required fields
│   │   └── types.ts          # BackendConfig, RouterModelConfig types
│   ├── routes/
│   │   ├── chat.ts           # POST /v1/chat/completions
│   │   ├── models.ts         # GET /v1/models
│   │   └── admin.ts          # Web UI management API (/api/status, /api/models/detail, /api/config, /api/logs)
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
│   ├── utils/
│   │   ├── errors.ts         # BackendError, isRetryableError, hasToolResults
│   │   ├── sse.ts            # SSE encode helpers
│   │   └── stream.ts         # Stream line reader utility
│   └── web/                  # React SPA frontend
│       ├── index.html
│       ├── package.json, vite.config.ts, tailwind.config.js, postcss.config.cjs
│       ├── tsconfig.json, tsconfig.node.json
│       ├── dist/             # Built production assets
│       └── src/
│           ├── main.tsx, App.tsx, index.css, i18n.ts, types.ts
│           ├── locales/en.json, vi.json
│           └── components/
│               ├── Sidebar.tsx, Dashboard.tsx, Chat.tsx, Models.tsx, Settings.tsx
│               └── ui/Button.tsx, Card.tsx, Spinner.tsx, StatusBadge.tsx, StatusDot.tsx
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
- **Web UI** is a React SPA served at `/`. Built files in `src/web/dist/` are served statically by Elysia.
- **Security:** `models.json` and `opencode.json` are in `.gitignore`. Use `*.example.json` as templates.

## Implementation state

| Phase | Status |
|-------|--------|
| Phase 1 — Core (chat + models + fallback) | ✅ Complete |
| Phase 2 — Web UI (Dashboard, Chat, Models, Settings) | ✅ Complete |
| Phase 3 — Embeddings | ⬜ Not started |
| Phase 4 — Image & Audio | ⬜ Not started |
| Phase 5 — Production hardening | ⬜ Not started |

## Conventions

- No comments in production code.
- `BackendError` is the only custom error type. Always throw `BackendError` with `(status, code?, message?)` from adapters.
- All adapters return raw JSON for non-streaming, `ReadableStream` for streaming.
- New routes go in `src/routes/` and are registered in `src/index.ts` on the Elysia app.
- `GET /v1/models` returns only router_models, never backend models.
- `models.json` is the single source of truth for backends — no hardcoded URLs or API keys in source files.
- Web UI components use `useTranslation()` for i18n, with keys in `src/web/src/locales/en.json` and `vi.json`.
