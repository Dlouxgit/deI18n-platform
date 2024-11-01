import { json } from '@remix-run/node';
import { getTranslations } from '../service/i18n';

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
  const url = new URL(request.url);
  const appName = url.searchParams.get('app_name') || '';
  const expand = url.searchParams.get('expand') === '1';
  const translations = await getTranslations(appName);
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
};
