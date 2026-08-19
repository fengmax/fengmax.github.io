/* ============================================================
   GitHub Actions 新闻抓取脚本（方案 B）
   Node 原生实现，零第三方依赖（Node 18+ 全局 fetch）
   抓 6 家主流科技媒体 RSS/Atom → 生成 data/news.json
   配额制：每家最多 2 条（QUOTA_PER_SOURCE），共 12 条，防止高频源霸榜
   由 .github/workflows/fetch-news.yml 定时执行

   用法: node .github/scripts/fetch-news.mjs
   输出: data/news.json  { updated, items: [{title,link,date,source}] }
   ============================================================ */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', '..', 'data', 'news.json');
const MAX_PER_SOURCE = 15;       // 每家抓取时最多取 15 条
const QUOTA_PER_SOURCE = 2;      // 最终结果每家最多 2 条（配额制，防止高频源霸榜）
const MAX_TOTAL = 12;            // 总条数上限（6 家 × 2 = 12，正好是前端显示窗口）

// ---- 源列表（科技/航天/科学气质，与前端 news-feed.js 保持一致） ----
const SOURCES = [
  { name: 'NASA',       url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
  { name: 'Space.com',  url: 'https://www.space.com/feeds/all' },
  { name: 'Phys.org',   url: 'https://phys.org/rss-feed/' },
  { name: 'The Verge',  url: 'https://www.theverge.com/rss/index.xml' },
  { name: 'IT之家',     url: 'https://www.ithome.com/rss/' },
  { name: 'cnBeta',     url: 'https://www.cnbeta.com.tw/backend.php' }
];

// 抓取文本（Node 服务端无 CORS 限制）
async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; news-fetch/1.0)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// 提取标签内容（处理 CDATA 和换行）
function tag(body, name) {
  const re = new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>');
  const m = body.match(re);
  if (!m) return '';
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

// 解析 XML：兼容 RSS <item> 和 Atom <entry>
function parseXml(xml, sourceName) {
  const out = [];
  const itemRe = /<(item|entry)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const body = m[2];
    const title = tag(body, 'title');
    // link：RSS <link>文本</link> / Atom <link href="url"/>
    let link = '';
    const hrefM = body.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/);
    if (hrefM) link = hrefM[1];
    else link = tag(body, 'link');
    // 时间：RSS pubDate / Atom published / Atom updated
    const dateRaw = tag(body, 'pubDate') || tag(body, 'published') || tag(body, 'updated');
    const date = new Date(dateRaw).toISOString();
    if (title && link && !isNaN(Date.parse(date))) {
      out.push({ title, link, date, source: sourceName });
    }
  }
  return out;
}

// 抓取一个源
async function fetchSource(src) {
  const xml = await fetchText(src.url);
  const items = parseXml(xml, src.name);
  if (!items.length) throw new Error('empty feed: ' + src.name);
  console.log('  ✓ ' + src.name + ': ' + items.length + ' 条');
  return items.slice(0, MAX_PER_SOURCE);
}

async function main() {
  console.log('抓取科技新闻: ' + SOURCES.length + ' 家源');
  // 并行抓取，单源失败跳过
  const results = await Promise.all(SOURCES.map(function (src) {
    return fetchSource(src).catch(function (e) {
      console.warn('  ✗ ' + src.name + ': ' + e.message);
      return [];
    });
  }));

  let all = [];
  results.forEach(function (arr) { all = all.concat(arr); });
  // 按时间倒序 + 去重（标题相同的只留一个）
  all.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  const seen = {};
  all = all.filter(function (it) {
    const k = it.title.slice(0, 40);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  // 配额制：按时间从新到旧取，每家最多 QUOTA_PER_SOURCE 条
  // （否则 Phys.org 这类 24h 高频源会霸占前 12 条）
  const quota = {};
  all = all.filter(function (it) {
    const used = quota[it.source] || 0;
    if (used >= QUOTA_PER_SOURCE) return false;
    quota[it.source] = used + 1;
    return true;
  });
  all = all.slice(0, MAX_TOTAL);

  const payload = {
    updated: new Date().toISOString(),
    count: all.length,
    items: all
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 1) + '\n');
  console.log('\n已写入 ' + OUT + '（' + all.length + ' 条）');
  if (!all.length) process.exitCode = 1;  // 全部失败时标记失败，让 workflow 不 commit
}

main().catch(function (e) {
  console.error('抓取失败:', e.message);
  process.exitCode = 1;
});
