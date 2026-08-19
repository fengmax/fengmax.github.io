/* ============================================================
   科技新闻滚动框（右下角常驻）
   方案 B: 数据由 GitHub Actions 定时抓取到 data/news.json
   前端只读本地文件（同源，无 CORS 问题）
   独立 IIFE，ES5 风格，无依赖。加载顺序: 放最后
   ============================================================ */
(function () {
  // ---- 可配置 ----
  var NEWS_URL = './data/news.json';  // 本地 JSON（Actions 定时生成）
  var MAX_ITEMS = 12;               // 最多显示条数
  var REFRESH_MS = 10 * 60 * 1000;  // 10 分钟重新读取一次（看有没有新数据）
  var SCROLL_MS = 40000;            // 滚动一圈时长（ms）
  var MIN_SCROLL = 6;               // 少于该条数则静态展示

  var listEl = null, dotEl = null;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 相对时间
  function timeAgo(str) {
    var d = new Date(str);
    if (isNaN(d.getTime())) return '';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  // 渲染（首尾复制两份无缝滚动）
  function render(items) {
    if (!listEl) return;
    if (!items || !items.length) {
      listEl.innerHTML = '<div class="news-empty">暂无新闻，稍后自动刷新</div>';
      return;
    }
    var needScroll = items.length >= MIN_SCROLL;
    var reps = needScroll ? 2 : 1;
    var html = '';
    for (var r = 0; r < reps; r++) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        html += '<a class="news-item" href="' + esc(it.link) + '" target="_blank" rel="noopener">' +
                '<div class="news-title">' + esc(it.title) + '</div>' +
                '<div class="news-meta">' + esc(it.source) + ' · ' + esc(timeAgo(it.date)) + '</div>' +
                '</a>';
      }
    }
    var anim = needScroll ? 'animation-duration:' + SCROLL_MS + 'ms' : 'animation:none';
    listEl.innerHTML = '<div class="news-track" style="' + anim + '">' + html + '</div>';
    if (dotEl) dotEl.className = 'news-dot on';
  }

  // 读取本地 news.json（加时间戳防缓存）
  function refresh() {
    if (!listEl) return;
    fetch(NEWS_URL + '?t=' + Date.now())
      .then(function (r) { return r.json(); })
      .then(function (data) {
        render((data && data.items) || []);
      })
      .catch(function () {
        listEl.innerHTML = '<div class="news-empty">暂无新闻，稍后自动刷新</div>';
      });
  }

  function init() {
    listEl = $('news-list');
    if (!listEl) return;
    dotEl = $('news-dot');
    refresh();
    setInterval(refresh, REFRESH_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
