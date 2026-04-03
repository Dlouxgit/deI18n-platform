import { createHmac } from 'node:crypto';
import process from 'node:process';
import { json } from '@remix-run/node';
import { getDbConnection, getTranslations } from '../service/i18n';

const GITLAB_URL = (process.env.GITLAB_URL || '').replace(/\/$/, '');
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || '';
const FEISHU_WEBHOOK = process.env.FEISHU_WEBHOOK || '';
const FEISHU_SECRET = process.env.FEISHU_SECRET || '';
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || '';

async function gitlabApi(path, options = {}) {
  const url = `${GITLAB_URL}/api/v4${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'PRIVATE-TOKEN': GITLAB_TOKEN,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || `GitLab API error: ${res.status}`);
  }
  return data;
}

function getTranslationJson(translations) {
  return translations.reduce((acc, current) => {
    const { language_script_code, column_name, column_value } = current;
    if (!acc[language_script_code]) {
      acc[language_script_code] = {};
    }
    acc[language_script_code][column_name] = column_value;
    return acc;
  }, {});
}

function buildFeishuSign(secret, timestamp) {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac('sha256', stringToSign).digest('base64');
}

function buildFeishuPayload(appName, targetBranch, mrUrl) {
  const payload = {
    msg_type: 'post',
    content: {
      post: {
        zh_cn: {
          title: 'i18n 翻译发布通知',
          content: [
            [{ tag: 'text', text: '项目：' }, { tag: 'text', text: String(appName) }],
            [{ tag: 'text', text: '目标分支：' }, { tag: 'text', text: String(targetBranch) }],
            [{ tag: 'text', text: 'MR：' }, { tag: 'a', text: '查看 Merge Request', href: mrUrl }],
            [{ tag: 'text', text: '请相关同学 review 后合并' }],
          ],
        },
      },
    },
  };

  if (FEISHU_SECRET) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    payload.timestamp = timestamp;
    payload.sign = buildFeishuSign(FEISHU_SECRET, timestamp);
  }

  return payload;
}

async function sendFeishuBotNotification(appName, targetBranch, mrUrl) {
  const res = await fetch(FEISHU_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildFeishuPayload(appName, targetBranch, mrUrl)),
  });

  const data = await res.json().catch(() => null);
  const code = data?.code ?? data?.StatusCode ?? 0;
  if (!res.ok || code !== 0) {
    throw new Error(data?.msg || data?.StatusMessage || `Feishu bot API error: ${res.status}`);
  }
}

async function sendWecomBotNotification(appName, targetBranch, mrUrl) {
  const res = await fetch(WECOM_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: `**i18n 翻译发布通知**\n>项目: <font color="info">${appName}</font>\n>目标分支: <font color="warning">${targetBranch}</font>\n>MR: ${mrUrl}\n>\n>请相关同学review后合并`,
      },
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (typeof data?.errcode === 'number' && data.errcode !== 0)) {
    throw new Error(data?.errmsg || `WeCom bot API error: ${res.status}`);
  }
}

export async function action({ request }) {
  if (!GITLAB_URL) {
    return json({ error: 'GITLAB_URL is not configured' }, { status: 500 });
  }
  if (!GITLAB_TOKEN) {
    return json({ error: 'GITLAB_TOKEN is not configured' }, { status: 500 });
  }

  const formData = await request.formData();
  const appName = formData.get('app_name');
  const targetBranch = formData.get('target_branch');

  if (!appName || !targetBranch) {
    return json({ error: 'app_name and target_branch are required' }, { status: 400 });
  }

  try {
    let merged = false;

    // 1. Fetch translations from DB directly
    const connection = await getDbConnection();
    let translationData;
    try {
      const translations = await getTranslations(connection, appName);
      translationData = getTranslationJson(translations);
    } finally {
      if (connection) {
        await connection.release();
      }
    }

    if (!translationData || Object.keys(translationData).length === 0) {
      return json({ error: 'No translations found for this app' }, { status: 400 });
    }

    // 2. Search for GitLab project by app_name
    const projects = await gitlabApi(`/projects?search=${encodeURIComponent(appName)}&per_page=20`);
    const project = projects.find(p => p.path === appName);
    if (!project) {
      return json({ error: `GitLab project not found for: ${appName}` }, { status: 404 });
    }
    const projectId = project.id;

    // 3. Create a new branch from target_branch
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const newBranch = `i18n/update-${timestamp}`;

    console.log(`[publish] Project: ${project.path_with_namespace} (id: ${projectId})`);
    console.log(`[publish] Creating branch ${newBranch} from ${targetBranch}...`);
    try {
      await gitlabApi(`/projects/${projectId}/repository/branches`, {
        method: 'POST',
        body: JSON.stringify({
          branch: newBranch,
          ref: targetBranch,
        }),
      });
    } catch (e) {
      throw new Error(`[Step 3: Create branch] ${e.message}`);
    }

    // 4. Commit translation files
    // 4. Check which locale files already exist in the repo
    let existingFiles = new Set();
    try {
      const tree = await gitlabApi(`/projects/${projectId}/repository/tree?path=src/locales&ref=${encodeURIComponent(targetBranch)}&per_page=100`);
      tree.forEach(f => existingFiles.add(f.path));
    } catch (e) {
      // directory doesn't exist yet, all files will be created
    }

    const actions = Object.entries(translationData).map(([lang, data]) => {
      const filePath = `src/locales/${lang}.json`;
      return {
        action: existingFiles.has(filePath) ? 'update' : 'create',
        file_path: filePath,
        content: JSON.stringify(data, null, 2) + '\n',
      };
    });

    console.log(`[publish] Committing ${actions.length} files to ${newBranch}...`);
    try {
      await gitlabApi(`/projects/${projectId}/repository/commits`, {
        method: 'POST',
        body: JSON.stringify({
          branch: newBranch,
          commit_message: `feat: update i18n translation files RE-3096`,
          actions,
        }),
      });
    } catch (e) {
      throw new Error(`[Step 4: Commit files] ${e.message}`);
    }

    // 5. Create Merge Request
    console.log(`[publish] Creating MR: ${newBranch} -> ${targetBranch}...`);
    let mr;
    try {
      mr = await gitlabApi(`/projects/${projectId}/merge_requests`, {
        method: 'POST',
        body: JSON.stringify({
          source_branch: newBranch,
          target_branch: targetBranch,
          title: `chore: update i18n translations (${timestamp})`,
          remove_source_branch: true,
        }),
      });
    } catch (e) {
      throw new Error(`[Step 5: Create MR] ${e.message}`);
    }

    // 6. Auto-merge only for test branch; main/prod just create MR
    if (targetBranch === 'test') {
      console.log(`[publish] Merging MR !${mr.iid}...`);
      const maxRetries = 3;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          await gitlabApi(`/projects/${projectId}/merge_requests/${mr.iid}/merge`, {
            method: 'PUT',
            body: JSON.stringify({
              should_remove_source_branch: true,
            }),
          });
          merged = true;
          break;
        } catch (e) {
          console.log(`[publish] Merge attempt ${i + 1} failed: ${e.message}`);
          if (i === maxRetries - 1) {
            console.error(`[publish] Auto-merge failed after ${maxRetries} attempts`);
            return json({
              success: true,
              mr_url: mr.web_url,
              merged: false,
              warning: `MR created but auto-merge failed: ${e.message}`,
            });
          }
        }
      }
    } else {
      // non-test branch: send Feishu/WeCom bot notification
      if (FEISHU_WEBHOOK) {
        console.log(`[publish] Sending Feishu bot notification for MR !${mr.iid}...`);
        try {
          await sendFeishuBotNotification(appName, targetBranch, mr.web_url);
        } catch (e) {
          console.error(`[publish] Feishu bot notification failed: ${e.message}`);
        }
      } else if (WECOM_WEBHOOK) {
        console.log(`[publish] Sending WeCom bot notification for MR !${mr.iid}...`);
        try {
          await sendWecomBotNotification(appName, targetBranch, mr.web_url);
        } catch (e) {
          console.error(`[publish] WeCom bot notification failed: ${e.message}`);
        }
      } else {
        console.warn('[publish] FEISHU_WEBHOOK/WECOM_WEBHOOK is not configured; skipping bot notification');
        return json({ success: true, mr_url: mr.web_url, merged: false });
      }
    }

    return json({ success: true, mr_url: mr.web_url, merged });
  } catch (error) {
    console.error('Publish to GitLab error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
