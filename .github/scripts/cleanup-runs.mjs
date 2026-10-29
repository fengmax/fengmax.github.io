/* ============================================================
   清理 GitHub Actions 历史运行记录
   GitHub 只支持逐条删除（UI 无批量），此脚本用 REST API 批量处理

   由 .github/workflows/cleanup-runs.yml 手动触发，使用仓库自带 GITHUB_TOKEN
   也可本地跑（需要一个有 actions:write 权限的 PAT）

   环境变量:
     GH_TOKEN      必填，有 actions:write 权限的 token
     REPO          必填，owner/name
     KEEP_DAYS     保留最近多少天（更早的删除），默认 30，可为 0（全删）
     DRY_RUN       非 'false' 时只统计不删除（默认 true，安全）
     ONLY_WORKFLOW 只处理某个 workflow（名称 / 文件名片段 / id），留空为全部

   注意：删除不可恢复；正在运行的记录不会被删除
   ============================================================ */

const API = 'https://api.github.com';
const token = process.env.GH_TOKEN;
const repo = process.env.REPO;
const keepDays = Number(process.env.KEEP_DAYS === undefined ? '30' : process.env.KEEP_DAYS);
const dryRun = String(process.env.DRY_RUN || 'true').toLowerCase() !== 'false';
const only = (process.env.ONLY_WORKFLOW || '').trim();

if (!token || !repo) {
  console.error('缺少 GH_TOKEN 或 REPO 环境变量');
  process.exit(1);
}
if (!Number.isFinite(keepDays) || keepDays < 0) {
  console.error('KEEP_DAYS 必须是 >= 0 的数字，收到: ' + process.env.KEEP_DAYS);
  process.exit(1);
}

const HEADERS = {
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'cleanup-runs'
};
const cutoff = Date.now() - keepDays * 86400000;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function api(path, method) {
  const res = await fetch(API + path, { method: method || 'GET', headers: HEADERS });
  if (res.status === 204) return null;
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get('retry-after')) || 0;
    err.body = body;
    throw err;
  }
  return body;
}

// 翻完所有页（GitHub 每页最多 100 条）
async function listAll() {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const data = await api('/repos/' + repo + '/actions/runs?per_page=100&page=' + page);
    const runs = (data && data.workflow_runs) || [];
    out.push.apply(out, runs);
    if (runs.length < 100) break;
    await sleep(120);
  }
  return out;
}

function matchWorkflow(r) {
  if (!only) return true;
  return String(r.name || '').indexOf(only) >= 0
    || String(r.path || '').indexOf(only) >= 0
    || String(r.workflow_id || '') === only;
}

async function main() {
  console.log('仓库: ' + repo);
  console.log('保留最近 ' + keepDays + ' 天，本次' + (dryRun ? '仅统计（DRY_RUN）' : '会真实删除'));
  if (only) console.log('范围: 只处理匹配 "' + only + '" 的 workflow');

  const runs = await listAll();
  console.log('共拉到运行记录: ' + runs.length + ' 条');

  const targets = runs.filter(function (r) {
    return matchWorkflow(r)
      && r.status === 'completed'
      && new Date(r.created_at).getTime() < cutoff;
  }).sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });

  // 按 workflow 分组统计，删除前先让人看清要删什么
  const byName = {};
  targets.forEach(function (r) { byName[r.name] = (byName[r.name] || 0) + 1; });
  console.log('\n待删除 ' + targets.length + ' 条:');
  Object.keys(byName).forEach(function (k) {
    console.log('  ' + k + ': ' + byName[k] + ' 条');
  });
  if (!targets.length) {
    console.log('\n没有需要删除的记录。');
    return;
  }
  console.log('时间范围: ' + targets[0].created_at + ' ~ ' + targets[targets.length - 1].created_at);

  if (dryRun) {
    console.log('\nDRY_RUN=true，未删除任何记录。设 dry_run=false 再跑一次才会真正删除。');
    return;
  }

  let ok = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const r = targets[i];
    let done = false;
    for (let attempt = 1; attempt <= 4 && !done; attempt++) {
      try {
        await api('/repos/' + repo + '/actions/runs/' + r.id, 'DELETE');
        ok++;
        done = true;
      } catch (e) {
        if (e.status === 404) { done = true; break; }          // 已被删掉
        if ((e.status === 403 || e.status === 429) && attempt < 4) {
          // 触发限流：按 Retry-After 或递增退避后重试
          const wait = e.retryAfter ? e.retryAfter * 1000 : attempt * 15000;
          console.log('  限流，' + Math.round(wait / 1000) + 's 后重试...');
          await sleep(wait);
          continue;
        }
        failed++;
        console.error('  删除失败 id=' + r.id + ' ' + e.message + ' ' + JSON.stringify(e.body).slice(0, 120));
        done = true;
      }
    }
    if ((i + 1) % 50 === 0) console.log('  进度 ' + (i + 1) + '/' + targets.length);
    await sleep(120);
  }

  console.log('\n完成: 成功删除 ' + ok + ' 条，失败 ' + failed + ' 条');
  if (failed) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('执行失败:', e.message, e.body ? JSON.stringify(e.body).slice(0, 200) : '');
  process.exitCode = 1;
});
