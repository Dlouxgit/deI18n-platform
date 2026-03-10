import { json, useActionData, Form, useNavigation, useLoaderData } from '@remix-run/react'
import flattenJson from './utils'
import { Box, Button, Flex, Heading, TextField, Link, Switch, Badge, Spinner, Select, Text } from '@radix-ui/themes'
import {
  getDbConnection,
  mutilInsertTranslation,
  getAllAppNames
} from '../service/i18n'
import { useState } from 'react'

export const action = async ({ request }) => {
  const formData = await request.formData()
  const file = formData.get('file')
  const appName = formData.get('app_name') || null
  const overwrite = formData.get('overwrite') === 'on' ? true : false // 根据 Switch 的状态决定是否增加 overwrite 参数

  if (!appName?.trim()) {
    return json({ error: "App name cannot be empty", errors: {} }, { status: 400 })
  }

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

    if (!['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'vi-VN'].includes(languageCode)) {
      const targetKeys = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'vi-VN']
      const existingKeys = keys.filter((key) => targetKeys.includes(key))
      if (existingKeys.length === 0) {
        return json(
          { error: '文件格式错误: 缺少 zh-CN、zh-TW、en-US、ja-JP、vi-VN 语言代码' },
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

export default function Import() {
  const actionData = useActionData()
  const { appNames } = useLoaderData()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const [useSelect, setUseSelect] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

  const handleDrag = (e) => {
    e.preventDefault()
    setDragActive(true)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      const input = document.querySelector('input[type="file"]')
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      input.files = dataTransfer.files
      setSelectedFile(file)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  return (
    <Box className="import-container" style={{ maxWidth: '800px', margin: '40px auto', padding: '20px' }}>
      <Heading size="6" mb="4">Import Translations</Heading>
      <Form method="post" encType="multipart/form-data" className="import-form" onDragEnter={handleDrag}>
        <Flex direction="column" gap="4">
          <Flex gap="3" align="center">
            <Box style={{ flex: 1 }}>
              {useSelect ? (
                <Select.Root name="app_name">
                  <Select.Trigger
                    placeholder="Select App Name"
                    style={{
                      width: '100%',
                      height: '40px',
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
                  onChange={(e) => e.target.value = e.target.value.trim()}
                />
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

          <Flex gap="3" align="center">
            <Box
              style={{
                flex: 1,
                position: 'relative',
                padding: '30px 20px',
                border: `2px dashed ${dragActive ? '#3b82f6' : '#e5e7eb'}`,
                borderRadius: '8px',
                backgroundColor: dragActive ? 'rgba(59, 130, 246, 0.05)' : 'white',
                textAlign: 'center',
                transition: 'all 0.3s ease'
              }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                name="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer'
                }}
              />
              <div>
                {selectedFile ? (
                  <div style={{ wordBreak: 'break-word' }}>
                    <strong>Selected:</strong> {selectedFile.name}
                    <br />
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {(selectedFile.size / 1024).toFixed(2)} KB
                    </span>
                  </div>
                ) : (
                  <>
                    <div style={{ color: '#666', marginBottom: '4px' }}>
                      Drag and drop JSON file here
                    </div>
                    <div style={{ fontSize: '14px', color: '#888' }}>
                      or click to browse
                    </div>
                  </>
                )}
              </div>
            </Box>
            <Button
              type="submit"
              disabled={isSubmitting}
              style={{
                minWidth: '120px',
                height: '40px'
              }}
            >
              {isSubmitting ? <Spinner /> : 'Import'}
            </Button>
          </Flex>

          <Flex align="center" gap="2" mt="2">
            <strong>Overwrite database?</strong>
            <Switch name="overwrite" />
          </Flex>
        </Flex>
      </Form>

      <Box mt="4">
        {actionData?.success && (
          <Text color="green" style={{ marginBottom: '8px' }}>{actionData.message}</Text>
        )}
        {actionData?.error && (
          <Text color="red" style={{ marginBottom: '8px' }}>{actionData.error}</Text>
        )}
        {actionData?.records && (
          <Box mb="2">
            <Badge color="orange">{actionData.records.length} records import conflict</Badge>
          </Box>
        )}
        {actionData?.records?.map((record) => (
          <Text size="2" color="gray" key={record}>{record}</Text>
        ))}
      </Box>

      <Link
        href="/"
        style={{
          display: 'inline-block',
          marginTop: '20px',
          color: '#3b82f6',
          textDecoration: 'none'
        }}
      >
        Back to translations
      </Link>
    </Box>
  )
}
