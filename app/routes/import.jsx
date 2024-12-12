import { json, useActionData, Form, useNavigation } from '@remix-run/react'
import flattenJson from './utils'
import { Box, Button, Flex, Heading, TextField, Link, Switch, Badge, Spinner } from '@radix-ui/themes'
import {
  getDbConnection,
  mutilInsertTranslation
} from '../service/i18n'

export const action = async ({ request }) => {
  const formData = await request.formData()
  const file = formData.get('file')
  const appName = formData.get('app_name') || null
  const overwrite = formData.get('overwrite') === 'on' ? true : false // 根据 Switch 的状态决定是否增加 overwrite 参数

  if (!file || !(file instanceof File)) {
    return json({ error: 'No file uploaded' }, { status: 400 })
  }

  const content = await file.text()
  let translations

  try {
    translations = JSON.parse(content)
  } catch (error) {
    return json({ error: 'Invalid JSON file' }, { status: 400 })
  }

  if (!translations || typeof translations !== 'object') {
    return json(
      { error: "Invalid JSON structure: ' is missing or not an object" },
      { status: 400 }
    )
  }

  const connection = await getDbConnection()
  try {
    await connection.beginTransaction()
    // 新增处理不同语言的逻辑
    const languageCode = file.name.split('.')[0] // 获取语言代码，如 zh-CN
    const keys = Object.keys(translations) // 获取所有的 key

    const returnRecords = []

    if (!['zh-CN', 'zh-TW', 'en-US', 'ja-JP'].includes(languageCode)) {
      const targetKeys = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP']
      const existingKeys = keys.filter((key) => targetKeys.includes(key))
      if (existingKeys.length === 0) {
        return json(
          { error: '文件格式错误: 缺少 zh-CN、zh-TW、en-US、ja-JP 语言代码' },
          { status: 400 }
        )
      }
      const promises = await existingKeys.map(async (languageCode) => {
        const flattened = flattenJson(translations[languageCode])

        const translationsToInsert = flattened.map((item) => {
          return {
            languageCode,
            key: item.key,
            value: item.value,
            appName
          }
        })

        const { records } = await mutilInsertTranslation(connection, translationsToInsert, overwrite)
        return records
      })
      const languageRecords = await Promise.all(promises)
      languageRecords.forEach((item) => {
        returnRecords.push(...item)
      })
    } else {
      const flattened = flattenJson(translations)

      const translationsToInsert = flattened.map((item) => {
        return {
          languageCode,
          key: item.key,
          value: item.value,
          appName
        }
      })
      const { records } = await mutilInsertTranslation(connection, translationsToInsert, overwrite)
      returnRecords.push(...records)

    }

    await connection.commit()
    return json({
      success: true,
      message: 'Translations imported successfully',
      records: returnRecords,
    })
  } catch (error) {
    await connection.rollback()
    return json({ error: error.message }, { status: 500 })
  } finally {
    connection.release()
  }
}

export default function Import() {
  const actionData = useActionData()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  return (
    <Box className="import-container">
      <Heading className="import-title">Import Translations</Heading>
      <Form method="post" encType="multipart/form-data" className="import-form">
        <Flex gap="2" className="import-flex">
          <Box maxWidth="200px" className="import-box">
            <TextField.Root
              placeholder="Insert to app_name"
              name="app_name"
              className="import-textfield"
            />
          </Box>
          <Box maxWidth="100px" className="import-box">
            <Button type="submit" className="import-button" disabled={isSubmitting}>
              {isSubmitting ? <Spinner /> : 'Import'}
            </Button>
          </Box>
          <Box maxWidth="200px" className="import-box">
            <input
              type="file"
              name="file"
              accept=".json"
              className="import-input"
            />
          </Box>
        </Flex>
        <Box maxWidth="200px" mt="2" className="import-box">
          <strong>Overwrite database</strong>?
          <br />
          <Switch name="overwrite" />
        </Box>
      </Form>
      {actionData?.success && (
        <p className="import-message">{actionData.message}</p>
      )}
      {actionData?.error && <p className="import-error">{actionData.error}</p>}
      {actionData?.records && (
        <Badge color="orange">{actionData.records.length} records import conflict</Badge>
      )}
      {actionData?.records?.map((record) => (
        <p className="import-record" key={record}>{record}</p>
      ))}
      <Link href="/" className="import-link">
        Back to translations
      </Link>
    </Box>
  )
}
