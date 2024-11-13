import { json, useActionData, Form } from '@remix-run/react'
import { useState } from 'react'
import {
  TextField,
  Flex,
  Box,
  Button,
  Heading,
  Link
} from '@radix-ui/themes'
import {
  getDbConnection,
  insertTranslation,
} from '../service/i18n'

export const action = async ({ request }) => {
  const formData = await request.formData()
  const { app_name, column_name, ...values } = Object.fromEntries(formData)

  const connection = await getDbConnection()
  let errors = {}
  try {
    await connection.beginTransaction()
    for (const language in values) {
      const result = await insertTranslation(language, column_name, values[language], app_name)
      if (result.error) {
        errors[language] = result.error
      }
    }
    await connection.commit()
    return json({ success: Object.keys(errors).length === 0, errors })
  } catch (error) {
    await connection.rollback()
    return json({ error: error.message, errors }, { status: 400 })
  }
}

export default function Add() {
  const actionData = useActionData()
  const [app_name, setAppName] = useState('')
  const [column_name, setColumnName] = useState('')
  const [translations, setTranslations] = useState({})

  return (
    <>
      <Box>
        <Link href="/">To Table</Link>
      </Box>
      <Box>
        <Link href="/import">To Import Translations</Link>
      </Box>

      <Form method="post">
        <Flex gap="2" direction="column">
          <Heading>公共内容</Heading>
          <Box maxWidth="600px">
            <TextField.Root
              placeholder="Insert app name"
              name="app_name"
              value={app_name}
              onChange={e => setAppName(e.target.value)}
            />
          </Box>
          <Box maxWidth="600px">
            <TextField.Root
              placeholder="Insert key"
              name="column_name"
              value={column_name}
              onChange={e => setColumnName(e.target.value)}
            />
          </Box>
          <Heading>翻译文案</Heading>
          {['zh-CN', 'en-US', 'ja-JP', 'zh-TW'].map((language) => (
            <Box key={language} width="100%" mb="2">
              <TextField.Root
                placeholder={
                  language === 'zh-CN' ? '请输入 zh-CN 翻译' :
                  language === 'en-US' ? 'Insert en-US translation' :
                  language === 'ja-JP' ? 'ja-JP の翻訳を挿入' :
                  language === 'zh-TW' ? '請輸入 zh-TW 翻譯' : ''
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
        <Button type="submit" mt="2">Save</Button>
        {actionData?.success && (
          <p>Translations added successfully</p>
        )}
        {actionData?.error && (
          <p style={{ color: 'red' }}>{actionData.error}</p>
        )}
      </Form>
    </>
  )
}
