import { json } from '@remix-run/node';
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

export async function action({ request }) {
  try {
    const body = await request.json();
    const { items, targetLanguages } = body;

    if (!Array.isArray(items) || items.length === 0 || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return json({ error: '缺少必要参数: items 和 targetLanguages' }, { status: 400 });
    }

    if (!OPENROUTER_API_KEY) {
      return json({ error: 'API密钥未配置' }, { status: 500 });
    }

    const languageList = targetLanguages
      .map((lang) => `${lang}: ${getLanguageName(lang)}`)
      .join('\n');

    // 构建多条文本列表
    const textList = items
      .map((item) => `[${item.key}]: ${item.text}`)
      .join('\n');

    const prompt = `你现在扮演一名精通音乐行业术语的专业翻译助手。这是一款音乐行业的资产管理软件，用于管理音乐作品、专辑、艺人、出版版权、录音版权、DSP 渠道以及版税等数据。仅支持以下目标语言的专业译文: en-US (英文), zh-CN (简体中文), zh-TW (繁体中文), ja-JP (日语), vi-VN (越南语), ru-RU (俄语)。请将下面的多条中文文本分别翻译成请求中列出的每种语言。

严格要求:
1. 输出必须是一个 JSON 对象，顶层键为每条文本的 key，值为一个对象，该对象的键为语言代码，值为目标语言撰写的专业译文。
2. 每个译文必须使用目标语言书写，不得保留源中文内容。
3. 使用音乐行业常用术语，准确表达出版版权、录音版权、DSP、版税等概念，保持语气简洁、正式、贴合软件界面。
4. en-US 的译文须为自然流畅的专业英语表达。
5. zh-CN 与 zh-TW 的译文需使用各自对应的中文写法和术语。
6. 可在不改变原意的前提下补充必要的行业背景词汇以确保专业性。
7. 保留原文的格式、语气与语义，不要添加解释或前缀。
8. 只输出纯 JSON，不得包含 Markdown 代码块或额外文本。

输出格式示例:
{
  "some.key": { "en-US": "English text", "zh-TW": "繁體文字", "ja-JP": "日本語テキスト", "vi-VN": "Văn bản tiếng Việt", "ru-RU": "Русский текст" },
  "another.key": { "en-US": "...", "zh-TW": "...", "ja-JP": "...", "vi-VN": "...", "ru-RU": "..." }
}

本次请求的语言列表:
${languageList}

待翻译的中文文本（共 ${items.length} 条）:
${textList}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://doors.online',
        'X-Title': 'i18n Translation App',
      },
      body: JSON.stringify({
        model: 'qwen/qwen2.5-vl-72b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a meticulous translation engine specialized in music industry asset management. Only translate into English (en-US), Simplified Chinese (zh-CN), Traditional Chinese (zh-TW), Japanese (ja-JP), Vietnamese (vi-VN), or Russian (ru-RU) as requested. Use established music industry terminology (e.g., publishing rights, master rights, DSP platforms, royalty accounting) with a concise, formal tone suitable for professional software interfaces. Always respond with valid JSON. The top-level keys must match the provided translation keys exactly. Each value is an object mapping language codes to fluent, domain-appropriate translations fully written in that language. No extra commentary.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('翻译API错误:', errorData);
      return json({ error: `翻译失败: ${errorData.error?.message || '未知错误'}` }, { status: 500 });
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      return json({ error: '翻译结果为空' }, { status: 500 });
    }

    const cleanedContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsedTranslations;

    try {
      parsedTranslations = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('解析翻译结果失败:', cleanedContent, parseError);
      return json({ error: '解析翻译结果失败，请稍后重试' }, { status: 500 });
    }

    // 校验每个 key 的每种语言是否都有翻译
    const results = {};
    const errors = [];
    for (const item of items) {
      const keyTranslations = parsedTranslations[item.key];
      if (!keyTranslations) {
        errors.push(`缺少 key "${item.key}" 的翻译`);
        continue;
      }
      results[item.key] = {};
      for (const lang of targetLanguages) {
        const val = keyTranslations[lang];
        if (!val || (typeof val === 'string' && !val.trim())) {
          errors.push(`key "${item.key}" 缺少 ${lang} 的翻译`);
        } else {
          results[item.key][lang] = typeof val === 'string' ? val.trim() : val;
        }
      }
    }

    console.log(`批量翻译完成: ${items.length} 条, 错误: ${errors.length}`);

    return json({
      total: items.length,
      success: Object.keys(results).length,
      results,
      ...(errors.length > 0 ? { warnings: errors } : {}),
    });
  } catch (error) {
    console.error('批量翻译服务错误:', error);
    return json({ error: `处理批量翻译请求时出错: ${error.message}` }, { status: 500 });
  }
}

function getLanguageName(languageCode) {
  const languageMap = {
    'en-US': '英语',
    'ja-JP': '日语',
    'zh-TW': '繁体中文',
    'vi-VN': '越南语',
    'ru-RU': '俄语',
  };
  return languageMap[languageCode] || languageCode;
}
