/* ============================================================
   时间工具模块
   时间格式化 + 儒略日转换 + GMST 计算
   挂载到全局: formatTime, getNow, toJd, jdToDate, jdToGMST
   ============================================================ */

// 格式化本地时间（不包含时区文字）
function formatTime(d) {
  try {
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  } catch (_) {
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var da = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return y + '-' + mo + '-' + da + ' ' + h + ':' + mi + ':' + s;
  }
}

// 当前真实时间
function getNow() {
  return new Date();
}

// Date → 儒略日 (Julian Date)
function toJd(date) {
  return (date.getTime() / 86400000) + 2440587.5;
}

// 儒略日 → Date
function jdToDate(jd) {
  return new Date((jd - 2440587.5) * 86400000);
}

// 将 Julian Date 转为 GMST（格林尼治恒星时，弧度）
// 依赖全局 THREE (由 scene-init.js 设置 window.THREE)
function jdToGMST(jd) {
  // Approximate GMST in degrees using IAU 1982 expression
  var T = (jd - 2451545.0) / 36525.0;
  var gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return THREE.MathUtils.degToRad(gmst);
}
