import { json } from '@remix-run/node';
import { getTranslations } from '../service/i18n';

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const appName = url.searchParams.get('app_name') || '';
  const translations = await getTranslations(appName);
  const result = translations.reduce((acc, current) => {
    const { column_name, language_script_code, id } = current;
    if (!acc[column_name]) {
      acc[column_name] = {};
    }
    acc[column_name][language_script_code] = id;
    return acc;
  }, {});
  return json(result);
};
