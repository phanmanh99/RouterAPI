# OpenCode Provider Server

Máy chủ proxy tương thích OpenAI API với cơ chế **tự động chuyển tiếp đa LLM** (transparent multi-LLM fallback). Khi một backend LLM gặp lỗi (rate limit, hết quota, vượt context), server tự động chuyển yêu cầu sang backend tiếp theo trong chuỗi — client không cần xử lý gì.

Xây dựng với [Bun](https://bun.sh) + [Elysia](https://elysiajs.com). Đi kèm giao diện web React SPA (Dashboard, Chat, Models, Settings).

---

## Mục lục

- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Kiến trúc](#kiến-trúc)
- [Cấu hình](#cấu-hình)
- [API endpoints](#api-endpoints)
- [Web UI](#web-ui)
- [Sử dụng với OpenCode](#sử-dụng-với-opencode)
- [Phát triển](#phát-triển)
- [Thêm backend mới](#thêm-backend-mới)
- [Tài liệu liên quan](#tài-liệu-liên-quan)

---

## Bắt đầu nhanh

### Yêu cầu

- [Bun](https://bun.sh) ≥ 1.2

### 1. Cài đặt

```bash
git clone <repo>
cd opencode-provider-server
bun install
```

### 2. Tạo cấu hình

```bash
cp models.example.json models.json
```

Sửa file `models.json` với API key và URL phù hợp (xem [Cấu hình](#cấu-hình)).

### 3. Build web UI (lần đầu)

```bash
bun run build:web
```

### 4. Chạy

```bash
bun run dev      # Dev mode, auto-reload khi sửa code
# hoặc
bun run start    # Production
```

Mở trình duyệt tại **http://localhost:3000** — giao diện web sẽ hiện ra.

### Kiểm tra nhanh

```bash
curl http://localhost:3000/v1/models

curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"local-llama","messages":[{"role":"user","content":"Hello!"}]}'
```

### Các lệnh có sẵn

| Lệnh | Mô tả |
|------|-------|
| `bun run dev` | Dev server với file watching |
| `bun run start` | Production start |
| `bun run build:web` | Build frontend (chạy sau khi sửa web UI) |
| `bun run dev:web` | Vite dev server cho web UI (HMR, cổng 5173) |
| `bunx --bun tsc --noEmit` | Kiểm tra TypeScript |

---

## Kiến trúc

### Backend vs Router Model

Hệ thống có **2 lớp**:

```
Client (gọi "local-llama")
  │
  ▼
Router Model "local-llama"
  │ fallbacks: ["ollama-llama3"]  ← thử backend này trước
  │
  ▼
Backend "ollama-llama3"
  │ provider: ollama, baseURL: http://localhost:11434/v1
  │
  ▼
Ollama (LLM thật)
```

- **Backend**: Kết nối thật tới một LLM provider (Ollama, PrivateGPT, ...). Mỗi backend có `provider`, `model`, `apiKey`, `baseURL`.
- **Router Model**: Abstraction layer cho client. Mỗi router model trỏ tới một **chuỗi fallback** các backend. Client chỉ cần gọi tên router model, server tự động chọn backend phù hợp.

### Fallback chain

Khi backend đầu tiên trong chuỗi trả về lỗi có thể retry, server tự động chuyển sang backend tiếp theo:

```
Gọi "local-llama" → ollama-llama3 (lỗi 429) → privategpt-4o (thành công)
```

Phản hồi kèm header `X-Fallback: ollama-llama3→privategpt-4o` để client biết đường đi thực tế.

**Lỗi có fallback:**
- `429 Rate Limit`
- `insufficient_quota`
- `context_length_exceeded`
- `token_limit_reached`

**Lỗi không fallback:**
- `400 Bad Request`
- `500 Server Error`
- Khi messages đã chứa tool results

---

## Cấu hình

Toàn bộ cấu hình nằm trong file `models.json`. File này đã được thêm vào `.gitignore` — dùng `models.example.json` làm template.

```bash
cp models.example.json models.json
```

### Cấu trúc

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
      "name": "Local Llama (Ollama)",
      "fallbacks": ["ollama-llama3"],
      "limit": { "context": 8192, "output": 2048 }
    },
    "my-privategpt": {
      "name": "PrivateGPT",
      "fallbacks": ["privategpt-4o"],
      "limit": { "context": 128000, "output": 4096 }
    }
  },
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "apiKey": "",
    "logging": {
      "level": "debug",
      "file": "server.log"
    }
  }
}
```

### Backend

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| `provider` | ✅ | Loại adapter: `ollama` hoặc `privategpt` |
| `model` | ✅ | Tên model gửi lên upstream |
| `apiKey` | ✅ | Có thể để trống. Hỗ trợ `${ENV_VAR}` |
| `baseURL` | ✅ | URL đầy đủ. **Không có giá trị mặc định** |

### Router Model

| Trường | Bắt buộc | Mô tả |
|--------|----------|-------|
| `name` | ✅ | Tên hiển thị |
| `fallbacks` | ✅ | Mảng tên backend, thử lần lượt |
| `limit.context` | ✗ | Giới hạn context tokens |
| `limit.output` | ✗ | Giới hạn output tokens |
| `tool_call` | ✗ | Hỗ trợ tool calling |
| `reasoning` | ✗ | Hỗ trợ reasoning |

### Server

| Trường | Mô tả |
|--------|-------|
| `port` | Cổng (mặc định 3000) |
| `host` | Host (mặc định 0.0.0.0) |
| `apiKey` | API key xác thực client. Để trống để tắt auth |
| `logging.level` | `debug`, `info`, `warn`, `error` |
| `logging.file` | File log. Bỏ qua để chỉ log ra console |

### Biến môi trường

Dùng cú pháp `${TÊN_BIẾN}` trong `apiKey` hoặc `baseURL`. Server tự động resolve khi khởi động:

```json
{
  "apiKey": "${OPENAI_API_KEY}",
  "baseURL": "${CUSTOM_ENDPOINT}"
}
```

---

## API endpoints

### OpenAI-compatible

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/v1/models` | Danh sách router models |
| `POST` | `/v1/chat/completions` | Chat completion (stream + non-stream) |
| `GET` | `/health` | Health check |

### Management API (dùng cho Web UI)

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/api/status` | Thống kê server + trạng thái từng backend |
| `GET` | `/api/models/detail` | Chi tiết router models + backends (kèm reachable) |
| `GET` | `/api/config` | Cấu hình server (đã sanitize, không lộ apiKey) |
| `GET` | `/api/logs` | 200 dòng log gần nhất |
| `POST` | `/api/backends/:name/test` | Kiểm tra kết nối tới 1 backend |
| `PUT` | `/api/backends/:name` | Cập nhật backend config |
| `DELETE` | `/api/backends/:name` | Xoá backend |
| `POST` | `/api/backends` | Tạo backend mới |
| `PUT` | `/api/router-models/:id` | Cập nhật router model |
| `DELETE` | `/api/router-models/:id` | Xoá router model |
| `POST` | `/api/router-models` | Tạo router model mới |
| `POST` | `/api/config/reload` | Reload models.json từ disk |

---

## Web UI

Server đi kèm giao diện web React SPA, serve tại `http://localhost:3000`.

### Build & chạy

```bash
# Build production bundle (chạy 1 lần)
bun run build:web

# Hoặc dev mode với HMR
bun run dev:web   # Mở http://localhost:5173 (proxy API sang backend)
```

### Các trang

| Trang | Mô tả |
|-------|-------|
| **Dashboard** | Thống kê server (số models, backends, uptime), trạng thái kết nối từng backend, tab nhật ký |
| **Chat** | Playground chat — chọn model, tuỳ chọn stream/non-stream, xem fallback chain, xem response realtime |
| **Models** | Danh sách router models + backends. **Thêm, sửa, xoá, copy** models và backends. Kiểm tra kết nối từng backend |
| **Settings** | Cấu hình server (port, host, auth, logging), chuyển ngôn ngữ (English / Tiếng Việt) |

### Công nghệ

- React 19 + Vite 7 + Tailwind CSS 3
- i18next (song ngữ EN/VN)
- lucide-react (icons)

---

## Sử dụng với OpenCode

Server này tương thích với [OpenCode](https://opencode.ai) qua giao thức OpenAI-compatible.

```bash
opencode --model local-llama
```

Cấu hình OpenCode (`opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "local-llama",
  "provider": {
    "my-server": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "My Server",
      "options": {
        "baseURL": "http://localhost:3000/v1",
        "apiKey": ""
      },
      "models": {
        "local-llama": {
          "name": "Local Llama (auto-fallback)",
          "limit": { "context": 8192, "output": 2048 }
        }
      }
    }
  }
}
```

Xem `opencode.example.json` → copy sang `opencode.json` và sửa theo nhu cầu.

---

## Phát triển

### Backend

```bash
bun install
bun run dev          # Dev với file watching
```

### Frontend (web UI)

```bash
cd src/web
bun install
bun run dev          # Vite HMR tại cổng 5173
```

Hoặc từ thư mục gốc:

```bash
bun run dev:web
```

### Kiểm tra TypeScript

```bash
# Backend
bunx --bun tsc --noEmit

# Frontend
cd src/web && bun run build   # Tsc + vite build
```

---

## Thêm backend mới

### Viết adapter

Tạo file `src/services/backends/<tên>.ts`:

```typescript
import type { BackendAdapter } from "./types"
import type { BackendConfig } from "../../config/types"
import type { Message, ChatRequest } from "../../types/openai"
import { BackendError, parseErrorResponse } from "../../utils/errors"

export function createMyAdapter(): BackendAdapter {
  return {
    async chat(backend: BackendConfig, messages: Message[], params: Partial<ChatRequest>) {
      // Gọi API upstream
      // Trả về JSON cho non-streaming, ReadableStream cho streaming
      // Ném BackendError khi gặp lỗi upstream
    },
  }
}
```

Xem `src/services/backends/ollama.ts` làm ví dụ.

### Đăng ký

Trong `src/services/backends/registry.ts`:

```typescript
import { createMyAdapter } from "./my-adapter"

const adapters: Record<string, BackendAdapter> = {
  "my-provider": createMyAdapter(),
}
```

### Thêm vào cấu hình

Trong `models.json`:

```json
{
  "backends": {
    "my-backend": {
      "provider": "my-provider",
      "model": "my-model",
      "apiKey": "${MY_API_KEY}",
      "baseURL": "https://api.my-service.com/v1"
    }
  },
  "router_models": {
    "my-model": {
      "name": "My Model",
      "fallbacks": ["my-backend"],
      "limit": { "context": 128000, "output": 4096 }
    }
  }
}
```

---

## Tài liệu liên quan

| Tài liệu | Mô tả |
|----------|-------|
| [`AGENTS.md`](./AGENTS.md) | Hướng dẫn cho AI coding agent (runtime, cấu trúc, conventions) |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Hướng dẫn đóng góp, thêm backend mới, quy ước code |
| [`PROGRESS.md`](./PROGRESS.md) | Trạng thái phát triển các phase |
| [`models.example.json`](./models.example.json) | Template cấu hình backend + router model |
| [`opencode.example.json`](./opencode.example.json) | Template cấu hình OpenCode |

### Công nghệ sử dụng

- [Bun](https://bun.sh) — Runtime JavaScript/TypeScript
- [Elysia](https://elysiajs.com) — Web framework
- [@elysiajs/static](https://github.com/elysiajs/static) — Static file serving
- [React](https://react.dev) + [Vite](https://vitejs.dev) + [Tailwind CSS](https://tailwindcss.com) — Frontend
- [i18next](https://www.i18next.com) — Internationalisation

---

## Giấy phép

MIT
