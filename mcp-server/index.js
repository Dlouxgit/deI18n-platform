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

  // 7. list_incomplete_keys — GET /i18n-json + /i18n-id-json
  server.tool(
    'list_incomplete_keys',
    '列出某个 app 下存在缺失/空翻译的 key（常用于只录入中文、其他语言待补齐的场景）',
    {
      app_name: z.string().describe('应用名称'),
      languages: z
        .array(z.string())
        .optional()
        .describe('要检查的语言列表（默认：该 app 返回的全部语言）'),
      include_missing: z
        .boolean()
        .optional()
        .default(true)
        .describe('是否把“缺少该语言记录”的 key 视为不完整，默认 true'),
      include_blank: z
        .boolean()
        .optional()
        .default(true)
        .describe('是否把“值为空字符串/仅空白”的 key 视为不完整，默认 true'),
      key: z
        .string()
        .optional()
        .describe('筛选 key（支持逗号分隔多个）'),
      key_contains: z
        .string()
        .optional()
        .describe('只返回 key 包含该子串的记录'),
      key_prefix: z
        .string()
        .optional()
        .describe('只返回 key 以该前缀开头的记录'),
      offset: z.number().int().nonnegative().optional().default(0).describe('分页 offset，默认 0'),
      limit: z.number().int().positive().max(2000).optional().default(200).describe('分页 limit，默认 200（最大 2000）'),
      include_translations: z
        .boolean()
        .optional()
        .default(false)
        .describe('是否在结果里附带各语言的翻译值（数据量较大），默认 false'),
      include_ids: z.boolean().optional().default(false).describe('是否返回每个语言的翻译 ID（需要额外请求），默认 false'),
    },
    async ({
      app_name,
      languages,
      include_missing,
      include_blank,
      key,
      key_contains,
      key_prefix,
      offset,
      limit,
      include_translations,
      include_ids,
    }) => {
      if (!include_missing && !include_blank) {
        return { content: [{ type: 'text', text: JSON.stringify({ app_name, items: [], total: 0, has_more: false }, null, 2) }] };
      }

      const wantTranslations = include_translations || include_ids;
      const values = await apiGet(`/i18n-json?app_name=${encodeURIComponent(app_name)}`);
      const availableLanguages = Object.keys(values).sort();
      if (availableLanguages.length === 0) {
        const result = {
          app_name,
          languages: [],
          offset,
          limit,
          total: 0,
          has_more: false,
          counts_by_language: {},
          items: [],
          warning: 'No languages returned for this app_name (app may not exist or has no translations).',
        };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      const requestedLanguages = (languages?.length ? languages : availableLanguages).slice();
      const unknownLanguages = requestedLanguages.filter((l) => !availableLanguages.includes(l));
      const languagesToCheck = requestedLanguages.filter((l) => availableLanguages.includes(l));
      if (languagesToCheck.length === 0) {
        const result = {
          app_name,
          languages: [],
          unknown_languages: unknownLanguages,
          available_languages: availableLanguages,
          offset,
          limit,
          total: 0,
          has_more: false,
          counts_by_language: {},
          items: [],
          warning: 'No valid languages to check. Please omit `languages` or pass languages within `available_languages`.',
        };
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }

      const ids = include_ids
        ? await apiGet(`/i18n-id-json?app_name=${encodeURIComponent(app_name)}`)
        : null;

      const merged = {};
      for (const lang of languagesToCheck) {
        const kvs = values[lang] || {};
        for (const [k, v] of Object.entries(kvs)) {
          if (!merged[k]) merged[k] = {};
          merged[k][lang] = {
            id: ids?.[k]?.[lang] ?? null,
            value: v,
          };
        }
      }

      let keysToScan = Object.keys(merged);

      if (key) {
        const filterKeys = new Set(key.split(',').map((k) => k.trim()).filter(Boolean));
        keysToScan = keysToScan.filter((k) => filterKeys.has(k));
      }
      if (key_contains) keysToScan = keysToScan.filter((k) => k.includes(key_contains));
      if (key_prefix) keysToScan = keysToScan.filter((k) => k.startsWith(key_prefix));

      keysToScan.sort();

      const counts = Object.fromEntries(
        languagesToCheck.map((lang) => [lang, { missing: 0, blank: 0 }])
      );

      const items = [];
      let total = 0;
      for (const k of keysToScan) {
        const missing = [];
        const blank = [];

        for (const lang of languagesToCheck) {
          const entry = merged[k]?.[lang];
          const value = entry?.value;
          if (value === undefined) {
            missing.push(lang);
          } else if (include_blank) {
            const isBlankString = typeof value === 'string' && value.trim().length === 0;
            if (value === null || isBlankString) blank.push(lang);
          }
        }

        const isIncomplete =
          (include_missing && missing.length > 0) || (include_blank && blank.length > 0);

        if (!isIncomplete) continue;

        total += 1;

        if (include_missing) {
          for (const lang of missing) counts[lang].missing += 1;
        }
        if (include_blank) {
          for (const lang of blank) counts[lang].blank += 1;
        }

        const index = total - 1;
        if (index < offset || items.length >= limit) continue;

        const item = {
          key: k,
          missing_languages: include_missing ? missing : [],
          blank_languages: include_blank ? blank : [],
        };

        if (wantTranslations) {
          item.translations = Object.fromEntries(
            languagesToCheck.map((lang) => {
              const entry = merged[k]?.[lang];
              const value = entry?.value ?? null;
              const out = include_ids ? { id: entry?.id ?? null, value } : { value };
              return [lang, out];
            })
          );
        }

        items.push(item);
      }

      const result = {
        app_name,
        languages: languagesToCheck,
        unknown_languages: unknownLanguages,
        offset,
        limit,
        total,
        has_more: offset + limit < total,
        counts_by_language: counts,
        items,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  // 8. ai_translate — POST /api/translate
  server.tool(
    'ai_translate',
    'AI 翻译：将中文文本翻译为指定目标语言',
    {
      text: z.string().describe('要翻译的中文文本'),
      target_languages: z
        .array(z.string())
        .optional()
        .default(['en-US', 'zh-TW', 'ja-JP', 'vi-VN'])
        .describe('目标语言代码列表，默认全部 4 种'),
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

  // 9. ai_batch_translate — POST /api/batch-translate
  server.tool(
    'ai_batch_translate',
    '批量 AI 翻译：将多条中文文本在一次 AI 请求中翻译为指定目标语言（最多 50 条）',
    {
      items: z
        .array(
          z.object({
            key: z.string().describe('翻译 key，用于标识每条结果'),
            text: z.string().describe('要翻译的中文文本'),
          })
        )
        .min(1)
        .max(50)
        .describe('待翻译条目列表，每条包含 key 和 text'),
      target_languages: z
        .array(z.string())
        .optional()
        .default(['en-US', 'zh-TW', 'ja-JP', 'vi-VN'])
        .describe('目标语言代码列表，默认全部 4 种'),
    },
    async ({ items, target_languages }) => {
      const data = await apiPostJson('/api/batch-translate', {
        items,
        targetLanguages: target_languages,
      });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  return server;
}

export { createServer };
