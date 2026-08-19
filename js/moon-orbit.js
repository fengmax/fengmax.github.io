/* ============================================================
   月球轨道计算模块
   Schlyter 截断月球理论(12 黄经摄动项 + 5 黄纬项 + 2 距离项)
   与 JPL DE421 星历在 2026-2027 年 9 个日期验证,黄经最大误差 0.044°
   挂载到全局: MOON_VIS_A, MOON_A_ER, solveKeplerEquation, computeMoonOrbitState
   ============================================================ */

// 可视化基准: 半长轴 8 个场景单位 = 60.2666 地球半径(真实值)
var MOON_VIS_A = 8;        // 半长轴(可视化单位)
var MOON_A_ER = 60.2666;   // 真实半长轴(地球半径)

// 解开普勒方程: M = E - e * sin(E)   (牛顿迭代)
function solveKeplerEquation(M, e) {
  var E = M;
  for (var i = 0; i < 12; i++) {
    var f = E - e * Math.sin(E) - M;
    var fp = 1 - e * Math.cos(E);
    var dE = f / fp;
    E = E - dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

// 计算月球相对地球的位置 + 当时轨道几何 (Schlyter 截断月球理论)
//  返回坐标为 J2000 黄道系、可视化单位(MOON_VIS_A=8 对应 60.2666 地球半径);
//  与 JPL DE421 对比,2026-2027 年黄经误差 < 0.05°,月相/照明方向随之正确。
function computeMoonOrbitState(simJd) {
  var D2R = Math.PI / 180;
  var d = simJd - 2451543.5;                    // Schlyter 日数(2000 Jan 0.0)
  // 当日吻切根数(度)
  var Ndeg = (125.1228 - 0.0529538083 * d) % 360;
  var inclDeg = 5.1454;
  var wDeg = (318.0634 + 0.1643573223 * d) % 360;
  var e = 0.054900;
  var Mdeg = ((115.3654 + 13.0649929509 * d) % 360 + 360) % 360;
  // 太阳平位置(摄动角 D 需要)
  var wsDeg = (282.9404 + 4.70935e-5 * d) % 360;
  var MsDeg = ((356.0470 + 0.9856002585 * d) % 360 + 360) % 360;
  var LsDeg = (MsDeg + wsDeg) % 360;

  // 开普勒方程 → 真近点角 ν 与向径 r(地球半径)
  var M = Mdeg * D2R;
  var E = solveKeplerEquation(M, e);
  var xv = Math.cos(E) - e;
  var yv = Math.sqrt(1 - e * e) * Math.sin(E);
  var nu = Math.atan2(yv, xv);
  var rER = Math.sqrt(xv * xv + yv * yv);

  // 轨道面 → 地心黄道(当日春分点)
  var u = nu + wDeg * D2R;
  var N = Ndeg * D2R, incl = inclDeg * D2R;
  var xh = rER * (Math.cos(u) * Math.cos(N) - Math.sin(u) * Math.sin(N) * Math.cos(incl));
  var yh = rER * (Math.sin(u) * Math.cos(N) + Math.cos(u) * Math.sin(N) * Math.cos(incl));
  var zh = rER * Math.sin(u) * Math.sin(incl);
  var lon = Math.atan2(yh, xh) / D2R;
  var lat = Math.atan2(zh, Math.sqrt(xh * xh + yh * yh)) / D2R;

  // 摄动角: Lm 平黄经, D 平距角, F 升交距角
  var Lm = (Ndeg + wDeg + Mdeg) % 360;
  var D = ((Lm - LsDeg) % 360 + 360) % 360;
  var F = ((Lm - Ndeg) % 360 + 360) % 360;
  var Dr = D * D2R, Fr = F * D2R, Msr = MsDeg * D2R;

  // 主摄动项(月缩/出差/二均差等,度 / 地球半径)
  lon += -1.274 * Math.sin(M - 2 * Dr)      // 出差 (evection)
       + 0.658 * Math.sin(2 * Dr)           // 二均差 (variation)
       - 0.186 * Math.sin(Msr)              // 周年差
       - 0.059 * Math.sin(2 * M - 2 * Dr)
       - 0.057 * Math.sin(M - 2 * Dr + Msr)
       + 0.053 * Math.sin(M + 2 * Dr)
       + 0.046 * Math.sin(2 * Dr - Msr)
       + 0.041 * Math.sin(M - Msr)
       - 0.035 * Math.sin(Dr)               // 月缩 (parallactic eq.)
       - 0.031 * Math.sin(M + Msr)
       - 0.015 * Math.sin(2 * Fr - 2 * Dr)
       + 0.011 * Math.sin(M - 4 * Dr);
  lat += -0.173 * Math.sin(Fr - 2 * Dr)
       - 0.055 * Math.sin(M - Fr - 2 * Dr)
       - 0.046 * Math.sin(M + Fr - 2 * Dr)
       + 0.033 * Math.sin(Fr + 2 * Dr)
       + 0.017 * Math.sin(2 * M + Fr);
  // 距离摄动项单位是地球半径;开普勒向径 rER 是"半长轴倍数"(≈1.0),
  // 必须先乘 MOON_A_ER 换算成地球半径再加摄动项,否则月球会陷进地球里
  rER = rER * MOON_A_ER - 0.58 * Math.cos(M - 2 * Dr) - 0.46 * Math.cos(2 * Dr);

  // 当日春分点 → J2000 岁差修正(行星场景是 J2000 框架)
  var T = (simJd - 2451545.0) / 36525.0;
  lon -= (5029.0966 * T + 1.11161 * T * T) / 3600.0;

  // 可视化缩放 + 球坐标 → 直角坐标
  var scale = MOON_VIS_A / MOON_A_ER;
  var r = rER * scale;
  var lonR = lon * D2R, latR = lat * D2R;
  var relX = r * Math.cos(latR) * Math.cos(lonR);
  var relY = r * Math.cos(latR) * Math.sin(lonR);
  var relZ = r * Math.sin(latR);

  return {
    relX: relX, relY: relY, relZ: relZ,
    r: r,
    nu: nu, u: u,
    node: N, incl: incl, argPeri: wDeg * D2R,   // 吻切根数(供轨道环绘制)
    cosO: Math.cos(N), sinO: Math.sin(N),
    cosI: Math.cos(incl), sinI: Math.sin(incl),
    a: MOON_VIS_A, e: e, sqrtOneMinusE2: Math.sqrt(1 - e * e)
  };
}
