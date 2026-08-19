/* ============================================================
   交互 + 时间控制模块
   聚焦/飞行动画 / 纹理切换 / 信息面板 /
   时间控制(实时/暂停/倍速) / 自转(GMST+IAU极轴) / tick循环
   依赖: viz, objects (scene-init.js), PLANETS, PlanetDist (planets-data.js),
         THREE (window.THREE), computeMoonOrbitState (moon-orbit.js),
         formatTime, toJd, jdToDate, jdToGMST (time-utils.js)
   ============================================================ */

function iface() {
  try {
    var currentFocus = null;
    var followId = null;
    var flyAnimId = null;
    var DEFAULT_FOV = null;   // 首次聚焦时记录默认 FOV, 回全景恢复
    var moonOrbitRing = null;
    var moonOverlayEl = null;         // 月球 HTML overlay label 引用
    // 初始化月球 overlay label:取 DOM 并绑定点击 → 聚焦月球(纯文字「月球」,无 emoji)
    try {
      moonOverlayEl = document.getElementById('moon-overlay-label');
      if (moonOverlayEl) {
        moonOverlayEl.addEventListener('click', function(e) {
          e.stopPropagation();
          try { focusPlanet('moon'); } catch (er) {}
        });
      }
    } catch (e) {}

    function getObjPos(key) {
      var obj = objects[key];
      if (!obj) return null;
      try {
        var mesh = obj.get3jsObjects()[0];
        if (mesh && mesh.getWorldPosition) { var v = new THREE.Vector3();
          mesh.getWorldPosition(v); return v; }
      } catch (e) {}
      try {
        var p = objects[key].getPosition(viz.getJd ? viz.getJd() : 0);
        return new THREE.Vector3(p[0], p[1], p[2]);
      } catch (e) {}
      return null;
    }

    function stopMotion() {
      currentFocus = null;
      if (followId) { cancelAnimationFrame(followId);
        followId = null; }
      if (flyAnimId) { cancelAnimationFrame(flyAnimId);
        flyAnimId = null; }
      try { if (viz && viz.getViewer) viz.getViewer().stopFollowingObject(); } catch (e) {}
      // 关闭相机漂移:否则 SpaceKit 内部会在每帧把 cam.position 重置回漂移轨道,
      // 导致 animateTo 飞过去后立刻被拉回。聚焦行星 / 跟随时必须关漂移。
      try { if (viz && typeof viz.setCameraDrift === 'function') viz.setCameraDrift(false); } catch (e) {}
    }

    function animateTo(endPos, endTgt, dur, done) {
      var cam = viz.getViewer().get3jsCamera();
      var controls = viz.getViewer().get3jsCameraControls();
      var startPos = cam.position.clone();
      var startTgt = controls.target.clone();
      var t0 = Date.now();
      if (flyAnimId) cancelAnimationFrame(flyAnimId);

      function step() {
        var t = Math.min(1, (Date.now() - t0) / dur);
        var e = 1 - Math.pow(1 - t, 3);
        cam.position.lerpVectors(startPos, endPos, e);
        controls.target.lerpVectors(startTgt, endTgt, e);
        if (t < 1) flyAnimId = requestAnimationFrame(step);
        else if (done) done();
      }
      step();
    }

    // 压迫感飞掠: 二次贝塞尔弧线, 相机先上抛掠过行星再滑到目标位
    function flyBy(endPos, endTgt, dur, done) {
      var cam = viz.getViewer().get3jsCamera();
      var controls = viz.getViewer().get3jsCameraControls();
      var startPos = cam.position.clone();
      var startTgt = controls.target.clone();
      var t0 = Date.now();
      if (flyAnimId) cancelAnimationFrame(flyAnimId);
      var lift = (startPos.length() + endPos.length()) * 0.14;
      var mid = startPos.clone().add(endPos).multiplyScalar(0.5);
      mid.y += lift;   // 上抛弧线, 制造"掠过"感

      function step() {
        var t = Math.min(1, (Date.now() - t0) / dur);
        var e = 1 - Math.pow(1 - t, 3);
        var u = 1 - e;
        var p = new THREE.Vector3(
          u * u * startPos.x + 2 * u * e * mid.x + e * e * endPos.x,
          u * u * startPos.y + 2 * u * e * mid.y + e * e * endPos.y,
          u * u * startPos.z + 2 * u * e * mid.z + e * e * endPos.z
        );
        cam.position.copy(p);
        controls.target.lerpVectors(startTgt, endTgt, e);
        controls.update();
        if (t < 1) flyAnimId = requestAnimationFrame(step);
        else if (done) done();
      }
      step();
    }

    // 绘制/更新月球轨道环 (跟随地球 + 当前轨道平面方向)
    function ensureMoonOrbitRing(state, earthPos) {
      try {
        if (!viz || !state || !earthPos) return;
        var sceneRoot = null;
        try {
          if (typeof viz.getScene === 'function') sceneRoot = viz.getScene();
        } catch (e) {}
        if (!sceneRoot) {
          try {
            var viewer = viz.getViewer && viz.getViewer();
            if (viewer && typeof viewer.get3jsScene === 'function') sceneRoot = viewer.get3jsScene();
          } catch (e) {}
        }
        if (!sceneRoot) return;

        var N = 128;
        if (!moonOrbitRing || !moonOrbitRing.geometry || !moonOrbitRing.geometry.attributes) {
          var positions = new Float32Array((N + 1) * 3);
          var geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          var mat = new THREE.LineBasicMaterial({
            color: 0x444444,
            transparent: false,
            opacity: 1,
            depthWrite: false
          });
          moonOrbitRing = new THREE.LineLoop(geo, mat);
          moonOrbitRing.renderOrder = 5;
          moonOrbitRing.frustumCulled = false;
          sceneRoot.add(moonOrbitRing);
        }

        var argPeri = state.argPeri;
        var node = state.node;
        var incl = state.incl;
        var a = state.a, e = state.e, sqrtOneMinusE2 = state.sqrtOneMinusE2;
        var cosO = Math.cos(node), sinO = Math.sin(node);
        var cosI = Math.cos(incl), sinI = Math.sin(incl);

        var pos = moonOrbitRing.geometry.attributes.position.array;
        for (var i = 0; i <= N; i++) {
          var nu = (i / N) * Math.PI * 2;
          var cosNu = Math.cos(nu), sinNu = Math.sin(nu);
          var rRing = a * (1 - e * e) / (1 + e * cosNu);
          var uRing = nu + argPeri;
          var cosURing = Math.cos(uRing), sinURing = Math.sin(uRing);
          var dx = rRing * (cosURing * cosO - sinURing * sinO * cosI);
          var dy = rRing * (sinURing * cosO + cosURing * sinO * cosI);
          var dz = rRing * (sinURing * sinI);
          pos[i * 3 + 0] = earthPos.x + dx;
          pos[i * 3 + 1] = earthPos.y + dy;
          pos[i * 3 + 2] = earthPos.z + dz;
        }
        pos[N * 3 + 0] = pos[0];
        pos[N * 3 + 1] = pos[1];
        pos[N * 3 + 2] = pos[2];
        moonOrbitRing.geometry.attributes.position.needsUpdate = true;
        moonOrbitRing.geometry.computeBoundingSphere();
      } catch (e) {
        console.warn('Moon orbit ring update failed:', e);
      }
    }

    function planetRadius(key) {
      var DIAM = { mercury: 4879, venus: 12104, earth: 12742, moon: 3475, mars: 6779, jupiter: 139820, saturn: 116460,
        uranus: 50724, neptune: 49244 };
      if (key === 'sun') return 60;
      return Math.max(60 * ((DIAM[key] || 10000) / 1392000) * 3, 0.6);
    }

    function setMinDistFor(key) {
      try {
        var controls = viz.getViewer().get3jsCameraControls();
        var r = planetRadius(key);
        controls.minDistance = r * 1.18 + 1.5;
        controls.update();
      } catch (e) {}
    }

    function resetMinDist() {
      try {
        var controls = viz.getViewer().get3jsCameraControls();
        controls.minDistance = 2;
        controls.update();
      } catch (e) {}
    }

    function focusPlanet(key) {
      var obj = objects[key];
      if (!obj) return;
      stopMotion();
      currentFocus = key;
      var dist = Math.max(20, (PlanetDist[key] || 40));
      // 压迫感镜头: 聚焦时切广角 FOV(首次记录默认值, 回全景时恢复)
      try {
        var cam0 = viz.getViewer().get3jsCamera();
        if (DEFAULT_FOV === null) DEFAULT_FOV = cam0.fov;
        if (Math.abs(cam0.fov - 72) > 0.5) { cam0.fov = 72; cam0.updateProjectionMatrix(); }
      } catch (e) {}
      setMinDistFor(key);
      forceHiRes(key);
      showInfo(key);
      try {
        var cam = viz.getViewer().get3jsCamera();
        var controls = viz.getViewer().get3jsCameraControls();
        var pos = getObjPos(key);
        if (!pos) return;
        var dir = new THREE.Vector3(dist, dist * 0.5, dist * 0.8).normalize();
        var dest = pos.clone().add(dir.clone().multiplyScalar(dist));
        var followStart = function() { startFollow(key, dist); };
        // 弧线飞掠: 沿贝塞尔曲线上抛掠过行星, 比直线飞更有"压迫感"
        flyBy(dest, pos.clone(), 950, followStart);
      } catch (e) {}
    }

    function startFollow(key, dist) {
      currentFocus = key;

      function loop() {
        if (currentFocus !== key) return;
        try {
          var cam = viz.getViewer().get3jsCamera();
          var controls = viz.getViewer().get3jsCameraControls();
          var pos = getObjPos(key);
          if (pos && cam && controls) {
            var delta = cam.position.clone().sub(controls.target);
            if (delta.length() < 1) { delta.set(dist, dist * 0.5, dist * 0.8); }
            controls.target.copy(pos);
            cam.position.copy(pos).add(delta);
            controls.update();
          }
        } catch (e) {}
        followId = requestAnimationFrame(loop);
      }
      loop();
    }

    function goHome() {
      stopMotion();
      resetMinDist();
      // 恢复默认 FOV(退出压迫感镜头)
      try {
        var cam = viz.getViewer().get3jsCamera();
        if (DEFAULT_FOV !== null && Math.abs(cam.fov - DEFAULT_FOV) > 0.5) {
          cam.fov = DEFAULT_FOV; cam.updateProjectionMatrix();
        }
      } catch (e) {}
      try {
        var home = new THREE.Vector3(150, 110, 220);
        var origin = new THREE.Vector3(0, 0, 0);
        animateTo(home, origin, 1000, function() {
          try { viz.setCameraDrift(true); } catch (e) {}
        });
      } catch (e) {}
    }

    // 底部行星栏
    var bar = document.getElementById('planet-bar');
    PLANETS.forEach(function(p) {
      var b = document.createElement('button');
      b.className = 'pb-btn';
      b.textContent = p.label;
      b.style.borderLeftColor = p.color;
      b.addEventListener('click', function() { focusPlanet(p.key); });
      bar.appendChild(b);
    });
    var homeBtn = document.getElementById('planethome');
    if (homeBtn) homeBtn.addEventListener('click', function() { goHome(); });

    // 绑定 label 点击
    function bindLabels() {
      var labels = document.querySelectorAll('.spacekit__object-label');
      Array.prototype.forEach.call(labels, function(lb) {
        if (lb.__bound) return;
        var txt = (lb.textContent || '').replace(/\s+/g, '').trim();
        var p = null;
        for (var i = 0; i < PLANETS.length; i++) {
          if (PLANETS[i].label === txt) { p = PLANETS[i]; break; }
        }
        if (!p) return;
        lb.__bound = true;
        lb.addEventListener('click', function(ev) { ev.stopPropagation();
          focusPlanet(p.key); });
      });
    }
    bindLabels();
    setInterval(bindLabels, 400);

    // 纹理切换 (远低清/近高清)
    var texCache = {};

    function preloadTextures() {
      try {
        var loader = new THREE.TextureLoader();
        PLANETS.forEach(function(p) {
          if (p.key === 'sun') return;
          var url = './assets/textures/' + p.key + '.jpg';
          if (texCache[url]) return;
          loader.load(url, function(tex) { tex.anisotropy = 4;
            texCache[url] = tex; });
        });
      } catch (e) {}
    }
    preloadTextures();

    function setTexture(key, url, onDone) {
      var obj = objects[key];
      if (!obj) return;
      var roots = [];
      try { roots.push(obj.get3jsObjects()[0]); } catch (e) {}
      roots = roots.filter(function(r) { return r && typeof r.traverse === 'function'; });
      if (roots.length === 0) return;

      function applyTex(tex) {
        tex.anisotropy = 4;
        var replaced = 0;
        roots.forEach(function(root) {
          if (!root) return;
          try {
            root.traverse(function(n) {
              if (!n || !n.material) return;
              var mm = Array.isArray(n.material) ? n.material : [n.material];
              mm.forEach(function(mi) {
                if (!mi) return;
                try {
                  if (typeof mi.map !== 'undefined') { mi.map = tex; }
                  if (mi.uniforms && mi.uniforms.sphereTexture) { mi.uniforms.sphereTexture
                      .value = tex;
                    replaced++; }
                  mi.needsUpdate = true;
                } catch (e) {}
              });
            });
          } catch (e) {}
        });
        if (onDone) onDone();
      }
      if (texCache[url]) { applyTex(texCache[url]); return; }
      try { new THREE.TextureLoader().load(url, applyTex); } catch (e) {}
    }

    var texLoaded = {};

    function forceHiRes(key) {
      if (key === 'sun') return;
      var HI = './assets/textures/' + key + '-hi.jpg';
      setTexture(key, HI, function() { texLoaded[key] = HI; });
    }

    function checkTextures() {
      if (!viz || !viz.getViewer) return;
      var cam,
        camPos = null;
      try { cam = viz.getViewer().get3jsCamera();
        camPos = cam.position; } catch (e) { return; }
      if (!camPos) return;
      PLANETS.forEach(function(p) {
        if (p.key === 'sun') return;
        var pos = getObjPos(p.key);
        if (!pos) return;
        var d = camPos.distanceTo(pos);
        var r = planetRadius(p.key);
        var HI = './assets/textures/' + p.key + '-hi.jpg';
        var LO = './assets/textures/' + p.key + '.jpg';
        var hiThresh = Math.max(40, r * 20);
        if (d < hiThresh && texLoaded[p.key] !== HI) {
          setTexture(p.key, HI, function() { texLoaded[p.key] = HI; });
        } else if (d >= hiThresh && texLoaded[p.key] !== LO) {
          setTexture(p.key, LO, function() { texLoaded[p.key] = LO; });
        }
      });
    }
    setInterval(checkTextures, 500);

    // 信息面板
    function showInfo(key) {
      var info = null;
      for (var i = 0; i < PLANETS.length; i++) {
        if (PLANETS[i].key === key) { info = PLANETS[i]; break; }
      }
      if (!info) return;
      document.getElementById('ip-dot').style.background = info.color;
      document.getElementById('ip-dot').style.color = info.color;
      document.getElementById('ip-name').textContent = info.label;
      document.getElementById('ip-desc').textContent = info.desc;
      document.getElementById('ip-dist').textContent = (key === 'sun') ? '中心' : (key === 'moon' ? '绕地球运行' : info.au +
        ' AU（' + (info.au * 1.496) + '亿km）');
      document.getElementById('ip-earth').textContent = info.earthAU;
      document.getElementById('ip-temp').textContent = info.temp;
      document.getElementById('ip-orb').textContent = info.orb;
      document.getElementById('ip-rot').textContent = info.rot;
      document.getElementById('ip-per').textContent = info.per;
      document.getElementById('info-panel').style.display = 'block';
    }
    document.getElementById('info-close').addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('info-panel').style.display = 'none';
    });

    // ============================================================
    //  时间控制：实时/暂停/倍速  + 自转
    // ============================================================
    var currentMode = 'realtime';
    var lastJd = null;
    var timeController = {
      mode: 'realtime',
      speedDaysPerSecond: 1 / 86400,
      anchorJd: null,
      lastWallMs: Date.now()
    };

    function syncSimulationTime() {
      if (!viz) return null;
      var now = new Date();
      var anchorJd = timeController.anchorJd !== null ? timeController.anchorJd : toJd(now);
      var targetJd = anchorJd;

      if (timeController.mode !== 'pause') {
        var elapsedSeconds = (Date.now() - timeController.lastWallMs) / 1000;
        targetJd = anchorJd + elapsedSeconds * timeController.speedDaysPerSecond;
      }

      try {
        if (typeof viz.setJd === 'function') {
          try { viz.setJd(targetJd); } catch (e) {}
        }
        if (typeof viz.setJdPerSecond === 'function') {
          try { viz.setJdPerSecond(timeController.mode === 'pause' ? 0 : timeController.speedDaysPerSecond); } catch (e) {}
        } else if (typeof viz.setDate === 'function') {
          try { viz.setDate(jdToDate(targetJd)); } catch (e) {}
        }
      } catch (e) {}

      return targetJd;
    }

    // 更新模拟时间显示（始终同步真实时间）
    function updateTimeDate() {
      var el = document.getElementById('time-date');
      if (!el) return;
      el.textContent = formatTime(new Date());
    }

    function updateMoonOrbit() {
      if (!viz || !objects.earth || !objects.moon) return;
      try {
        var simJd = null;
        try {
          if (typeof viz.getJd === 'function') simJd = viz.getJd();
        } catch (e) {}
        if (simJd === null || simJd === undefined) {
          try { simJd = syncSimulationTime(); } catch (e) {}
        }
        if (simJd === null || simJd === undefined) simJd = toJd(new Date());

        var moonObj = objects.moon;
        var earthObj = objects.earth;
        var moonMesh = moonObj.get3jsObjects && moonObj.get3jsObjects()[0];
        var earthMesh = earthObj.get3jsObjects && earthObj.get3jsObjects()[0];
        if (!moonMesh || !earthMesh) return;

        // 地球当前世界位置
        var earthPos = new THREE.Vector3();
        try { earthMesh.getWorldPosition(earthPos); } catch (e) { earthPos.set(0, 0, 0); }

        // 计算月球轨道状态(开普勒根数 → 相对地球坐标 + 轨道几何)
        var state = computeMoonOrbitState(simJd);

        // 确保月球 mesh 是 scene root 的直接子节点
        try {
          var sceneRoot = null;
          try {
            if (viz && typeof viz.getScene === 'function') sceneRoot = viz.getScene();
          } catch (e) {}
          if (!sceneRoot) {
            try {
              var viewer = viz && viz.getViewer();
              if (viewer && typeof viewer.get3jsScene === 'function') sceneRoot = viewer.get3jsScene();
            } catch (e) {}
          }
          if (sceneRoot && moonMesh.parent && moonMesh.parent !== sceneRoot &&
              typeof moonMesh.parent.remove === 'function' &&
              typeof sceneRoot.add === 'function') {
            try { moonMesh.parent.remove(moonMesh); } catch (e) {}
            try { sceneRoot.add(moonMesh); } catch (e) {}
          }
        } catch (e) {}

        // 设置月球世界位置 = 地球世界位置 + (relX, relY, relZ)
        var moonWorld = new THREE.Vector3(
          earthPos.x + state.relX,
          earthPos.y + state.relY,
          earthPos.z + state.relZ
        );
        try { moonMesh.position.copy(moonWorld); } catch (e) {
          try { moonMesh.position.set(moonWorld.x, moonWorld.y, moonWorld.z); } catch (e) {}
        }

        // 同步更新月球轨道环 (state 驱动)
        ensureMoonOrbitRing(state, earthPos);

        // 确保月球可见
        try {
          moonMesh.visible = true;
          if (moonMesh.material) {
            try { moonMesh.material.opacity = 1; moonMesh.material.transparent = false; } catch (e) {}
          }
        } catch (e) {}

        // 潮汐锁定: 让月球近地面朝向地球 (applyPreciseMoonRotation 会接管更精确的版本)
        try {
          if (!usePreciseMoonRotation && moonMesh && typeof moonMesh.lookAt === 'function') {
            moonMesh.lookAt(earthPos);
          }
        } catch (e) {}

        // 月球 HTML overlay label 屏幕投影(纯文字「月球」,无 emoji)
        try {
          if (moonOverlayEl) {
            var cam = null;
            try { cam = viz && viz.getViewer && viz.getViewer().get3jsCamera(); } catch (e) {}
            if (cam && moonMesh) {
              var projV = new THREE.Vector3();
              try { moonMesh.getWorldPosition(projV); } catch (e) {}
              projV.project(cam);
              if (projV.z > 1 || projV.z < -1) {
                moonOverlayEl.classList.add('hidden');
              } else {
                var halfW = window.innerWidth * 0.5;
                var halfH = window.innerHeight * 0.5;
                var sx = projV.x * halfW + halfW;
                var sy = -projV.y * halfH + halfH;
                moonOverlayEl.style.left = sx.toFixed(1) + 'px';
                moonOverlayEl.style.top = (sy - 22).toFixed(1) + 'px';
                moonOverlayEl.classList.remove('hidden');
              }
            }
          }
        } catch (e) {}
      } catch (e) {
        // ignore
      }
    }

    // IAU 行星北极指向(J2000 赤经/赤纬,度) — 用于各行星的黄赤倾角
    var PLANET_POLES = {
      mercury: [281.01, 61.45],
      venus: [272.76, 67.16],
      mars: [317.68, 52.89],
      jupiter: [268.06, 64.50],
      saturn: [40.60, 83.54],
      uranus: [257.31, -15.18],
      neptune: [299.36, 42.95]
    };
    var planetSpinAngles = {};   // 各行星累计自转角(弧度)
    var planetTiltQuats = {};    // 各行星倾角四元数缓存

    function getPlanetTiltQuat(key) {
      if (planetTiltQuats[key]) return planetTiltQuats[key];
      var q = new THREE.Quaternion();
      var p = PLANET_POLES[key];
      if (p) {
        var a = THREE.MathUtils.degToRad(p[0]), d = THREE.MathUtils.degToRad(p[1]);
        var eps = THREE.MathUtils.degToRad(23.4392911);
        var x = Math.cos(a) * Math.cos(d), y = Math.sin(a) * Math.cos(d), z = Math.sin(d);
        var y2 = y * Math.cos(eps) + z * Math.sin(eps);
        var z2 = -y * Math.sin(eps) + z * Math.cos(eps);
        var pole = new THREE.Vector3(x, y2, z2).normalize();
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pole);
      }
      planetTiltQuats[key] = q;
      return q;
    }

    // 自转步进
    function stepSelfRotation() {
      if (!viz || !viz.getJd) return;
      var jd;
      try { jd = viz.getJd(); } catch (e) { return; }
      if (jd == null) return;
      if (lastJd == null) { lastJd = jd; return; }
      var deltaJd = jd - lastJd;
      lastJd = jd;
      if (!deltaJd || Math.abs(deltaJd) < 1e-12) return;
      PLANETS.forEach(function(p) {
        if (p.key === 'sun' || p.key === 'moon' || p.key === 'earth') return;
        var o = objects[p.key];
        if (!o) return;
        var r = p.selfrot || 0;
        if (!r) return;
        try {
          var days = r / 24;
          var dAng = (2 * Math.PI) * deltaJd / days * (p.selfdir || 1);
          var mesh = o.get3jsObjects()[0];
          if (mesh && mesh.quaternion) {
            planetSpinAngles[p.key] = ((planetSpinAngles[p.key] || 0) + dAng) % (2 * Math.PI);
            var qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), planetSpinAngles[p.key]);
            var q = getPlanetTiltQuat(p.key).clone().multiply(qSpin);
            mesh.quaternion.copy(q);
          }
        } catch (e) {}
      });
    }

    function setTimeMode(mode) {
      currentMode = mode;
      timeController.mode = mode;
      var slider = document.getElementById('t-slider');
      var now = new Date();

      if (mode === 'pause') {
        timeController.speedDaysPerSecond = 0;
        timeController.anchorJd = timeController.anchorJd !== null ? timeController.anchorJd : toJd(now);
        timeController.lastWallMs = Date.now();
        if (viz && viz.setJdPerSecond) {
          try { viz.setJdPerSecond(0); } catch (e) {}
        }
      } else if (mode === 'realtime') {
        timeController.speedDaysPerSecond = 1 / 86400;
        timeController.anchorJd = toJd(now);
        timeController.lastWallMs = Date.now();
        if (slider) slider.value = 0;
        document.getElementById('t-val').textContent = '实时';
        if (viz && viz.setJdPerSecond) {
          try { viz.setJdPerSecond(1 / 86400); } catch (e) {}
        }
      }

      if (timeController.mode !== 'pause' && timeController.mode !== 'realtime') {
        timeController.anchorJd = (viz && typeof viz.getJd === 'function') ? viz.getJd() : toJd(now);
        timeController.lastWallMs = Date.now();
      }

      document.getElementById('t-realtime').classList.toggle('on', mode === 'realtime');
      document.getElementById('t-pause').classList.toggle('on', mode === 'pause');
      syncSimulationTime();
    }

    function applySpeed(daysPerSec) {
      if (!viz) return;
      currentMode = 'slider';
      timeController.mode = 'slider';
      timeController.speedDaysPerSecond = daysPerSec;
      timeController.anchorJd = (typeof viz.getJd === 'function') ? viz.getJd() : toJd(new Date());
      timeController.lastWallMs = Date.now();
      document.getElementById('t-realtime').classList.remove('on');
      document.getElementById('t-pause').classList.remove('on');
      try {
        if (viz.setJdPerSecond) viz.setJdPerSecond(daysPerSec);
      } catch (e) {}
      syncSimulationTime();
    }

    function fmtDays(dps) {
      if (dps >= 36525) return '每秒' + (dps / 36525).toFixed(1) + '世纪';
      if (dps >= 365.25) return '每秒' + (dps / 365.25).toFixed(1) + '年';
      if (dps >= 1) return '每秒' + (dps >= 30 ? Math.round(dps) : dps.toFixed(1)) + '天';
      var h = dps * 24;
      if (h >= 1) return '每秒' + (h >= 30 ? Math.round(h) : h.toFixed(1)) + '小时';
      var m = h * 60;
      if (m >= 1) return '每秒' + (m >= 30 ? Math.round(m) : m.toFixed(1)) + '分钟';
      return '每秒' + (m * 60).toFixed(1) + '秒';
    }

    try {
      var slider = document.getElementById('t-slider');
      if (slider) {
        slider.addEventListener('input', function() {
          var v = parseFloat(slider.value);
          if (v <= 0) { setTimeMode('realtime'); return; }
          var dps = Math.pow(10000, v / 100);
          document.getElementById('t-val').textContent = fmtDays(dps);
          applySpeed(dps);
        });
      }
      var rb = document.getElementById('t-realtime');
      if (rb) rb.addEventListener('click', function() { setTimeMode('realtime'); });
      var pb = document.getElementById('t-pause');
      if (pb) pb.addEventListener('click', function() { setTimeMode('pause'); });

      // 默认实时：以当前真实时间为锚点
      timeController.anchorJd = toJd(new Date());
      timeController.lastWallMs = Date.now();
      setTimeMode('realtime');

      var usePreciseEarthRotation = true;
      var visualEarthDayNightFixEnabled = !usePreciseEarthRotation;
      var visualEarthRotationOffsetDeg = 0;
      var usePreciseMoonRotation = true;

      // 精确地球自转：使用 sim JD -> GMST 计算地球自转角度，并保持倾角
      function applyPreciseEarthRotation(simJd) {
        if (!usePreciseEarthRotation) return;
        try {
          var earthObj = objects.earth;
          if (!earthObj) return;
          var earthMesh = earthObj.get3jsObjects && earthObj.get3jsObjects()[0];
          if (!earthMesh) return;

          var gmst = jdToGMST(simJd); // radians
          var obliquity = THREE.MathUtils.degToRad(23.4392911);

          var spinAngle = gmst + THREE.MathUtils.degToRad(visualEarthRotationOffsetDeg);
          var qSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spinAngle);
          var qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -obliquity);

          var q = qTilt.multiply(qSpin);
          earthMesh.quaternion.copy(q);
        } catch (e) {
          // ignore
        }
      }

      // 精确月球朝向：基于月球与地球在 simJd 的位置，设置月球朝向使近地面朝向地球（潮汐锁定）
      function applyPreciseMoonRotation(simJd) {
        if (!usePreciseMoonRotation) return;
        try {
          var moonObj = objects.moon;
          var earthObj = objects.earth;
          if (!moonObj || !earthObj) return;
          var moonMesh = moonObj.get3jsObjects && moonObj.get3jsObjects()[0];
          if (!moonMesh) return;

          var mp = null, ep = null;
          try { if (typeof moonObj.getPosition === 'function') mp = moonObj.getPosition(simJd); } catch (e) {}
          try { if (typeof earthObj.getPosition === 'function') ep = earthObj.getPosition(simJd); } catch (e) {}

          var moonPos = new THREE.Vector3();
          var earthPos = new THREE.Vector3();
          if (mp && mp.length >= 3 && ep && ep.length >= 3) {
            moonPos.set(mp[0], mp[1], mp[2]);
            earthPos.set(ep[0], ep[1], ep[2]);
          } else {
            try { moonMesh.getWorldPosition(moonPos); } catch (e) { return; }
            var earthMesh = earthObj.get3jsObjects && earthObj.get3jsObjects()[0];
            if (!earthMesh) return;
            try { earthMesh.getWorldPosition(earthPos); } catch (e) { return; }
          }

          var v_me = new THREE.Vector3().subVectors(earthPos, moonPos).normalize();

          var textureNoon = new THREE.Vector3(0, 0, 1);
          var qLook = new THREE.Quaternion().setFromUnitVectors(textureNoon.clone().normalize(), v_me);

          var moonObliquity = THREE.MathUtils.degToRad(1.5424);
          var qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), moonObliquity);

          var q = qLook.multiply(qTilt);
          moonMesh.quaternion.copy(q);
        } catch (e) {
          // ignore
        }
      }

      function applyQuickEarthDayNightFix() {
        if (!visualEarthDayNightFixEnabled) return;
        try {
          var earthObj = objects.earth;
          var sunObj = objects.sun;
          if (!earthObj || !sunObj) return;
          var earthMesh = earthObj.get3jsObjects && earthObj.get3jsObjects()[0];
          var sunMesh = sunObj.get3jsObjects && sunObj.get3jsObjects()[0];
          if (!earthMesh || !sunMesh) return;

          var ePos = new THREE.Vector3();
          var sPos = new THREE.Vector3();
          earthMesh.getWorldPosition(ePos);
          sunMesh.getWorldPosition(sPos);

          var sunDir = new THREE.Vector3().subVectors(sPos, ePos).normalize();

          var textureNoon = new THREE.Vector3(0, 0, 1);

          var q = new THREE.Quaternion().setFromUnitVectors(textureNoon.clone().normalize(), sunDir.clone().normalize());

          if (visualEarthRotationOffsetDeg) {
            var rz = THREE.MathUtils.degToRad(visualEarthRotationOffsetDeg);
            var qoff = new THREE.Quaternion();
            qoff.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz);
            q.multiply(qoff);
          }

          earthMesh.quaternion.copy(q);
        } catch (e) {
          // 忽略视觉修正错误
        }
      }

      function tick() {
        try { syncSimulationTime(); } catch (e) {}
        try { updateMoonOrbit(); } catch (e) {}
        try { stepSelfRotation(); } catch (e) {}
        try {
          var simJd = null;
          try { if (typeof viz.getJd === 'function') simJd = viz.getJd(); } catch (e) {}
          if (simJd === null || simJd === undefined) simJd = toJd(new Date());
          try { applyPreciseEarthRotation(simJd); } catch (e) {}
          try { applyPreciseMoonRotation(simJd); } catch (e) {}
        } catch (e) {}
        try { if (visualEarthDayNightFixEnabled) applyQuickEarthDayNightFix(); } catch (e) {}
        try { updateTimeDate(); } catch (e) {}
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);

    } catch (e) {}

  } catch (err) {
    console.error('交互失败:', err);
  }
}

// 延迟启动交互逻辑（等 3D 场景初始化完成）
setTimeout(iface, 500);
