# Đóng góp

## Thiết lập môi trường

```bash
bun install
bun run dev      # dev server, auto-reload
```

## Kiểm tra TypeScript

```bash
bunx --bun tsc --noEmit
```

Cần flag `--bun` để dùng bản `tsc` đã cài trong project (không phải global).

## Cấu trúc thư mục

```
src/
├── index.ts                   # Entry point, Elysia app setup
├── config/
│   ├── loader.ts              # Đọc models.json, phân giải ${ENV_VAR}, validate cấu hình
│   └── types.ts               # BackendConfig, RouterModelConfig
├── routes/
│   ├── chat.ts                # POST /v1/chat/completions
│   └── models.ts              # GET /v1/models
├── services/
│   ├── fallback.ts            # Fallback chain logic
│   └── backends/
│       ├── types.ts           # BackendAdapter interface (contract cho mọi adapter)
│       ├── registry.ts        # Provider string → adapter mapping
│       ├── ollama.ts          # Ollama adapter
│       └── privategpt.ts      # PrivateGPT adapter
├── middleware/
│   └── auth.ts                # Bearer token validation (optional)
├── types/
│   └── openai.ts              # Tất cả OpenAI-compatible types
└── utils/
    ├── errors.ts              # BackendError, isRetryableError, parseErrorResponse
    ├── sse.ts                 # SSE encode + chunk builders
    └── stream.ts              # readLines async generator
```

## Thêm backend provider mới

1. Tạo file `src/services/backends/<tên>.ts`.
2. Implement `BackendAdapter` interface từ `./types.ts`:

```typescript
import type { BackendAdapter } from "./types"
import type { BackendConfig } from "../../config/types"
import type { Message, ChatRequest } from "../../types/openai"
import { BackendError, parseErrorResponse } from "../../utils/errors"

export function createMyAdapter(): BackendAdapter {
  return {
    async chat(backend, messages, params) {
      // Gọi API upstream
      // Trả về JSON cho non-streaming, ReadableStream cho streaming
      // Ném BackendError khi gặp lỗi
    },
  }
}
```

3. Đăng ký adapter trong `services/backends/registry.ts`:

```typescript
import { createMyAdapter } from "./my-adapter"

const adapters: Record<string, BackendAdapter> = {
  "my-provider": createMyAdapter(),
}
```

4. Thêm cấu hình backend trong `models.json` (bắt buộc có `baseURL`):

```json
{
  "backends": {
    "my-backend": {
      "provider": "my-provider",
      "model": "my-model",
      "apiKey": "${MY_API_KEY}",
      "baseURL": "https://api.my-service.com/v1"
    }
  }
}
```

## Quy ước code

- Không viết comment trong code production.
- `BackendError` là kiểu lỗi tùy chỉnh duy nhất. Dùng cho mọi lỗi upstream.
- Adapter trả về object JSON cho non-streaming, `ReadableStream` cho streaming.
- `GET /v1/models` chỉ hiển thị router models — không leak tên backend models.
- `models.json` là nguồn sự thật duy nhất — không hardcode URL/apiKey trong source.
- Backend thiếu `baseURL` sẽ bị `validateConfig()` từ chối ngay khi start.

## Các phase phát triển

Xem `PROGRESS.md` cho trạng thái hiện tại.

| Phase | Phạm vi |
|-------|---------|
| 1 — Core | Chat, models, fallback chain ✅ |
| 2 — Embeddings | POST /v1/embeddings |
| 3 — Image & Audio | Image generation, speech / audio |
| 4 — Hardening | Graceful shutdown, logging, health, rate limiting |

## Hướng dẫn Pull Request

- Giữ thay đổi tập trung vào một tác vụ logic duy nhất.
- Chạy `bunx --bun tsc --noEmit` trước khi gửi.
- Cập nhật `models.example.json` nếu thêm backend hoặc router model mới.
- Cập nhật `PROGRESS.md` khi hoàn thành một bước trong phase.
