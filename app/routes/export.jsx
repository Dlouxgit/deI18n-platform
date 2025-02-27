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

  const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'vi-VN'];

  const handleDownload = async (appName) => {
    const response = await fetch(`/i18n-json?app_name=${appName}`);
    const data = await response.json();

    let filteredData = data;
    if (showEmptyOnly) {
      // 重组数据结构，按 key 分组
      const keyBasedData = {};
      Object.entries(data).forEach(([lang, translations]) => {
        Object.entries(translations).forEach(([key, value]) => {
          if (!keyBasedData[key]) {
            keyBasedData[key] = {};
          }
          keyBasedData[key][lang] = value;
        });
      });

      // 过滤出有空值或不完整的 key
      const incompleteKeys = Object.entries(keyBasedData).filter(([key, translations]) => {
        const hasEmptyValues = Object.values(translations).some(value =>
          !value || value.trim() === ''
        );

        const hasIncompleteLanguages = SUPPORTED_LANGUAGES.some(lang =>
          !translations[lang]
        );

        return hasEmptyValues || hasIncompleteLanguages;
      }).map(([key]) => key);

      // 重新构建过滤后的数据结构
      filteredData = Object.fromEntries(
        Object.entries(data).map(([lang, translations]) => [
          lang,
          Object.fromEntries(
            Object.entries(translations).filter(([key]) =>
              incompleteKeys.includes(key)
            )
          )
        ])
      );
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
