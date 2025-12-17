import { json } from '@remix-run/node'
import { getDbConnection, getStats } from '../service/i18n'

export const loader = async () => {
  let connection
  try {
    connection = await getDbConnection()
    const stats = await getStats(connection)
    const total = stats.reduce((sum, row) => sum + Number(row.count), 0)
    return json({ stats, total })
  } catch (error) {
    console.error('api.stats error:', error)
    return json({ error: error.message }, { status: 500 })
  } finally {
    if (connection) {
      connection.release()
    }
  }
}
