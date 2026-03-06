import { json } from '@remix-run/node';
import { getDbConnection, getTranslations } from '../service/i18n';

const GITLAB_URL = process.env.GITLAB_URL || 'https://gitlab.kanjian.com';
const GITLAB_TOKEN = process.env.GITLAB_TOKEN || '';

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

export async function action({ request }) {
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
      let merged = false;
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
            return json({ success: true, mr_url: mr.web_url, warning: `MR created but auto-merge failed: ${e.message}` });
          }
        }
      }
    } else {
      // non-test branch: send WeChat bot notification
      console.log(`[publish] Sending WeChat bot notification for MR !${mr.iid}...`);
      try {
        await fetch('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=02127a59-7a3c-41b8-89c4-87293a240828', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
              content: `**i18n 翻译发布通知**\n>项目: <font color="info">${appName}</font>\n>目标分支: <font color="warning">${targetBranch}</font>\n>MR: ${mr.web_url}\n>\n>请相关同学review后合并`,
            },
          }),
        });
      } catch (e) {
        console.error(`[publish] WeChat bot notification failed: ${e.message}`);
      }
    }

    return json({ success: true, mr_url: mr.web_url });
  } catch (error) {
    console.error('Publish to GitLab error:', error);
    return json({ error: error.message }, { status: 500 });
  }
}
