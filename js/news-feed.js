/* ============================================================
   科技新闻：单条快照卡 + 进度环（右下角，方案 C）
   数据由 GitHub Actions 定时抓取到 data/news.json，前端只读本地文件（同源无 CORS）
   行为：每次显示一条，停留 5 秒，进度环倒数；悬停暂停；可收起为右下角胶囊
   独立 IIFE，ES5 风格，无依赖。加载顺序: 放最后
   ============================================================ */
(function () {
  // ---- 可配置 ----
  var NEWS_URL = './data/news.json';
  var MAX_ITEMS = 15;               // 最多条数（5 家 × 3 配额）
  var REFRESH_MS = 10 * 60 * 1000;  // 10 分钟重读一次
  var DWELL_MS = 5000;              // 每条停留 5 秒

  // 来源 → 主色（点 + 进度环统一配色）
  var SRC_COLORS = {
    'NASA': '#378add',
    'Space.com': '#ef9f27',
    'The Verge': '#d4537e',
    'IT之家': '#639922',
    'cnBeta': '#7f77dd'
  };

  var RING_C = 2 * Math.PI * 15;    // 进度环周长 r=15 ≈ 94.25

  var cardEl, dotEl, srcEl, timeEl, titleEl, countEl, ringFg, panelEl;
  var items = [];
  var idx = 0;
  var ringAnim = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function timeAgo(str) {
    var d = new Date(str);
    if (isNaN(d.getTime())) return '';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  function srcColor(s) { return SRC_COLORS[s] || '#5a6678'; }

  // 显示第 i 条 + 重启进度环
  function showItem(i) {
    if (!items.length) return;
    var it = items[i];
    if (!it) return;
    var col = srcColor(it.source);
    if (dotEl) {
      dotEl.style.background = col;
      dotEl.style.boxShadow = '0 0 8px ' + col;
    }
    if (ringFg) ringFg.style.stroke = col;
    if (srcEl) srcEl.textContent = it.source || '科技资讯';
    if (timeEl) timeEl.textContent = timeAgo(it.date);
    if (titleEl) {
      titleEl.textContent = it.title;
      titleEl.setAttribute('href', it.link || '#');
      // 重启淡入动画
      titleEl.classList.remove('in');
      void titleEl.offsetWidth;
      titleEl.classList.add('in');
    }
    if (countEl) countEl.textContent = (i + 1) + ' / ' + items.length;
    startRing();
  }

  // 进度环：5 秒匀速从满到空，结束自动换下一条
  function startRing() {
    if (!ringFg || typeof ringFg.animate !== 'function') {
      // 退化：无 Web Animations API 时用定时器
      if (ringAnim) { clearTimeout(ringAnim); }
      ringAnim = setTimeout(next, DWELL_MS);
      return;
    }
    if (ringAnim) { try { ringAnim.cancel(); } catch (e) {} }
    ringFg.style.strokeDasharray = RING_C;
    ringFg.style.strokeDashoffset = 0;
    ringAnim = ringFg.animate(
      [{ strokeDashoffset: 0 }, { strokeDashoffset: RING_C }],
      { duration: DWELL_MS, easing: 'linear', fill: 'forwards' }
    );
    ringAnim.onfinish = function () { next(); };
  }

  function next() {
    if (!items.length) return;
    idx = (idx + 1) % items.length;
    showItem(idx);
  }

  function render(data) {
    items = (data && data.items) ? data.items.slice(0, MAX_ITEMS) : [];
    idx = 0;
    if (!items.length) {
      if (titleEl) { titleEl.textContent = '暂无新闻，稍后自动刷新'; titleEl.setAttribute('href', '#'); titleEl.classList.remove('in'); }
      if (countEl) countEl.textContent = '0 / 0';
      if (timeEl) timeEl.textContent = '';
      if (srcEl) srcEl.textContent = '科技资讯';
      if (dotEl) { dotEl.style.background = '#5a6678'; dotEl.style.boxShadow = '0 0 6px rgba(90,102,120,.6)'; }
      if (ringFg) ringFg.style.stroke = 'var(--accent)';
      if (ringAnim) { try { ringAnim.cancel(); } catch (e) {} }
      return;
    }
    showItem(0);
  }

  function refresh() {
    fetch(NEWS_URL + '?t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(render)
      .catch(function () { /* 失败保留当前显示，不闪烁 */ });
  }

  // 收起 / 展开
  function initCollapse() {
    panelEl = $('news-panel');
    var collapseBtn = $('news-collapse');
    var toggleBtn = $('news-toggle');
    if (!panelEl || !collapseBtn || !toggleBtn) return;
    // 修正初始状态：面板默认展开时，展开胶囊应隐藏（避免右下角两个新闻元素重叠）
    if (!panelEl.classList.contains('hidden')) toggleBtn.classList.add('hidden');
    collapseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      panelEl.classList.add('hidden');
      toggleBtn.classList.remove('hidden');
    });
    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      panelEl.classList.remove('hidden');
      toggleBtn.classList.add('hidden');
    });
  }

  // 悬停暂停进度环（方便细读）
  function initHover() {
    if (!cardEl) return;
    cardEl.addEventListener('mouseenter', function () { if (ringAnim && typeof ringAnim.pause === 'function') { try { ringAnim.pause(); } catch (e) {} } });
    cardEl.addEventListener('mouseleave', function () { if (ringAnim && typeof ringAnim.play === 'function') { try { ringAnim.play(); } catch (e) {} } });
  }

  function init() {
    cardEl = $('news-card');
    if (!cardEl) return;
    dotEl = $('nc-dot');
    srcEl = $('nc-src');
    timeEl = $('nc-time');
    titleEl = $('nc-title');
    countEl = $('nc-count');
    ringFg = $('nc-ring-fg');
    initCollapse();
    initHover();
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
