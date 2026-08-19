/* ============================================================
   移动端时间控制面板开合（不改动 3D 逻辑）
   独立 IIFE，无依赖
   ============================================================ */
(function () {
  var t = document.getElementById('time-toggle');
  var c = document.getElementById('time-ctl');
  if (t && c) {
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      c.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (window.innerWidth <= 768 && c.classList.contains('open')) {
        if (!c.contains(e.target) && e.target !== t) c.classList.remove('open');
      }
    });
  }
})();
