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
  Select,
  Checkbox
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
  const connection = await getDbConnection();
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app_name') || '';
    const columnNames = url.searchParams.get('column_name');

    const appNames = await getAllAppNames(connection);
    const translations = await getTranslations(connection, appName, columnNames);

    const groupedTranslations = translations.reduce((acc, current) => {
      const { column_name, app_name } = current;
      const key = `${column_name}&${app_name}`;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(current);
      return acc;
    }, {});

    const uniqueTranslations = Object.keys(groupedTranslations);

    return json({
      translations: uniqueTranslations,
      appName,
      groupedTranslations,
      columnNames,
      appNames
    });
  } catch (error) {
    console.error('Loader error:', error);
    return json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) {
      await connection.release();
      console.log(`Connection released in loader`);
    }
  }
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const { _action, ...values } = Object.fromEntries(formData);

  const connection = await getDbConnection();
  try {
    if (_action === 'update') {
      const column_name = values.column_name;
      const appName = values.app_name;
      const column_values = Object.keys(values)
        .filter((key) => key.startsWith('column_value_'))
        .map((key) => {
          const [column_value_language, id] = key.split('&');
          const language_script_code = column_value_language.split('column_value_')[1];
          return { id, language_script_code, column_value: values[key] };
        });
      for (const column_value of column_values) {
        if (column_value.id) {
          await updateTranslationById(connection, column_value.id, column_value.column_value);
        } else {
          await insertTranslation(connection, column_value.language_script_code, column_name, column_value.column_value, appName);
        }
      }
    } else if (_action === 'delete') {
      const column_name = values.column_name;
      const appName = values.app_name;
      await deleteTranslationByColumnAndApp(connection, column_name, appName);
    }
    await connection.commit();
    return json({ success: true });
  } catch (error) {
    await connection.rollback();
    return json({ error: error.message }, { status: 400 });
  } finally {
    if (connection) {
      await connection.release();
      console.log(`Connection released in action`);
    }
  }
};

export default function Index() {
  const { translations, appName, groupedTranslations, columnNames, appNames } = useLoaderData()
  const [editingIds, setEditingIds] = useState({})
  const [deletingId, setDeletingId] = useState(null)
  const [isIframe, setIsIframe] = useState(true)
  const [scrollPosition, setScrollPosition] = useState(0)
  const [searchValue, setSearchValue] = useState('')
  const [showEmptyOnly, setShowEmptyOnly] = useState(false)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [sortDirection, setSortDirection] = useState('default')

  // 所有支持的语言列表
  const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'vi-VN']

  // 修改排序逻辑
  const filteredAndSortedTranslations = translations
    ?.filter(translation => {
      const translationGroup = groupedTranslations[translation] || []

      const matchesSearch = translationGroup.some(item =>
        item.column_value?.toLowerCase().includes(searchValue.toLowerCase())
      )

      const hasEmptyOrIncomplete = (
        translationGroup.some(item => !item.column_value || item.column_value.trim() === '') ||
        translationGroup.length < SUPPORTED_LANGUAGES.length ||
        SUPPORTED_LANGUAGES.some(lang =>
          !translationGroup.some(item => item.language_script_code === lang)
        )
      )

      return matchesSearch && (!showEmptyOnly || hasEmptyOrIncomplete)
    })
    ?.sort((a, b) => {
      // 如果是默认排序，保持原数组顺序的倒序
      if (sortDirection === 'default') {
        return -1; // 保持原数组的倒序
      }

      const columnA = a.split('&')[0].toLowerCase()
      const columnB = b.split('&')[0].toLowerCase()
      return sortDirection === 'asc'
        ? columnA.localeCompare(columnB)
        : columnB.localeCompare(columnA)
    })

  // 处理排序点击
  const handleSortClick = () => {
    setSortDirection(prev => {
      switch (prev) {
        case 'default':
          return 'asc';
        case 'asc':
          return 'desc';
        case 'desc':
          return 'default';
        default:
          return 'default';
      }
    });
  };

  // 获取排序图标
  const getSortIcon = () => {
    switch (sortDirection) {
      case 'default':
        return '↑↓';
      case 'asc':
        return '↑';
      case 'desc':
        return '↓';
      default:
        return '';
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && window.parent !== window) {
      setIsIframe(true)
    } else {
      setIsIframe(false)
    }
  }, [])

  useEffect(() => {
    window.scrollTo(0, scrollPosition)
  }, [translations])

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  const handleDeleteClick = (translation) => {
    setDeletingId(translation)
    setScrollPosition(window.scrollY)
  }

  return (
    <>
      <Heading>i18n Translation Platform</Heading>
      <Flex gap="2">
        <Link href="/import">To Import Translations</Link>
        <Link href="/export">To Export Translations</Link>
      </Flex>
      <Form method="get">
        <Flex gap="2" direction="column">
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
            <Box maxWidth="450px">
              <TextField.Root
                placeholder="Search in values"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                style={{ width: '240px' }}
              />
            </Box>
            <Box maxWidth="100px">
              <Button type="submit">Filter</Button>
            </Box>
            <Box maxWidth="100px">
              <Button type="reset" variant="soft" onClick={() => {
                window.location.href = '/'
                setSearchValue('')
              }}>Reset</Button>
            </Box>
          </Flex>
          <Flex gap="2" align="center">
            <Checkbox
              checked={showEmptyOnly}
              onCheckedChange={(checked) => setShowEmptyOnly(checked)}
              id="showEmptyOnly"
            />
            <label htmlFor="showEmptyOnly" style={{ cursor: 'pointer' }}>
              Show translations with empty values or incomplete languages
            </label>
          </Flex>
        </Flex>
      </Form>
      <Box mt="2">
        <Link href="/add"><Button>Add</Button></Link>
      </Box>
      <AlertDialog.Root>
        <Table.Root style={{ width: '100%' }}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell
                style={{ minWidth: '140px', maxWidth: '160px', cursor: 'pointer' }}
                onClick={handleSortClick}
              >
                Column Name {getSortIcon()}
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={{ minWidth: '150px' }}>Value</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell style={{ maxWidth: '200px' }}>
                App Name
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Action</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filteredAndSortedTranslations?.map((translation) => (
              <Table.Row key={translation}>
                <Table.Cell style={{ minWidth: '140px', maxWidth: '160px' }}>{translation.split('&')[0]}</Table.Cell>
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
                          {['zh-CN', 'en-US', 'ja-JP', 'zh-TW', 'vi-VN'].map((language) => (
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
                          onClick={() => handleDeleteClick(translation)}
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
      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 1000,
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ↑
        </Button>
      )}
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
    case 'vi-VN':
      return 'green'
    default:
      return 'gray'
  }
}
