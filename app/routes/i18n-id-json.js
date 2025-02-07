import { json } from '@remix-run/node';
import { getTranslations, getDbConnection } from '../service/i18n';

export const loader = async ({ request }) => {
  const connection = await getDbConnection();
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app_name') || '';

    // 传入 connection 参数
    const translations = await getTranslations(connection, appName);

    const result = translations.reduce((acc, current) => {
      const { column_name, language_script_code, id } = current;
      if (!acc[column_name]) {
        acc[column_name] = {};
      }
      acc[column_name][language_script_code] = id;
      return acc;
    }, {});

    return json(result);
  } catch (error) {
    console.error('i18n-id-json loader error:', error);
    return json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) {
      await connection.release();
      console.log('Connection released in i18n-id-json loader');
    }
  }
};
