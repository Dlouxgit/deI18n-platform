import { getDbConnection, getStats } from '../service/i18n'

export const loader = async () => {
  const connection = await getDbConnection()
  try {
    const stats = await getStats(connection)
    const total = stats.reduce((sum, row) => sum + Number(row.count), 0)
    return Response.json({ stats, total })
  } finally {
    connection.release()
  }
}
