# Welcome to Remix!

- 📖 [Remix docs](https://remix.run/docs)

## Development

Run the dev server:

```shellscript
npm run dev
```

### Environment variables

For the GitLab publish API (`/api/publish-gitlab`), set:

- `GITLAB_URL`
- `GITLAB_TOKEN`
- `WECOM_WEBHOOK` (optional, used for WeCom bot notifications)

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

### DIY

If you're familiar with deploying Node applications, the built-in Remix app server is production-ready.

Make sure to deploy the output of `npm run build`

- `build/server`
- `build/client`

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever css framework you prefer. See the [Vite docs on css](https://vitejs.dev/guide/features.html#css) for more information.


---

## MCP (Model Context Protocol) API

### MCP Endpoints (for Codex / MCP clients)

- **Streamable HTTP (recommended)**: `/mcp`
  - Compatibility: `POST /mcp/sse` also supported (so existing Codex configs keep working)
- **Legacy SSE (2-endpoint)**: `GET /mcp/sse` (no `mcp-session-id` header) + `POST /mcp/messages`

### MCP Tools

- `list_incomplete_keys`: 列出指定 `app_name` 下缺失/空翻译的 key（可用 `languages/include_missing/include_blank` 细化）

### Add Translation Key

This API endpoint allows you to programmatically add a new translation key with its values across multiple languages for a specific application.

- **URL**: `/mcp/add-key`
- **Method**: `POST`
- **Content-Type**: `application/json`

#### Request Body

```json
{
  "appName": "your_app_name",
  "key": "your_new_key",
  "translations": {
    "zh-CN": "你好世界",
    "en-US": "Hello World",
    "ja-JP": "こんにちは世界"
  }
}
```

#### Responses

- **200 OK (Success)**
  ```json
  {
    "success": true,
    "message": "Translations added successfully."
  }
  ```

- **400 Bad Request (Invalid Input)**
  ```json
  {
    "error": "appName cannot be empty"
  }
  ```

- **409 Conflict (Key Already Exists)**
  ```json
  {
    "error": "Some translations could not be added due to existing keys.",
    "errors": {
      "zh-CN": "相同 app_name 下已有同 language_script_code 的同名 key"
    }
  }
  ```

- **500 Internal Server Error**
  ```json
  {
    "error": "An internal server error occurred.",
    "details": "..."
  }
  ```
