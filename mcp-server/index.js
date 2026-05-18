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

  // 1. list_apps
  server.tool(
    'list_apps',
    '列出平台上所有已注册的 app（应用）及其翻译条目数量统计。用于了解有哪些 app 可操作、各 app 的翻译覆盖情况。提示：当用户没有明确给出 app_name（增删改查都需要）时，先调用本工具让用户选择。',
    {},
    async () => {
      const data = await apiGet('/api/stats');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 2. list_translations
  server.tool(
    'list_translations',
    '查询指定 app 的翻译条目，返回按 key 分组的所有语言翻译值及数据库记录 ID。注意：不传 key 参数时会返回该 app 的全量翻译，数据量大概率超过 2000 条，建议通过 key 参数筛选特定条目以减少返回量。返回格式: { “some.key”: { “en-US”: { id: 123, value: “Hello” }, “zh-CN”: { id: 124, value: “你好” } } }。常用于：查看某个 key 的当前翻译内容、获取记录 ID 以便后续调用 update_translation 更新。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      key: z.string().optional().describe('按 key 筛选，支持逗号分隔多个，如 “song.title,album.name”。不传则返回该 app 全部条目'),
    },
    async ({ app_name, key }) => {
      const [values, ids] = await Promise.all([
        apiGet(`/i18n-json?app_name=${encodeURIComponent(app_name)}`),
        apiGet(`/i18n-id-json?app_name=${encodeURIComponent(app_name)}`),
      ]);

      const merged = {};
      for (const [lang, kvs] of Object.entries(values)) {
        for (const [k, v] of Object.entries(kvs)) {
          if (!merged[k]) merged[k] = {};
          merged[k][lang] = { id: ids[k]?.[lang] ?? null, value: v };
        }
      }

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

  // 3. get_translation_json
  server.tool(
    'get_translation_json',
    '导出指定 app 的全部翻译为 JSON，按语言分组。返回格式: { “en-US”: { “key1”: “value1”, ... }, “zh-CN”: { ... } }。expand=true 时会将点分隔的 key（如 “a.b.c”）展开为嵌套对象 { a: { b: { c: “value” } } }，适合直接用于前端 i18n 文件。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      expand: z.boolean().optional().default(false).describe('是否将点分隔的 key 展开为嵌套 JSON 对象，默认 false（保持扁平 key）'),
    },
    async ({ app_name, expand }) => {
      const data = await apiGet(
        `/i18n-json?app_name=${encodeURIComponent(app_name)}&expand=${expand ? '1' : '0'}`
      );
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 4. add_translation
  server.tool(
    'add_translation',
    '批量新增或覆写翻译条目，支持一次写入多个 key 的多语言翻译。每个 key 可包含任意语言的翻译值。overwrite=false（默认）时，如果 key 已存在则跳过不写入；overwrite=true 时，已存在的 key 会被新值覆盖（相当于编辑/更新）。适用场景：批量导入翻译、AI 翻译后批量写入、补齐缺失语言的翻译。写入翻译值时，必须严格保留所有占位符、变量名和模板参数，不得翻译、改名、删改或调整顺序。适用于 {currency}、{name}、{count}、{{value}}、${amount}、%s、%d、:id、<0>...</0> 等形式。例如 {currency} 必须始终保持为 {currency}，不能写成 {валюта}。注意：如果用户未明确指出要操作的 app_name，请先询问用户（不要猜测），或先调用 list_apps 展示可选 app。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      keys: z
        .array(
          z.object({
            key: z.string().describe('翻译 key，如 “song.title”'),
          }).catchall(z.string())
        )
        .min(1)
        .describe('翻译条目数组，每项包含 key 及各语言翻译值。格式: [{ “key”: “song.title”, “en-US”: “Song Title”, “zh-CN”: “歌曲名称”, “ja-JP”: “曲名” }]。所有翻译值中的占位符、变量名和模板参数必须严格原样保留，例如 {currency}、{{value}}、${amount}、%s、:id、<0>...</0> 等都不得翻译或改写。'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe('是否覆写已存在的同 key 记录。false（默认）= 仅新增不存在的 key，已有的跳过；true = 已存在的 key 用新值覆盖，相当于批量更新'),
    },
    async ({ app_name, keys, overwrite }) => {
      const body = { app_name, overwrite, keys };
      const data = await apiPostJson('/api/batch-add', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 5. update_translation
  server.tool(
    'update_translation',
    '更新单条翻译记录的值。需要提供记录 ID（通过 list_translations 获取）。每次只能更新一个 key 的一种语言。如需批量更新，请使用 add_translation 并设置 overwrite=true。更新翻译时必须严格保留原文中的全部占位符、变量名和模板语法，禁止翻译、改写、重命名、删改或调整顺序；例如 {currency} 必须保持为 {currency}，不能写成 {валюта}。注意：如果用户未明确指出要操作的 app_name，请先询问用户（不要猜测），或先调用 list_apps 展示可选 app。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      key: z.string().describe('翻译 key，如 “song.title”'),
      language: z.string().describe('要更新的语言代码，如 “en-US”、”zh-CN”、”zh-TW”、”ja-JP”、”vi-VN”、”ru-RU”'),
      id: z.number().describe('翻译记录的数据库 ID，需先通过 list_translations 查询获取'),
      value: z.string().describe('新的翻译值。必须严格保留原文中的占位符、变量名和模板参数，例如 {currency}、{{value}}、${amount}、%s、:id、<0>...</0> 等都不得翻译或改写。'),
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

  // 6. delete_translation_key
  server.tool(
    'delete_translation_key',
    '删除指定 key 的所有语言翻译记录。此操作不可撤销，会同时删除该 key 下的 en-US、zh-CN、zh-TW、ja-JP、vi-VN、ru-RU 等全部语言条目。注意：如果用户未明确指出要操作的 app_name，请先询问用户（不要猜测），或先调用 list_apps 展示可选 app。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      key: z.string().describe('要删除的翻译 key，如 “song.title”。该 key 下所有语言的记录都会被删除'),
    },
    async ({ app_name, key }) => {
      const fields = { _action: 'delete', column_name: key, app_name };
      const data = await apiPost('/?_data=routes%2F_index', fields);
      return { content: [{ type: 'text', text: JSON.stringify({ ...data, key, app_name }, null, 2) }] };
    }
  );

  // 7. list_incomplete_keys
  server.tool(
    'list_incomplete_keys',
    '查找指定 app 中翻译不完整的 key：包括缺少某些语言的记录（missing）或翻译值为空（blank）的情况。典型场景：只录入了中文，需要找出哪些 key 还缺少英文、日文等其他语言的翻译，以便补齐。返回每个不完整 key 的缺失语言列表，并按语言统计缺失/空白数量。',
    {
      app_name: z.string().describe('应用名称，如 “kanjian-music”'),
      languages: z
        .array(z.string())
        .optional()
        .describe('要检查的语言列表，如 [“en-US”,”ja-JP”]。不传则检查该 app 的全部语言'),
      include_missing: z
        .boolean()
        .optional()
        .default(true)
        .describe('是否将”完全缺少该语言记录”的 key 视为不完整，默认 true'),
      include_blank: z
        .boolean()
        .optional()
        .default(true)
        .describe('是否将”翻译值为空字符串或仅空白”的 key 视为不完整，默认 true'),
      key: z
        .string()
        .optional()
        .describe('按 key 精确筛选，支持逗号分隔多个'),
      key_contains: z
        .string()
        .optional()
        .describe('模糊筛选：只返回 key 中包含该子串的记录'),
      key_prefix: z
        .string()
        .optional()
        .describe('前缀筛选：只返回 key 以该前缀开头的记录，如 “album.” 会匹配 “album.title”、”album.artist” 等'),
      offset: z.number().int().nonnegative().optional().default(0).describe('分页偏移量，默认 0'),
      limit: z.number().int().positive().max(2000).optional().default(200).describe('每页返回数量，默认 200，最大 2000'),
      include_translations: z
        .boolean()
        .optional()
        .default(false)
        .describe('是否在结果中附带各语言的当前翻译值（数据量较大），默认 false'),
      include_ids: z.boolean().optional().default(false).describe('是否在结果中附带各语言的数据库记录 ID（用于后续 update_translation），默认 false'),
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

  // 8. ai_translate
  server.tool(
    'ai_translate',
    'AI 翻译（单条）：将一条中文文本翻译为指定目标语言，使用音乐行业术语。仅翻译不写入数据库，需要写入请配合 add_translation 使用。如有多条文本需要翻译，请使用 ai_batch_translate。',
    {
      text: z.string().describe('要翻译的中文文本'),
      target_languages: z
        .array(z.string())
        .optional()
        .default(['en-US', 'zh-TW', 'ja-JP', 'vi-VN', 'ru-RU'])
        .describe('目标语言代码列表，可选: en-US, zh-TW, ja-JP, vi-VN, ru-RU。默认全部 5 种'),
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

  // 9. ai_batch_translate
  server.tool(
    'ai_batch_translate',
    'AI 批量翻译：将多条中文文本在一次 AI 请求中翻译为指定目标语言（最多 50 条），使用音乐行业术语。比逐条调用 ai_translate 更高效。仅翻译不写入数据库，翻译完成后可将结果直接传给 add_translation（支持批量多 key）一次性写入。',
    {
      items: z
        .array(
          z.object({
            key: z.string().describe('翻译 key，用于在返回结果中标识对应的翻译，如 “song.title”'),
            text: z.string().describe('要翻译的中文文本'),
          })
        )
        .min(1)
        .max(50)
        .describe('待翻译条目数组。示例: [{ “key”: “song.title”, “text”: “歌曲名称” }, { “key”: “album.name”, “text”: “专辑名称” }]'),
      target_languages: z
        .array(z.string())
        .optional()
        .default(['en-US', 'zh-TW', 'ja-JP', 'vi-VN', 'ru-RU'])
        .describe('目标语言代码列表，可选: en-US, zh-TW, ja-JP, vi-VN, ru-RU。默认全部 5 种'),
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
