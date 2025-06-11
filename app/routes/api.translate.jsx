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

    // 为每种目标语言创建翻译提示
    for (const lang of targetLanguages) {
      console.log(`开始翻译 ${lang}`);
      const prompt = `请将以下中文文本翻译成${getLanguageName(lang)}，只需要返回翻译结果，不要包含任何解释或额外文本：\n\n${chineseText}`;

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
            model: 'deepseek/deepseek-chat-v3-0324:free',
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`翻译API错误 (${lang}):`, errorData);
          return json({ error: `翻译失败: ${errorData.error?.message || '未知错误'}` }, { status: 500 });
        }

        const data = await response.json();
        console.log(`${lang} 翻译结果:`, data.choices[0].message.content);
        translations[lang] = data.choices[0].message.content.trim();
      } catch (error) {
        console.error(`翻译 ${lang} 时出错:`, error);
        return json({ error: `翻译 ${lang} 时出错: ${error.message}` }, { status: 500 });
      }
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
