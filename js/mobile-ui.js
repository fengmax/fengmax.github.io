/* ============================================================
   通用 UI 切换：右上 ⏱ 按钮 + 右下 🪐 按钮
   两个面板默认收起，点击对应按钮展开/收起
   点击面板外部自动关闭（不区分桌面/移动端）
   独立 IIFE，无依赖
   ============================================================ */
(function () {
  // toggle / panel 配对
  var pairs = [
    { toggle: 'time-toggle', panel: 'time-ctl' },
    { toggle: 'planet-bar-toggle', panel: 'planet-bar' }
  ];

  var items = pairs.map(function (p) {
    return {
      toggle: document.getElementById(p.toggle),
      panel: document.getElementById(p.panel)
    };
  }).filter(function (it) { return it.toggle && it.panel; });

  // toggle 点击 → 切换 open + 关闭其他面板
  items.forEach(function (it) {
    it.toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !it.panel.classList.contains('open');
      // 互斥：打开本面板时收起其他面板
      items.forEach(function (other) {
        if (other !== it) other.panel.classList.remove('open');
      });
      it.panel.classList.toggle('open', willOpen);
    });
  });

  // 点击任意面板外部 → 收起所有打开的面板
  document.addEventListener('click', function (e) {
    items.forEach(function (it) {
      if (!it.panel.classList.contains('open')) return;
      if (!it.panel.contains(e.target) && e.target !== it.toggle) {
        it.panel.classList.remove('open');
      }
    });
  });
})();