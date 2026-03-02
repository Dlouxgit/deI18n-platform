import { useState } from 'react';
import { useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';
import { Select, Button, Flex, Link, Checkbox } from '@radix-ui/themes';
import { getAllAppNames, getDbConnection } from '../service/i18n';

export const loader = async ({ request }) => {
  const connection = await getDbConnection();
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app_name') || '';
    // 传入 connection 参数
    const appNames = await getAllAppNames(connection);
    return json({ appNames, selectedAppName: appName });
  } catch (error) {
    console.error('Export loader error:', error);
    return json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) {
      await connection.release();
      console.log('Connection released in export loader');
    }
  }
};

export default function ExportPage() {
  const { appNames, selectedAppName } = useLoaderData();
  const [currentAppName, setCurrentAppName] = useState(selectedAppName);
  const [showEmptyOnly, setShowEmptyOnly] = useState(false);

  const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'vi-VN', 'ru-RU'];

  const handleDownload = async (appName) => {
    const response = await fetch(`/i18n-json?app_name=${appName}`);
    const data = await response.json();

    // 收集所有语言中的所有 key
    const allKeys = new Set();
    Object.values(data).forEach(translations => {
      Object.keys(translations).forEach(key => allKeys.add(key));
    });

    // 补全所有语言的 key，缺失的用空字符串填充
    const completeData = {};
    SUPPORTED_LANGUAGES.forEach(lang => {
      completeData[lang] = {};
      allKeys.forEach(key => {
        completeData[lang][key] = data[lang]?.[key] ?? '';
      });
    });

    let filteredData = completeData;
    if (showEmptyOnly) {
      // 过滤出有空值的 key
      const incompleteKeys = [...allKeys].filter(key => {
        return SUPPORTED_LANGUAGES.some(lang => {
          const value = completeData[lang][key];
          return !value || value.trim() === '';
        });
      });

      // 重新构建过滤后的数据结构（保留补全的空值）
      filteredData = {};
      SUPPORTED_LANGUAGES.forEach(lang => {
        filteredData[lang] = {};
        incompleteKeys.forEach(key => {
          filteredData[lang][key] = completeData[lang][key];
        });
      });
    }

    const formattedJson = JSON.stringify(filteredData, null, 2);
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${appName || 'translations'}_${timestamp}${showEmptyOnly ? '_empty_only' : ''}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <Flex direction="column" gap="4" style={{ padding: '20px' }}>
      <Flex direction="column" gap="4">
        <Flex gap="4" align="center">
          <Select.Root
            defaultValue={selectedAppName}
            onValueChange={setCurrentAppName}
          >
            <Select.Trigger placeholder="select app" />
            <Select.Content>
              {appNames.map((name) => (
                <Select.Item key={name} value={name}>
                  {name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Button onClick={() => handleDownload(currentAppName)}>export</Button>
        </Flex>
        <Flex gap="2" align="center">
          <Checkbox
            checked={showEmptyOnly}
            onCheckedChange={(checked) => setShowEmptyOnly(checked)}
            id="showEmptyOnly"
          />
          <label htmlFor="showEmptyOnly" style={{ cursor: 'pointer' }}>
            Export translations with empty values or incomplete languages
          </label>
        </Flex>
      </Flex>
      <Link href="/" className="import-link">
        Back to translations
      </Link>
    </Flex>
  );
}
