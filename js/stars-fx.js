/* ============================================================
   星芒闪烁层：生成少量微光点（数量少+低透明度，克制不刺眼）
   随机位置与呼吸节奏，纯 DOM + CSS 动画
   独立 IIFE，无依赖
   ============================================================ */
(function () {
  var el = document.getElementById('fx-stars');
  if (!el) return;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < 26; i++) {
    var s = document.createElement('div');
    s.className = 'fx-star';
    var sz = (Math.random() * 1.6 + 0.8).toFixed(1);
    s.style.cssText =
      'left:' + (Math.random() * 100).toFixed(2) + '%;' +
      'top:' + (Math.random() * 100).toFixed(2) + '%;' +
      'width:' + sz + 'px;height:' + sz + 'px;' +
      '--delay:' + (Math.random() * 6).toFixed(2) + 's;' +
      '--dur:' + (3 + Math.random() * 4).toFixed(2) + 's;' +
      '--maxo:' + (0.25 + Math.random() * 0.5).toFixed(2) + ';';
    frag.appendChild(s);
  }
  el.appendChild(frag);
})();
