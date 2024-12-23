import { json, useLoaderData, Form } from '@remix-run/react'
import { useState, useEffect } from 'react'
import {
  Table,
  Button,
  TextField,
  Flex,
  Box,
  Heading,
  Link,
  Badge,
  AlertDialog,
  Select
} from '@radix-ui/themes'
import {
  getDbConnection,
  getTranslations,
  updateTranslationById,
  insertTranslation,
  deleteTranslationByColumnAndApp,
  getAllAppNames
} from '../service/i18n'

export const loader = async ({ request }) => {
  const url = new URL(request.url)
  const appName = url.searchParams.get('app_name') || ''
  const columnNames = url.searchParams.get('column_name')
  const appNames = await getAllAppNames()

  try {
    const translations = await getTranslations(appName, columnNames)
    // 将数据按 column_name 和 app_name 分组
    const groupedTranslations = translations.reduce((acc, current) => {
      const { column_name, app_name } = current
      const key = `${column_name}&${app_name}`
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(current)
      return acc
    }, {})
    // 过滤重复的 column_name 和 app_name
    const uniqueTranslations = Object.keys(groupedTranslations)
    return json({
      translations: uniqueTranslations,
      appName,
      groupedTranslations,
      columnNames,
      appNames
    })
  } catch (error) {
    return json({ error: error.message }, { status: 500 })
  }
}

export const action = async ({ request }) => {
  const formData = await request.formData()
  const { _action, ...values } = Object.fromEntries(formData)

  const connection = await getDbConnection()
  try {
    if (_action === 'update') {
      const column_name = values.column_name
      const appName = values.app_name
      const column_values = Object.keys(values)
        .filter((key) => key.startsWith('column_value_'))
        .map((key) => {
          const [column_value_language, id] = key.split('&')
          const language_script_code = column_value_language.split('column_value_')[1]
          return { id, language_script_code, column_value: values[key] }
        })
      await connection.beginTransaction()
      for (const column_value of column_values) {
        if (column_value.id) {
          await updateTranslationById(column_value.id, column_value.column_value)
        } else {
          await insertTranslation(column_value.language_script_code, column_name, column_value.column_value, appName)
        }
      }
      await connection.commit()
    } else if (_action === 'delete') {
      const column_name = values.column_name
      const appName = values.app_name
      await deleteTranslationByColumnAndApp(column_name, appName)
      await connection.commit()
    }
    return json({ success: true })
  } catch (error) {
    await connection.rollback()
    return json({ error: error.message }, { status: 400 })
  }
}

export default function Index() {
  const { translations, appName, groupedTranslations, columnNames, appNames } = useLoaderData()
  const [editingIds, setEditingIds] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [isIframe, setIsIframe] = useState(true)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      setIsIframe(true)
    } else {
      setIsIframe(false)
    }
  }, [])

  return (
    <>
      <Heading>i18n Translation Platform</Heading>
      <Link href="/import">To Import Translations</Link>
      <Form method="get">
        <Flex gap="2">
          <Box>
            <Select.Root defaultValue={appName} name="app_name">
              <Select.Trigger placeholder="Select App Name" />
              <Select.Content>
                <Select.Group>
                  <Select.Label>App Name</Select.Label>
                  {appNames.map(name => (
                    <Select.Item key={name} value={name}>{name}</Select.Item>
                  ))}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </Box>
          <Box maxWidth="450px">
            <TextField.Root
              defaultValue={columnNames}
              placeholder="Filter by column name"
              name="column_name"
              onChange={(e) => e.target.value = e.target.value.trim()}
              style={{ width: '240px' }}
            />
          </Box>
          <Box maxWidth="100px">
            <Button type="submit">Filter</Button>
          </Box>
          <Box maxWidth="100px">
            <Button type="reset" variant="soft" onClick={() => {
              window.location.href = '/'
            }}>Reset</Button>
          </Box>
        </Flex>
      </Form>
      <Box mt="2">
        <Link href="/add"><Button>Add</Button></Link>
      </Box>
      <AlertDialog.Root>
        <Table.Root style={{ width: '100%' }}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell style={{ maxWidth: '140px' }}>Column Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={{ minWidth: '150px' }}>Value</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={{ maxWidth: '200px' }}>
                App Name
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Action</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {translations?.map((translation) => (
              <Table.Row key={translation}>
                <Table.Cell style={{ maxWidth: '140px' }}>{translation.split('&')[0]}</Table.Cell>
                <Table.Cell>
                  {editingIds[translation] ? (
                    <Form
                      method="post"
                      onSubmit={() =>
                        setEditingIds({ ...editingIds, [translation]: false })
                      }
                    >
                      <Flex gap="3">
                        <Box width="328px">
                          <TextField.Root
                            type="hidden"
                            style={{ display: 'none' }}
                            name="column_name"
                            value={translation.split('&')[0]}
                          />
                          <TextField.Root
                            type="hidden"
                            style={{ display: 'none' }}
                            name="app_name"
                            value={translation.split('&')[1]}
                          />
                          <TextField.Root
                            type="hidden"
                            style={{ display: 'none' }}
                            name="_action"
                            value="update"
                          />
                          {['zh-CN', 'en-US', 'ja-JP', 'zh-TW'].map((language) => (
                            <Box key={language} width="100%">
                              <Badge
                                color={getBadgeColor(language)}
                                mb="2"
                                mt="2"
                              >
                                {language}
                              </Badge>
                              <TextField.Root
                                name={`column_value_${language}&${groupedTranslations[translation].find(groupedTranslation => groupedTranslation.language_script_code === language)?.id || ''}`}
                                defaultValue={groupedTranslations[translation].find(groupedTranslation => groupedTranslation.language_script_code === language)?.column_value || ''}
                              />
                            </Box>
                          ))}
                        </Box>
                      </Flex>
                      <Box maxWidth="100px" mt="2">
                        <Button type="submit" onClick={() => {
                          window.parent.postMessage({ type: 'save' }, '*')
                        }}>Save</Button>
                      </Box>
                    </Form>
                  ) : (
                    // 显示分组后的所有值
                    groupedTranslations[translation]?.map(
                      (groupedTranslation) => (
                        <div key={groupedTranslation.id}>
                          <Badge
                            color={getBadgeColor(
                              groupedTranslation.language_script_code
                            )}
                          >
                            {groupedTranslation.language_script_code}
                          </Badge>{' '}
                          {groupedTranslation.column_value}
                        </div>
                      )
                    )
                  )}
                </Table.Cell>
                <Table.Cell>{translation.split('&')[1]}</Table.Cell>
                <Table.Cell>
                  {editingIds[translation] ? (
                    <Button
                      onClick={() =>
                        setEditingIds({ ...editingIds, [translation]: false })
                      }
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Flex gap="2">
                      <Button
                        color="cyan"
                        variant="soft"
                        onClick={() =>
                          setEditingIds({ ...editingIds, [translation]: true })
                        }
                        disabled={!appName && !columnNames}
                      >
                        Edit
                      </Button>
                      <AlertDialog.Trigger
                        style={{ opacity: isIframe ? '0' : '1' }}
                      >
                        <Button
                          color="gray"
                          variant="solid"
                          highContrast
                          type="submit"
                          disabled={!appName && !columnNames}
                          onClick={() => setDeletingId(translation)}
                        >
                          Delete
                        </Button>
                      </AlertDialog.Trigger>
                    </Flex>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>delete key</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure? This key will no longer be accessible.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" onClick={() => setDeletingId(null)}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Form method="post">
                <input type="hidden" name="column_name" value={deletingId?.split('&')[0]} />
                <input type="hidden" name="app_name" value={deletingId?.split('&')[1]} />
                <input type="hidden" name="_action" value="delete" />
                <Button variant="solid" color="red">
                  delete key
                </Button>
              </Form>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}

function getBadgeColor(languageScriptCode) {
  switch (languageScriptCode) {
    case 'zh-CN':
      return 'indigo'
    case 'en-US':
      return 'cyan'
    case 'ja-JP':
      return 'orange'
    case 'zh-TW':
      return 'crimson'
    default:
      return 'gray'
  }
}
