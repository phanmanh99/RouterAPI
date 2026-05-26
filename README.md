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

### 3. Cài đặt dependencies cho web UI

```bash
cd src/web && bun install
```

### 4. Build web UI (lần đầu)

```bash
bun run build:web
```

### 5. Chạy

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
      "apiKey": "",
      "baseURL": "https://privategpt.co",
      "refreshToken": "${PRIVATEGPT_REFRESH_TOKEN}",
      "oauthTenantId": "${AZURE_TENANT_ID}",
      "oauthClientId": "${AZURE_CLIENT_ID}",
      "oauthClientSecret": "${AZURE_CLIENT_SECRET}",
      "oauthScope": "${PRIVATEGPT_APP_CLIENT_ID}"
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
| `apiKey` | ✅ | Có thể để trống. Hỗ trợ `${ENV_VAR}`. Dùng OAuth để tự động lấy token |
| `baseURL` | ✅ | URL đầy đủ. **Không có giá trị mặc định** |
| `refreshToken` | ✗ | Refresh token cho OAuth (Plan 2). Hỗ trợ `${ENV_VAR}` |
| `oauthTenantId` | ✗ | Azure AD Tenant ID. Hỗ trợ `${ENV_VAR}` |
| `oauthClientId` | ✗ | Azure AD App Client ID. Hỗ trợ `${ENV_VAR}` |
| `oauthClientSecret` | ✗ | Azure AD Client Secret. Hỗ trợ `${ENV_VAR}` |
| `oauthScope` | ✗ | Scope cho OAuth (mặc định = `oauthClientId`). Hỗ trợ `${ENV_VAR}` |

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

### Logger

Server ghi log với 4 mức: `debug`, `info`, `warn`, `error`. Mặc định là `info`.

Khi bật `debug`, mỗi request chat sẽ log:
- **Input**: model, messages, stream flag
- **Output**: response choices (non-streaming) hoặc error

Cấu hình trong `server.logging`:

| Trường | Mô tả |
|--------|-------|
| `level` | Mức log: `debug`, `info`, `warn`, `error` |
| `file` | Đường dẫn file log. Bỏ trống để chỉ log ra console |

Ví dụ:
```json
{
  "server": {
    "logging": {
      "level": "debug",
      "file": "server.log"
    }
  }
}
```

File `*.log` đã được thêm vào `.gitignore`.

### Biến môi trường

Dùng cú pháp `${TÊN_BIẾN}` trong bất kỳ trường string nào (`apiKey`, `baseURL`, `refreshToken`, `oauthClientId`, ...). Server tự động resolve khi khởi động:

```json
{
  "apiKey": "${OPENAI_API_KEY}",
  "baseURL": "${CUSTOM_ENDPOINT}",
  "oauthTenantId": "${AZURE_TENANT_ID}",
  "oauthClientId": "${AZURE_CLIENT_ID}"
}
```

---

## Azure AD OAuth cho PrivateGPT

Khi PrivateGPT sử dụng Azure AD làm identity provider ("Continue with Azure AD"), server hỗ trợ 3 cơ chế OAuth để tự động lấy và duy trì access token.

### Các OAuth flow

| Plan | Flow | Automation | Mô tả |
|------|------|------------|-------|
| **Plan 1** | Client Credentials | ✅ Tự động | Server dùng chính identity của mình (`clientId` + `clientSecret`) để lấy token. Không cần user |
| **Plan 2** | Refresh Token | ✅ Tự động | Dùng `refreshToken` có sẵn để lấy token mới khi hết hạn |
| **Plan 3** | Authorization Code + PKCE | 🔵 Web UI (click "Auth") | User đăng nhập Microsoft qua trình duyệt, lấy token + refresh token |

### Cấu hình Azure Portal

1. **Tìm PrivateGPT App Registration** trong Azure AD → App registrations, ghi lại **Application (client) ID**
2. **Tạo App Registration** cho server (`routerapi-server`)
   - Ghi lại Client ID, tạo Client Secret
   - Thêm redirect URI: `http://localhost` (loại SPA/public client)
3. **API Permissions** → Add permission → My APIs → Chọn PrivateGPT app → `user_impersonation` → Grant admin consent
4. **Ghi lại các giá trị**:
   - `AZURE_TENANT_ID` — Directory (tenant) ID
   - `AZURE_CLIENT_ID` — Client ID của app server
   - `AZURE_CLIENT_SECRET` — Client Secret của app server
   - `PRIVATEGPT_APP_CLIENT_ID` — Client ID của PrivateGPT app

### Cấu hình models.json

```json
"privategpt-4o": {
  "provider": "privategpt",
  "model": "azure-gpt-4o",
  "apiKey": "",
  "baseURL": "https://api.my-service.com/",
  "refreshToken": "${PRIVATEGPT_REFRESH_TOKEN}",
  "oauthTenantId": "${AZURE_TENANT_ID}",
  "oauthClientId": "${AZURE_CLIENT_ID}",
  "oauthClientSecret": "${AZURE_CLIENT_SECRET}",
  "oauthScope": "${PRIVATEGPT_APP_CLIENT_ID}"
}
```

| Trường | Vai trò |
|--------|---------|
| `apiKey` | Để trống, server tự động điền từ OAuth |
| `refreshToken` | (Tùy chọn) Dùng cho Plan 2 nếu đã có refresh token |
| `oauthTenantId` | Tenant ID của Azure AD |
| `oauthClientId` | Client ID của app server đã đăng ký |
| `oauthClientSecret` | Client Secret của app server |
| `oauthScope` | Scope = Client ID của PrivateGPT app (để lấy token đúng audience) |

### Cách hoạt động

```
Server khởi động / request đầu tiên
  │
  ├─ apiKey trống?
  │   YES → Plan 1: Client Credentials
  │       ├─ Thành công → lưu access_token, gọi API
  │       └─ Thất bại → Plan 2: Refresh Token (nếu có)
  │           ├─ Thành công → lưu access_token, gọi API
  │           └─ Thất bại → cần Plan 3 qua Web UI
  │
  ├─ 401 từ PrivateGPT?
  │   ├─ Plan 1 → Plan 2 → retry
  │   └─ Thất bại → cần re-auth qua Web UI
  │
  └─ Web UI: Models → click "Auth" → login Microsoft → lưu token
```

### Xác thực qua Web UI

1. Vào trang **Models** → chọn backend PrivateGPT
2. Click nút **Auth** (chỉ hiện khi backend có cấu hình OAuth)
3. Trình duyệt chuyển hướng sang Microsoft login
4. Đăng nhập tài khoản có quyền truy cập PrivateGPT
5. Tự động quay lại Web UI → toast "✅ OAuth đã xác thực"
6. Server đã có `access_token` và `refresh_token`, sẵn sàng hoạt động

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
| `GET` | `/api/auth/start?backend=` | Bắt đầu OAuth Authorization Code flow, trả về authorize URL |
| `GET` | `/api/auth/callback` | Callback từ Microsoft sau khi login, exchange code lấy tokens |
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
| **Models** | Danh sách router models + backends. **Thêm, sửa, xoá, copy** models và backends. Kiểm tra kết nối từng backend. **Auth** — xác thực OAuth với Microsoft cho PrivateGPT backend |
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
