import { useState } from 'react';
import { useLoaderData } from '@remix-run/react';
import { json } from '@remix-run/node';
import { Select, Button, Flex, Link } from '@radix-ui/themes';
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

  const handleDownload = async (appName) => {
    const response = await fetch(`/i18n-json?app_name=${appName}`);
    const data = await response.json();
    const formattedJson = JSON.stringify(data, null, 2);
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${appName || 'translations'}_${timestamp}.json`;

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
      <Link href="/" className="import-link">
        Back to translations
      </Link>
    </Flex>
  );
}
