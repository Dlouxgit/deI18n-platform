import { useLoaderData } from '@remix-run/react'
import {
  Table,
  Heading,
  Link,
  Flex,
  Box,
  Text
} from '@radix-ui/themes'
import { getDbConnection, getStats } from '../service/i18n'

export const loader = async () => {
  const connection = await getDbConnection()
  try {
    const stats = await getStats(connection)
    const total = stats.reduce((sum, row) => sum + Number(row.count), 0)
    return { stats, total }
  } finally {
    connection.release()
  }
}

export default function Stats() {
  const { stats, total } = useLoaderData()

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  return (
    <>
      <Heading>Translation Statistics</Heading>
      <Flex gap="2" mb="4">
        <Link href="/">Back to Home</Link>
      </Flex>
      <Box mb="4">
        <Text size="3" weight="bold">Total: {total.toLocaleString()} entries</Text>
      </Box>
      <Table.Root style={{ width: '100%', maxWidth: '800px' }}>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>App Name</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Count</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Last Updated</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {stats.map((row) => (
            <Table.Row key={row.app_name || 'null'}>
              <Table.Cell>{row.app_name || '(NULL)'}</Table.Cell>
              <Table.Cell>{Number(row.count).toLocaleString()}</Table.Cell>
              <Table.Cell>{formatDate(row.last_updated)}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </>
  )
}
