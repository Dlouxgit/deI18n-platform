import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// ── Config ───────────────────────────────────────────────────────────
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 7999}`;

// ── HTTP helpers ─────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${APP_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function apiPost(path, formFields) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(formFields)) {
    if (Array.isArray(v)) {
      v.forEach((item) => form.append(k, item));
    } else {
      form.append(k, v);
    }
  }
  const res = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    body: form,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `POST ${path} → ${res.status}`);
  }
  return res.json();
}

async function apiPostJson(path, body) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `POST ${path} → ${res.status}`);
  }
  return res.json();
}

// ── MCP Server Factory ───────────────────────────────────────────────
function createServer() {
  const server = new McpServer({
    name: 'i18n-translation-platform',
    version: '1.0.0',
  });

  // 1. list_apps — GET /api/stats
  server.tool(
    'list_apps',
    '列出所有 app 及翻译条目统计',
    {},
    async () => {
      const data = await apiGet('/api/stats');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 2. list_translations — GET /i18n-json + /i18n-id-json
  server.tool(
    'list_translations',
    '按 app/key 查询翻译条目（含 ID），返回按 key 分组的记录',
    {
      app_name: z.string().describe('应用名称'),
      key: z.string().optional().describe('筛选 key（支持逗号分隔多个）'),
    },
    async ({ app_name, key }) => {
      const [values, ids] = await Promise.all([
        apiGet(`/i18n-json?app_name=${encodeURIComponent(app_name)}`),
        apiGet(`/i18n-id-json?app_name=${encodeURIComponent(app_name)}`),
      ]);

      // 合并为 { key: { lang: { id, value } } }
      const merged = {};
      for (const [lang, kvs] of Object.entries(values)) {
        for (const [k, v] of Object.entries(kvs)) {
          if (!merged[k]) merged[k] = {};
          merged[k][lang] = { id: ids[k]?.[lang] ?? null, value: v };
        }
      }

      // 按 key 过滤
      let result = merged;
      if (key) {
        const filterKeys = new Set(key.split(',').map((k) => k.trim()));
        result = Object.fromEntries(
          Object.entries(merged).filter(([k]) => filterKeys.has(k))
        );
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 3. get_translation_json — GET /i18n-json
  server.tool(
    'get_translation_json',
    '导出某个 app 的翻译为 JSON（按语言分组），可选 expand 展开嵌套 key',
    {
      app_name: z.string().describe('应用名称'),
      expand: z.boolean().optional().default(false).describe('是否按 . 展开为嵌套对象'),
    },
    async ({ app_name, expand }) => {
      const data = await apiGet(
        `/i18n-json?app_name=${encodeURIComponent(app_name)}&expand=${expand ? '1' : '0'}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 4. add_translation — POST /add
  server.tool(
    'add_translation',
    '新增一个 key 的多语言翻译',
    {
      app_name: z.string().describe('应用名称'),
      key: z.string().describe('翻译 key（column_name）'),
      translations: z
        .record(z.string(), z.string())
        .describe('语言代码到翻译值的映射，如 {"en-US":"Hello","zh-CN":"你好"}'),
      overwrite: z.boolean().optional().default(false).describe('是否覆写已存在的同名记录，默认 false'),
    },
    async ({ app_name, key, translations, overwrite }) => {
      const body = {
        app_name,
        overwrite,
        keys: [{ key, ...translations }],
      };
      const data = await apiPostJson('/api/batch-add', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 5. update_translation — POST / (_action=update)
  server.tool(
    'update_translation',
    '修改翻译值。需提供 app_name、key、language 和 id（可通过 list_translations 获取 ID）',
    {
      app_name: z.string().describe('应用名称'),
      key: z.string().describe('翻译 key（column_name）'),
      language: z.string().describe('语言代码，如 en-US'),
      id: z.number().describe('翻译记录 ID'),
      value: z.string().describe('新的翻译值'),
    },
    async ({ app_name, key, language, id, value }) => {
      const fields = {
        _action: 'update',
        column_name: key,
        app_name,
        [`column_value_${language}&${id}`]: value,
      };
      const data = await apiPost('/?_data=routes%2F_index', fields);
      return { content: [{ type: 'text', text: JSON.stringify({ ...data, id, language, value }, null, 2) }] };
    }
  );

  // 6. delete_translation_key — POST / (_action=delete)
  server.tool(
    'delete_translation_key',
    '删除某个 key 的所有语言翻译',
    {
      app_name: z.string().describe('应用名称'),
      key: z.string().describe('要删除的翻译 key（column_name）'),
    },
    async ({ app_name, key }) => {
      const fields = { _action: 'delete', column_name: key, app_name };
      const data = await apiPost('/?_data=routes%2F_index', fields);
      return { content: [{ type: 'text', text: JSON.stringify({ ...data, key, app_name }, null, 2) }] };
    }
  );

  // 7. ai_translate — POST /api/translate
  server.tool(
    'ai_translate',
    'AI 翻译：将中文文本翻译为指定目标语言',
    {
      text: z.string().describe('要翻译的中文文本'),
      target_languages: z
        .array(z.string())
        .optional()
        .default(['en-US', 'zh-TW', 'ja-JP', 'vi-VN', 'ru-RU'])
        .describe('目标语言代码列表，默认全部 5 种'),
    },
    async ({ text, target_languages }) => {
      const fields = {
        chineseText: text,
        targetLanguages: target_languages,
      };
      const data = await apiPost('/api/translate', fields);
      return { content: [{ type: 'text', text: JSON.stringify(data.translations ?? data, null, 2) }] };
    }
  );

  return server;
}

export { createServer };
