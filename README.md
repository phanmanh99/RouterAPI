# OpenCode Provider Server

Máy chủ proxy tương thích OpenAI với **tự động chuyển tiếp đa LLM trong suốt** (transparent multi-LLM fallback). Điều hướng yêu cầu qua chuỗi backend và tự động thử lại khi gặp lỗi có thể retry.

Xây dựng với [Bun](https://bun.sh) + [Elysia](https://elysiajs.com).

## Backend hỗ trợ

| Provider | API | Ghi chú |
|----------|-----|---------|
| `ollama` | OpenAI-compatible (`/v1/chat/completions`) | Chạy local |
| `privategpt` | PrivateGPT API (`/api/chat/v1/conversations`) | SSE events → OpenAI format |

## Bắt đầu nhanh

### Yêu cầu

- [Bun](https://bun.sh) ≥ 1.2

### Chạy

```bash
bun install
cp models.example.json models.json
# Sửa models.json theo nhu cầu
bun run dev      # dev mode, auto-reload
bun run start    # production
```

Máy chủ chạy tại `http://0.0.0.0:3000`.

### Web UI

Server đi kèm giao diện web React SPA (tự động serve tại `http://localhost:3000`).

```bash
# Build web UI (chạy 1 lần, tự động nếu dùng bun run start)
bun run build:web

# Dev web UI (Vite dev server + HMR, cổng 5173)
bun run dev:web
```

Web UI gồm 4 trang:
- **Dashboard** — Thống kê server, trạng thái backend, nhật ký
- **Chat** — Playground chat, chọn model, stream/non-stream
- **Models** — Danh sách router models + fallback chain
- **Settings** — Cấu hình server, chuyển ngôn ngữ (EN/VN)

## Cấu hình

Toàn bộ cấu hình nằm trong `models.json`. **Không có hardcode URL trong source** — mọi backend phải khai báo `baseURL`. Nếu thiếu, server sẽ refuse khởi động.

```bash
cp models.example.json models.json
```

```json
{
  "backends": {
    "ollama-llama3": {
      "provider": "ollama",
      "model": "llama3.2",
      "apiKey": "",
      "baseURL": "http://localhost:11434/v1"
    },
    "privategpt-4o": {
      "provider": "privategpt",
      "model": "azure-gpt-4o",
      "apiKey": "${PRIVATEGPT_API_KEY}",
      "baseURL": "https://privategpt.co"
    }
  },
  "router_models": {
    "local-llama": {
      "name": "Local Llama",
      "fallbacks": ["ollama-llama3"],
      "limit": { "context": 8192, "output": 2048 }
    }
  }
}
```

- `${ENV_VAR}` tự động phân giải từ biến môi trường khi khởi động.
- `models.json` và `opencode.json` đã trong `.gitignore` — dùng file `*.example.json` làm template.
- Backend thiếu `baseURL` sẽ bị từ chối ngay khi start.

## API endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/v1/models` | Danh sách router models |
| `POST` | `/v1/chat/completions` | Chat completion (stream + non-stream) |
| `GET` | `/health` | Kiểm tra trạng thái |
| `GET` | `/api/status` | Thống kê server + trạng thái backend |
| `GET` | `/api/models/detail` | Chi tiết router models + backends |
| `GET` | `/api/config` | Cấu hình server (đã sanitize) |
| `GET` | `/api/logs` | 200 dòng log gần nhất |

Phản hồi `POST /v1/chat/completions` kèm header `X-Fallback` (vd `ollama-llama3` hoặc `ollama-llama3→privategpt-4o`).

### Quy tắc fallback

| Điều kiện | Fallback? |
|-----------|-----------|
| 429 Rate Limit / insufficient_quota | Có |
| context_length_exceeded / token_limit_reached | Có |
| 500 Server Error | Không |
| 400 Bad Request | Không |
| Tool results trong messages | Không |

## Sử dụng với OpenCode

```bash
opencode --model local-llama
```

Xem `opencode.example.json` → copy sang `opencode.json` và sửa theo nhu cầu.

## Cấu trúc thư mục

```
src/
├── index.ts                   # Entry point
├── config/
│   ├── loader.ts              # Đọc models.json, phân giải ${ENV_VAR}, validate
│   └── types.ts               # BackendConfig, RouterModelConfig
├── routes/
│   ├── chat.ts                # POST /v1/chat/completions
│   ├── models.ts              # GET /v1/models
│   └── admin.ts               # Web UI API (status, models/detail, config, logs)
├── services/
│   ├── fallback.ts            # Fallback chain logic
│   └── backends/
│       ├── types.ts           # BackendAdapter interface
│       ├── registry.ts        # Provider → adapter mapping
│       ├── ollama.ts          # Ollama adapter
│       └── privategpt.ts      # PrivateGPT adapter
├── middleware/
│   └── auth.ts                # Bearer token validation (optional)
├── types/
│   └── openai.ts              # OpenAI-compatible types
├── utils/
│   ├── errors.ts              # BackendError, error helpers
│   ├── sse.ts                 # SSE encode + chunk builders
│   └── stream.ts              # Stream line reader
├── web/                       # React SPA frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.cjs
│   ├── tsconfig.json
│   ├── dist/                  # Built assets (generated)
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── i18n.ts
│       ├── types.ts
│       ├── locales/
│       │   ├── en.json
│       │   └── vi.json
│       └── components/
│           ├── Sidebar.tsx
│           ├── Dashboard.tsx
│           ├── Chat.tsx
│           ├── Models.tsx
│           ├── Settings.tsx
│           └── ui/
│               ├── Button.tsx
│               ├── Card.tsx
│               ├── Spinner.tsx
│               ├── StatusBadge.tsx
│               └── StatusDot.tsx
```

## Thêm backend provider mới

1. Tạo file `src/services/backends/<tên>.ts`.
2. Implement `BackendAdapter` interface.
3. Đăng ký adapter trong `services/backends/registry.ts`.
4. Thêm cấu hình backend trong `models.json` (bắt buộc có `baseURL`).

Tất cả adapter ném `BackendError(status, code?, message?)` khi gặp lỗi upstream.

## Giấy phép

MIT
