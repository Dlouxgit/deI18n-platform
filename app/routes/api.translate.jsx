import { json } from '@remix-run/node';
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

export async function action({ request }) {
  try {
    console.log('收到翻译请求');
    const formData = await request.formData();
    const chineseText = formData.get('chineseText');
    const targetLanguages = formData.getAll('targetLanguages');

    console.log('中文文本:', chineseText);
    console.log('目标语言:', targetLanguages);

    if (!chineseText || targetLanguages.length === 0) {
      console.log('缺少必要参数');
      return json({ error: '缺少必要参数' }, { status: 400 });
    }

    if (!OPENROUTER_API_KEY) {
      console.error('未配置OpenRouter API密钥');
      return json({ error: 'API密钥未配置' }, { status: 500 });
    }

    const translations = {};
    const languageList = targetLanguages
      .map((lang) => `${lang}: ${getLanguageName(lang)}`)
      .join('\n');
    const prompt = `你是一名专业的翻译助手。请将下面的中文文本分别翻译成所有列出的目标语言。\n\n严格要求:\n1. 输出必须是一个 JSON 对象，键为语言代码，值为对应语言撰写的译文。\n2. 每个译文必须使用目标语言书写，绝对不能保留中文原文。\n3. en-US 的译文必须是自然流畅的英文句子。\n4. 保留原文中的格式和语气，不要添加解释或前缀。\n5. 只输出 JSON，不要包含 Markdown 代码块或额外文字。\n\n语言列表:\n${languageList}\n\n中文文本:\n${chineseText}`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://doors.online',
          'X-Title': 'i18n Translation App',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.0-flash-exp:free',
          // model: 'deepseek/deepseek-chat-v3-0324:free',
          messages: [
            {
              role: 'system',
              content: 'You are a meticulous translation engine. Always respond with valid JSON where each key is the requested language code and each value is a fluent translation written entirely in that language.',
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
        console.error('翻译结果为空:', data);
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

      for (const lang of targetLanguages) {
        const translation = parsedTranslations[lang];

        if (!translation) {
          console.error(`缺少 ${lang} 的翻译:`, parsedTranslations);
          return json({ error: `缺少 ${lang} 的翻译结果` }, { status: 500 });
        }

        const normalized = typeof translation === 'string' ? translation.trim() : translation;

        if (typeof normalized !== 'string' || !normalized) {
          console.error(`翻译 ${lang} 的返回格式不正确:`, translation);
          return json({ error: `翻译 ${lang} 的返回格式不正确` }, { status: 500 });
        }
        translations[lang] = normalized;
      }
    } catch (error) {
      console.error('翻译服务请求失败:', error);
      return json({ error: `翻译服务请求失败: ${error.message}` }, { status: 500 });
    }

    console.log('所有翻译完成:', translations);
    return json({ translations });
  } catch (error) {
    console.error('翻译服务错误:', error);
    return json({ error: `处理翻译请求时出错: ${error.message}` }, { status: 500 });
  }
}

// 获取语言名称的辅助函数
function getLanguageName(languageCode) {
  const languageMap = {
    'en-US': '英语',
    'ja-JP': '日语',
    'zh-TW': '繁体中文',
    'vi-VN': '越南语'
  };

  return languageMap[languageCode] || languageCode;
}
