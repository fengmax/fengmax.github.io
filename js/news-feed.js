/* ============================================================
   科技新闻滚动框（右下角常驻）
   方案 A: 前端直接抓 RSS + 免费 CORS 代理（AllOrigins → codetabs）
   独立 IIFE，ES5 风格（与项目其他模块一致），无依赖
   加载顺序: 放在所有模块最后（不依赖其他模块）
   ============================================================ */
(function () {
  // ---- 可配置 ----
  // 新闻源（可增删，或替换成你喜欢的科技媒体 RSS）
  var SOURCES = [
    { name: 'IT之家', url: 'https://www.ithome.com/rss/' },
    { name: '36氪',   url: 'https://36kr.com/feed' },
    { name: 'cnBeta', url: 'https://www.cnbeta.com.tw/backend.php' }
  ];
  // CORS 代理链（依次尝试，第一个成功即用）
  var PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
  ];

  var MAX_ITEMS = 10;               // 最多显示条数
  var REFRESH_MS = 10 * 60 * 1000;  // 10 分钟刷新一次
  var SCROLL_MS = 40000;            // 滚动一圈时长（ms）
  var MIN_SCROLL = 6;               // 少于该条数则静态展示（不滚动）

  var listEl = null, dotEl = null;
  var items = [];                   // 各源结果（数组的数组）

  function $(id) { return document.getElementById(id); }

  // HTML 转义（RSS 标题可能含特殊字符）
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  // 抓取单个源（代理链 fallback）
  function fetchSource(src) {
    var attempt = 0;
    function tryNext() {
      if (attempt >= PROXIES.length) {
        return Promise.reject(new Error('proxy exhausted: ' + src.name));
      }
      var proxyUrl = PROXIES[attempt](src.url);
      attempt++;
      return fetch(proxyUrl)
        .then(function (r) { return r.text(); })
        .then(function (xmlText) {
          var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
          if (doc.querySelector('parsererror')) throw new Error('xml parse fail');
          var nodes = doc.querySelectorAll('item');
          var out = [];
          for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            var t = (n.querySelector('title') || {}).textContent || '';
            var l = (n.querySelector('link') || {}).textContent || '';
            var p = (n.querySelector('pubDate') || n.querySelector('published') || {}).textContent || '';
            if (t && l) {
              out.push({ title: t.trim(), link: l.trim(), date: p, source: src.name });
            }
          }
          if (!out.length) throw new Error('empty feed: ' + src.name);
          return out;
        })
        .catch(function () { return tryNext(); });
    }
    return tryNext();
  }

  // 渲染列表（首尾复制两份实现无缝滚动）
  function render() {
    if (!listEl) return;
    var all = [];
    items.forEach(function (arr) { all = all.concat(arr); });
    all.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    all = all.slice(0, MAX_ITEMS);

    if (!all.length) {
      listEl.innerHTML = '<div class="news-empty">暂无新闻，稍后自动刷新</div>';
      return;
    }

    var needScroll = all.length >= MIN_SCROLL;
    var reps = needScroll ? 2 : 1;   // 复制两份才能无缝循环
    var html = '';
    for (var r = 0; r < reps; r++) {
      for (var i = 0; i < all.length; i++) {
        var it = all[i];
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

  // 抓取全部源并刷新
  function refresh() {
    Promise.all(SOURCES.map(function (s) {
      return fetchSource(s).catch(function () { return []; });
    })).then(function (results) {
      items = results;
      render();
    }).catch(function () {});
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
