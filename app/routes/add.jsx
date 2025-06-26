import { json, useActionData, Form, useNavigation, useLoaderData } from '@remix-run/react'
import { useState } from 'react'
import {
  TextField,
  Flex,
  Box,
  Button,
  Heading,
  Link,
  Spinner,
  Select
} from '@radix-ui/themes'
import {
  getDbConnection,
  insertTranslation,
  getAllAppNames
} from '../service/i18n'

export const action = async ({ request }) => {
  const formData = await request.formData()
  const { app_name, column_name, ...values } = Object.fromEntries(formData)

  if (!app_name?.trim()) {
    return json({ error: "App name cannot be empty", errors: {} }, { status: 400 })
  }

  if (!column_name?.trim()) {
    return json({ error: "Column name cannot be empty", errors: {} }, { status: 400 })
  }

  const connection = await getDbConnection()
  let errors = {}
  try {
    await connection.beginTransaction()
    for (const language in values) {
      const result = await insertTranslation(connection, language, column_name, values[language], app_name)
      if (result.error) {
        errors[language] = result.error
      }
    }
    await connection.commit()
    return json({ success: Object.keys(errors).length === 0, errors })
  } catch (error) {
    await connection.rollback()
    return json({ error: error.message, errors }, { status: 400 })
  } finally {
    connection.release()
  }
}

export const loader = async () => {
  const connection = await getDbConnection();
  try {
    const appNames = await getAllAppNames(connection);
    return json({ appNames });
  } catch (error) {
    return json({ error: error.message }, { status: 500 });
  } finally {
    connection.release();
  }
}

export default function Add() {
  const actionData = useActionData()
  const navigation = useNavigation()
  const { appNames } = useLoaderData()
  const [useSelect, setUseSelect] = useState(true)
  const [column_name, setColumnName] = useState('')
  const [translations, setTranslations] = useState({})
  const [appNameError, setAppNameError] = useState('')
  const [columnNameError, setColumnNameError] = useState('')
  const isSubmitting = navigation.state === 'submitting'

  const handleSubmit = (e) => {
    const formData = new FormData(e.target)
    const appName = formData.get('app_name')
    const columnName = formData.get('column_name')
    if (!appName?.trim()) {
      e.preventDefault()
      setAppNameError('App name cannot be empty')
      return
    }
    if (!columnName?.trim()) {
      e.preventDefault()
      setColumnNameError('Column name cannot be empty')
      return
    }
    setAppNameError('')
    setColumnNameError('')
  }

  return (
    <Box style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <Box>
        <Link href="/">To Table</Link>
      </Box>
      <Box>
        <Link href="/import">To Import Translations</Link>
      </Box>

      <Form method="post" onSubmit={handleSubmit}>
        <Flex direction="column" gap="4">
          <Flex gap="3" align="center">
            <Box style={{ flex: 1 }}>
              {useSelect ? (
                <Select.Root
                  name="app_name"
                  onValueChange={() => {
                    setAppNameError('')
                  }}
                >
                  <Select.Trigger
                    placeholder="Select App Name"
                    style={{
                      width: '100%',
                      height: '40px'
                    }}
                  />
                  <Select.Content>
                    <Select.Group>
                      <Select.Label>App Name</Select.Label>
                      {appNames.map(name => (
                        <Select.Item key={name} value={name}>{name}</Select.Item>
                      ))}
                    </Select.Group>
                  </Select.Content>
                </Select.Root>
              ) : (
                <TextField.Root
                  placeholder="Enter app name"
                  name="app_name"
                  style={{ width: '100%' }}
                  onChange={(e) => {
                    e.target.value = e.target.value.trim()
                    setAppNameError('')
                  }}
                />
              )}
              {appNameError && (
                <p style={{ color: 'red', margin: '4px 0 0' }}>{appNameError}</p>
              )}
            </Box>
            <Button
              variant="soft"
              onClick={() => setUseSelect(!useSelect)}
              type="button"
              style={{ minWidth: '120px' }}
            >
              {useSelect ? 'Switch to Input' : 'Switch to Select'}
            </Button>
          </Flex>
          <Box maxWidth="600px">
            <TextField.Root
              placeholder="Insert key"
              name="column_name"
              value={column_name}
              onChange={(e) => {
                setColumnName(e.target.value.trim())
                setColumnNameError('')
              }}
            />
            {columnNameError && (
              <p style={{ color: 'red', margin: '4px 0 0' }}>{columnNameError}</p>
            )}
          </Box>
          <Heading>翻译文案</Heading>
          {['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'vi-VN'].map((language) => (
            <Box key={language} width="100%" mb="2">
              <TextField.Root
                placeholder={
                  language === 'zh-CN' ? '请输入 zh-CN 翻译' :
                  language === 'en-US' ? 'Insert en-US translation' :
                  language === 'ja-JP' ? 'ja-JP の翻訳を挿入' :
                  language === 'zh-TW' ? '請輸入 zh-TW 翻譯' :
                  language === 'vi-VN' ? 'Nhập bản dịch vi-VN' : ''
                }
                name={language}
                value={translations[language] || ''}
                onChange={e => setTranslations({ ...translations, [language]: e.target.value })}
              />
              {actionData?.errors?.[language] && (
                <p style={{ color: 'red' }}>{actionData.errors[language]}</p>
              )}
            </Box>
          ))}
        </Flex>
        <Button type="submit" mt="2" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : 'Save'}
        </Button>
        {actionData?.success && (
          <p>Translations added successfully</p>
        )}
        {actionData?.error && (
          <p style={{ color: 'red' }}>{actionData.error}</p>
        )}
      </Form>
    </Box>
  )
}
