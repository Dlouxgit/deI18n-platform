import { json } from '@remix-run/node';
import { getTranslations, getDbConnection } from '../service/i18n';

const expandObject = (obj, key, value) => {
  const keys = key.split('.');
  let currentObj = obj;
  keys.forEach((key, index) => {
    if (!currentObj[key]) {
      currentObj[key] = {};
    }
    if (index === keys.length - 1) {
      currentObj[key] = value;
    } else {
      currentObj = currentObj[key];
    }
  });
};

export const loader = async ({ request }) => {
  const connection = await getDbConnection();
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app_name') || '';
    const expand = url.searchParams.get('expand') === '1';

    // 传入 connection 参数
    const translations = await getTranslations(connection, appName);

    let result = translations.reduce((acc, current) => {
      const { language_script_code, column_name, column_value } = current;
      if (!acc[language_script_code]) {
        acc[language_script_code] = {};
      }
      if (expand) {
        expandObject(acc[language_script_code], column_name, column_value);
      } else {
        acc[language_script_code][column_name] = column_value;
      }
      return acc;
    }, {});

    return json(result);
  } catch (error) {
    console.error('i18n-json loader error:', error);
    return json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) {
      await connection.release();
      console.log('Connection released in i18n-json loader');
    }
  }
};
