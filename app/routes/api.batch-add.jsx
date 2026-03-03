import { json } from '@remix-run/node'
import { getDbConnection, mutilInsertTranslation } from '../service/i18n'

export async function action({ request }) {
  let connection
  try {
    const body = await request.json()
    const { app_name, keys, overwrite = false } = body

    if (!app_name || !Array.isArray(keys) || keys.length === 0) {
      return json({ error: '缺少 app_name 或 keys' }, { status: 400 })
    }

    // 展开为 [{ languageCode, key, value, appName }]
    const translations = []
    for (const item of keys) {
      const { key, ...langs } = item
      if (!key) continue
      for (const [lang, value] of Object.entries(langs)) {
        translations.push({ languageCode: lang, key, value, appName: app_name })
      }
    }

    if (translations.length === 0) {
      return json({ error: '没有有效的翻译条目' }, { status: 400 })
    }

    connection = await getDbConnection()
    await connection.beginTransaction()

    const { result, records } = await mutilInsertTranslation(connection, translations, overwrite)

    await connection.commit()

    return json({
      success: true,
      inserted: result[0].affectedRows,
      records,
    })
  } catch (error) {
    if (connection) {
      try { await connection.rollback() } catch {}
    }
    console.error('api.batch-add error:', error)
    return json({ error: error.message }, { status: 500 })
  } finally {
    if (connection) connection.release()
  }
}
