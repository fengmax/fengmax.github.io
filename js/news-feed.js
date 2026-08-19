/* ============================================================
   科技新闻滚动框（右下角常驻）
   直连为主：国外源直接 fetch（浏览器本地访问，无需代理）
   国内源（无 CORS 头）走免费代理链，失败自动跳过
   独立 IIFE，ES5 风格，无依赖。加载顺序: 放最后
   ============================================================ */
(function () {
  // ---- 可配置 ----
  // 只保留主流科技媒体（无博客/论坛/不知名站点）
  // 国外源直连（优先）；国内源标记 proxy:true 走代理（失败自动跳过）
  var SOURCES = [
    // 国际主流科技媒体（直连，失败自动跳过）
    { name: 'NASA',       url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'The Verge',  url: 'https://www.theverge.com/rss/index.xml' },
    // 国内主流科技媒体（无 CORS，走代理链）
    { name: 'IT之家', url: 'https://www.ithome.com/rss/', proxy: true },
    { name: '36氪', url: 'https://36kr.com/feed', proxy: true },
    { name: 'cnBeta', url: 'https://www.cnbeta.com.tw/backend.php', proxy: true }
  ];
  // CORS 代理链（仅国内源使用）
  var PROXIES = [
    function (u) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u); },
    function (u) { return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u); }
  ];

  var MAX_ITEMS = 12;               // 最多显示条数
  var REFRESH_MS = 10 * 60 * 1000;  // 10 分钟刷新一次
  var SCROLL_MS = 40000;            // 滚动一圈时长（ms）
  var MIN_SCROLL = 6;               // 少于该条数则静态展示

  var listEl = null, dotEl = null;
  var items = [];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 相对时间（兼容 ISO / RFC822 / 时间戳）
  function timeAgo(str) {
    var d = new Date(str);
    if (isNaN(d.getTime())) return '';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    return Math.floor(s / 86400) + ' 天前';
  }

  // --- 解析 JSON 源（Hacker News 等） ---
  // --- 解析 XML 源（RSS item / Atom entry） ---
  function parseXml(src, xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('xml parse fail');
    var out = [];
    // RSS <item> 或 Atom <entry>
    var nodes = doc.querySelectorAll('item, entry');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.querySelector('title') || {}).textContent || '';
      var l = (n.querySelector('link') || {});
      // Atom 的 link 是属性 href；RSS 是文本内容
      var href = l.getAttribute ? (l.getAttribute('href') || '') : '';
      var txt = l.textContent || '';
      var link = href || txt || '';
      var p = (n.querySelector('pubDate') || n.querySelector('published') || n.querySelector('updated') || {}).textContent || '';
      if (t && link) out.push({ title: t.trim(), link: link.trim(), date: p, source: src.name });
    }
    if (!out.length) throw new Error('empty feed');
    return out;
  }

  // 抓取单个源：国外源直连 / 国内源走代理链
  function fetchSource(src) {
    if (src.proxy) {
      var attempt = 0;
      function tryNext() {
        if (attempt >= PROXIES.length) return Promise.reject(new Error('proxy exhausted'));
        var proxyUrl = PROXIES[attempt](src.url);
        attempt++;
        return fetch(proxyUrl).then(function (r) { return r.text(); }).then(function (t) {
          return parseXml(src, t);
        }).catch(function () { return tryNext(); });
      }
      return tryNext();
    }
    return fetch(src.url).then(function (r) { return r.text(); }).then(function (t) {
      return parseXml(src, t);
    });
  }

  // 渲染（首尾复制两份无缝滚动）
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
    var reps = needScroll ? 2 : 1;
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
