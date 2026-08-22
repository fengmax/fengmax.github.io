/* ============================================================
   3D 场景初始化模块
   SpaceKit Simulation 创建 / 太阳3D化 / 银河天空盒 /
   行星创建(大气/法线/环) / 视觉增强(法线注入/镜面/银河星尘)
   挂载到全局: viz, objects, hideLoading, enhancePlanets, enhanceSky
   依赖: Spacekit (build/spacekit.js), PLANETS (planets-data.js)
   ============================================================ */

var viz = null;
var objects = {};

function hideLoading() {
  var l = document.getElementById('loading');
  if (l) l.style.display = 'none';
  // 触发 UI 淡入 + 星芒层显现
  document.body.classList.add('loaded');
}
// 不再用固定 600ms/2000ms 计时器隐藏加载层（慢网下 spacekit.js 还没下完就露出空白黑页，像卡死）；
// 改为 viz 创建完成、渲染首帧后再隐藏；window.load 兜底
window.addEventListener('load', hideLoading);

try {
  // 使用当前本地时间作为模拟起点
  var startDate = new Date();

  viz = new Spacekit.Simulation(document.getElementById('main-container'), {
    basePath: './',
    unitsPerAu: 100.0,
    camera: { initialPosition: [150, 110, 220], enableDrift: true },
    startDate: startDate,
  });

  viz.createAmbientLight();
  viz.createLight([0, 0, 0]);
  objects.sun = viz.createObject('sun', Spacekit.SpaceObjectPresets.SUN);

  // 替换默认 SUN 精灵贴图 (Spacekit 内置 lensflare0.png 带放射光芒+大黄光晕, 偏黄外圈突兀)
  // 保留原 sprite mesh(scale/position/renderOrder), 只换 material.map
  // 换成程序生成的干净白核: 纯白内核 + 极短柔光(暖白偏冷, 0 黄偏, 0 十字光芒)
  try {
    var TSun = (window.THREE || Spacekit.THREE);
    if (objects.sun && objects.sun._object3js && TSun) {
      // === 关键: 先完整建好新对象, 任何步骤失败都保持旧 mesh 在位 ===
      // 阶段 1: 创建新 mesh (内部抛错也安全, 旧 mesh 仍挂在 scene)
      var SUN_RADIUS = 2.0;
      var SCAN_SIZE = 512;
      var sunCanvas = document.createElement('canvas');
      sunCanvas.width = sunCanvas.height = SCAN_SIZE;
      var sctx = sunCanvas.getContext('2d');
      var cx = SCAN_SIZE / 2, cy = SCAN_SIZE / 2;
      var baseGrd = sctx.createRadialGradient(cx, cy, 0, cx, cy, SCAN_SIZE / 2);
      baseGrd.addColorStop(0,    '#FFE848');
      baseGrd.addColorStop(0.55, '#FFD400');
      baseGrd.addColorStop(0.9,  '#FFB000');
      baseGrd.addColorStop(1,    '#FF9000');
      sctx.fillStyle = baseGrd;
      sctx.fillRect(0, 0, SCAN_SIZE, SCAN_SIZE);
      for (var i = 0; i < 280; i++) {
        var dx = Math.random() * SCAN_SIZE, dy = Math.random() * SCAN_SIZE;
        var dr = 4 + Math.random() * 14;
        var da = (0.05 + Math.random() * 0.10).toFixed(2);
        sctx.fillStyle = 'rgba(190, 110, 0, ' + da + ')';
        sctx.beginPath(); sctx.arc(dx, dy, dr, 0, Math.PI * 2); sctx.fill();
      }
      for (var j = 0; j < 480; j++) {
        var lx = Math.random() * SCAN_SIZE, ly = Math.random() * SCAN_SIZE;
        var lr = 1.5 + Math.random() * 4;
        var la = (0.08 + Math.random() * 0.16).toFixed(2);
        sctx.fillStyle = 'rgba(255, 252, 200, ' + la + ')';
        sctx.beginPath(); sctx.arc(lx, ly, lr, 0, Math.PI * 2); sctx.fill();
      }
      var sunTex = new TSun.CanvasTexture(sunCanvas);
      sunTex.encoding = TSun.sRGBEncoding;
      var sunCoreGeo = new TSun.SphereGeometry(SUN_RADIUS, 64, 64);
      var sunCoreMat = new TSun.MeshBasicMaterial({ map: sunTex });
      var sunCore = new TSun.Mesh(sunCoreGeo, sunCoreMat);

      // 光晕 sprite: 加大 sprite 尺寸让 home 远景下也能看到
      var GLOW_SCALE = SUN_RADIUS * 2 * 3.0;
      var glowCanvas = document.createElement('canvas');
      glowCanvas.width = glowCanvas.height = 256;
      var gctx = glowCanvas.getContext('2d');
      var gcx = 128, gcy = 128;
      var glowGrd = gctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, 128);
      glowGrd.addColorStop(0,    'rgba(255, 230, 120, 1.00)');
      glowGrd.addColorStop(0.20, 'rgba(255, 215, 85, 1.00)');
      glowGrd.addColorStop(0.45, 'rgba(255, 195, 50, 1.00)');
      glowGrd.addColorStop(0.70, 'rgba(255, 175, 25, 0.60)');
      glowGrd.addColorStop(1,    'rgba(255, 160, 0, 0)');
      gctx.fillStyle = glowGrd;
      gctx.fillRect(0, 0, 256, 256);
      var glowTex = new TSun.CanvasTexture(glowCanvas);
      glowTex.encoding = TSun.sRGBEncoding;
      var glowMat = new TSun.SpriteMaterial({
        map: glowTex, color: 0xffffff,
        blending: TSun.AdditiveBlending,
        depthWrite: false, transparent: true,
        depthTest: false
      });
      var sunGlow = new TSun.Sprite(glowMat);
      sunGlow.scale.set(GLOW_SCALE, GLOW_SCALE, 1);

      var sunGroup = new TSun.Group();
      sunGroup.add(sunCore);
      sunGroup.add(sunGlow);
      sunGroup.position.set(0, 0, 0);
      sunGroup.renderOrder = -1;

      // 阶段 2: 新对象已就绪, 现在安全挂到 scene 并接管引用
      viz.getScene().add(sunGroup);
      var oldSunMesh = objects.sun._object3js;
      objects.sun._object3js = sunGroup;  // 接管

      // 阶段 3: 清理旧 mesh (单独 try, 失败也不影响新 mesh)
      if (oldSunMesh && oldSunMesh.parent) {
        try { oldSunMesh.parent.remove(oldSunMesh); } catch (e) {}
      }
      if (oldSunMesh && oldSunMesh.material) {
        try { oldSunMesh.material.dispose(); } catch (e) {}
      }
      if (oldSunMesh && oldSunMesh.material && oldSunMesh.material.map) {
        try { oldSunMesh.material.map.dispose(); } catch (e) {}
      }
    }
  } catch (e) { console.warn('太阳 3D 化失败:', e && e.message); }

  // 银河天空盒：SpaceKit 内置 createSkybox(equirect 全景球)。
  try {
    viz.createSkybox({
      textureUrl: './assets/skybox/eso_milkyway.webp',
      longitudeOffsetDeg: 180,
      mirrorLongitude: true
    });
  } catch (e) {
    console.warn('skybox 加载失败，回退点星星空:', e);
    try { viz.createStars(); } catch (e2) {}
  }

  // 官方大气语法: atmosphere = { enable, color } 由 SpaceKit renderFullAtmosphere() 自动渲染
  var ATM = {
    mercury: { color: 0xb8b8c0, outer: 0.05 },   // 水星: 极稀薄外逸层, 淡色薄层
    earth:   { color: 0x5b9bff },
    venus:   { color: 0xe8c27a },
    mars:    { color: 0xff7a4a },
    jupiter: { color: 0xd8b48a },
    saturn:  { color: 0xe8d6a8 },
    uranus:  { color: 0x9fe6e6 },
    neptune: { color: 0x5a7bff }
  };

  var SUN_DIAMETER_KM = 1392000,
    SUN_RADIUS = 60,
    BOOST = 3;

  PLANETS.forEach(function(p) {
    if (p.key === 'sun') return;
    var preset = Spacekit.SpaceObjectPresets[p.key.toUpperCase()];
    if (!preset) return;
    var finalRadius = Math.max(SUN_RADIUS * (p.diameter / SUN_DIAMETER_KM) * BOOST, 0.6);
    var radiusToPass = finalRadius / 100;
    var obj = null;

    if (p.key === 'moon') {
      try {
        var earthFinal = Math.max(SUN_RADIUS * (12742 / SUN_DIAMETER_KM) * BOOST, 0.6);
        var moonRadiusScaled = (earthFinal / 100) * (3475 / 12742);
        var moonR = Math.max(moonRadiusScaled, 0.003);
        obj = viz.createSphere(p.key, {
          textureUrl: './assets/textures/moon-hi.webp',
          radius: moonR,
        });
        if (obj) {
          try {
            var meshes = obj.get3jsObjects && obj.get3jsObjects();
            if (meshes && meshes[0]) {
              meshes[0].position.set(0, 0, 0);
            }
          } catch (e) {}
        }
      } catch (e) {
        try { obj = viz.createObject(p.key, preset); } catch (e2) { obj = null; }
      }
    } else {
      try {
        var sphereOpts = {
          textureUrl: './assets/textures/' + p.key + '-hi.webp',
          radius: radiusToPass,
          ephem: preset.ephem,
          levelsOfDetail: [{ radii: 0, segments: 48 }, { radii: 40, segments: 24 }, { radii: 80, segments: 12 }],
          labelText: p.label
        };
        if (ATM[p.key]) {
          sphereOpts.atmosphere = { enable: true, color: ATM[p.key].color };
          if (ATM[p.key].inner) sphereOpts.atmosphere.innerSizeRatio = ATM[p.key].inner;
          if (ATM[p.key].outer) sphereOpts.atmosphere.outerSizeRatio = ATM[p.key].outer;
        }
        if (p.key === 'saturn') sphereOpts.axialTilt = 26.7;
        if (p.key === 'uranus') sphereOpts.axialTilt = 97.8;
        obj = viz.createSphere(p.key, sphereOpts);
        if (obj && p.key === 'saturn') {
          try {
            if (typeof obj.addRings === 'function') {
              obj.addRings(74500, 136800, './assets/textures/saturn-ring-alpha.png', 160);
            }
          } catch (e) {}
        }
      } catch (e) {
        try { obj = viz.createObject(p.key, Object.assign({}, preset, { labelText: p.label })); } catch (e2) { obj =
          null; }
      }
    }
    if (obj) objects[p.key] = obj;
  });

  try { viz.setJdPerSecond(1 / 86400); } catch (e) {}
  window.THREE = Spacekit.THREE;

  // 场景结构已就绪（太阳/行星球体/轨道线），渲染首帧后隐藏加载层，避免慢网下长时间空白页
  requestAnimationFrame(function () { try { hideLoading(); } catch (e) {} });

  // ===== 行星视觉增强：法线贴图 + 地球云层 + 大气辉光 =====
  // 仅依赖已暴露的 window.THREE, 不改动 SpaceKit 任何内部逻辑
  function enhancePlanets() {
    var T = window.THREE;
    if (!T || !viz || !objects) return;
    var loader = new T.TextureLoader();

    // 法线强度分行星(岩石星立体感强, 气态星顺滑弱)
    var NSTR = { moon: 0, mercury: 1.0, mars: 1.0, venus: 0.6, earth: 0.85, jupiter: 0.4, saturn: 0.4, uranus: 0.4, neptune: 0.4 };

    // 按大气类型分档的环境光(无大气 = 硬阴影, 厚大气 = 天光散射填亮暗部)
    var AMBIENT_BY_KEY = { moon: 0.05, mercury: 0.05, mars: 0.08, venus: 0.18, earth: 0.18, jupiter: 0.16, saturn: 0.16, uranus: 0.16, neptune: 0.16 };
    var ambientForKey = function (k) { return (AMBIENT_BY_KEY[k] !== undefined ? AMBIENT_BY_KEY[k] : 0.15); };

    var AUG_FRAG = [
      'uniform sampler2D sphereTexture;',
      'uniform sampler2D normalMap;',
      'uniform float useNormal;',
      'uniform float normalScale;',
      'uniform sampler2D specularMap;',
      'uniform float useSpec;',
      'uniform float specStrength;',
      'uniform float shininess;',
      'uniform float ambientLight;',
      'uniform float cloudDrift;',
      'uniform float bandAmpl;',
      'varying vec2 vUv;',
      'varying vec3 vViewPosition;',
      'varying vec3 vViewLightPos;',
      'varying vec3 vNormal;',
      'vec3 perturbNormal(vec3 N, vec3 V, vec2 uv, vec3 mapN){',
      '  vec3 dp1 = dFdx(V); vec3 dp2 = dFdy(V);',
      '  vec2 duv1 = dFdx(uv); vec2 duv2 = dFdy(uv);',
      '  vec3 dp2perp = cross(dp2, N); vec3 dp1perp = cross(N, dp1);',
      '  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;',
      '  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;',
      '  float invmax = inversesqrt(max(dot(T,T), dot(B,B)));',
      '  mat3 TBN = mat3(T * invmax, B * invmax, N);',
      '  return normalize(TBN * mapN);',
      '}',
      'void main() {',
      '  vec3 N = normalize(vNormal);',
      '  if (useNormal > 0.5) {',
      '    vec3 mapN = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;',
      '    mapN.xy *= normalScale;',
      '    N = perturbNormal(N, -vViewPosition, vUv, mapN);',
      '  }',
      '  vec3 L = normalize(vViewLightPos - vViewPosition);',
      '  float lambertian = max(dot(N, L), 0.0);',
      '  vec2 texUv = vUv;',
      '  if (abs(cloudDrift) > 0.0001) {',
      '    float shear = 1.0 - abs(vUv.y - 0.5) * 2.0;',
      '    texUv.x = fract(vUv.x + cloudDrift * shear);',
      '  }',
      '  vec3 color = texture2D(sphereTexture, texUv).rgb * (ambientLight + (1.0 - ambientLight) * lambertian);',
      '  if (abs(bandAmpl) > 0.0001) {',
      '    float band = 0.5 + 0.5 * sin(vUv.y * 30.0 + cloudDrift * 8.0);',
      '    color *= 1.0 - bandAmpl * 0.5 + bandAmpl * band;',
      '  }',
      '  if (useSpec > 0.5) {',
      '    float specMask = texture2D(specularMap, vUv).r;',
      '    vec3 V = normalize(-vViewPosition);',
      '    vec3 H = normalize(L + V);',
      '    float s = pow(max(dot(N, H), 0.0), shininess) * specStrength * specMask;',
      '    color += vec3(s);',
      '  }',
      '  gl_FragColor = vec4(color, 1.0);',
      '}'
    ].join('\n');

    // 避免 null sampler 警告用的占位贴图
    var dummyNormal = new T.DataTexture(new Uint8Array([128,128,255,255]), 1, 1, T.RGBAFormat);
    dummyNormal.needsUpdate = true;
    var dummySpec = new T.DataTexture(new Uint8Array([0,0,0,255]), 1, 1, T.RGBAFormat);
    dummySpec.needsUpdate = true;

    function getRoot(key) {
      try {
        var o = objects[key];
        if (!o || !o.get3jsObjects) return null;
        var arr = o.get3jsObjects();
        return (arr && arr[0]) ? arr[0] : null;
      } catch (e) { return null; }
    }
    function collectMeshes(root) {
      var out = [];
      if (!root || !root.traverse) return out;
      root.traverse(function (c) { if (c.isMesh && c.material) out.push(c); });
      return out;
    }
    function loadTex(url, cb) {
      loader.load(url, function (tex) { try { cb(tex); } catch (e) {} },
                         undefined, function () {});
    }
    // 法线/镜面贴图延迟加载：给行星主贴图(-hi, 决定"看得见纹理")留 ~1s 带宽先行窗口；
    // 法线/镜面是视觉增强，晚一点加载不影响行星出现。用固定 setTimeout（requestIdleCallback 在下载期主线程 idle 会立即触发，等于没延迟）
    var deferLoad = function (fn) { setTimeout(fn, 1000); };

    Object.keys(objects).forEach(function (key) {
      if (key === 'sun') return;
      var root = getRoot(key);
      var meshes = collectMeshes(root);
      if (!meshes.length) return;

      meshes.forEach(function (mesh) {
        var g = mesh.geometry;
        if (g && !g.boundingSphere) { try { g.computeBoundingSphere(); } catch (e) {} }
        var radius = (g && g.boundingSphere && g.boundingSphere.radius) ||
                     (g && g.parameters && g.parameters.radius) || 0.01;
        var mat = mesh.material;

        // A) 注入法线 / 镜面 uniform 到 SpaceKit 自带 Lambert 着色器
        if (mat && mat.uniforms && mat.uniforms.sphereTexture) {
          try {
            mat.uniforms.normalMap = { value: dummyNormal };
            mat.uniforms.useNormal = { value: 0 };
            mat.uniforms.normalScale = { value: (NSTR[key] || 0.85) };
            mat.uniforms.specularMap = { value: dummySpec };
            mat.uniforms.useSpec = { value: 0 };
            mat.uniforms.specStrength = { value: 0.35 };
            mat.uniforms.shininess = { value: 20.0 };
            mat.uniforms.ambientLight = { value: ambientForKey(key) };
            mat.uniforms.cloudDrift = { value: 0.0 };
            mat.uniforms.bandAmpl = { value: 0.0 };
            mat.fragmentShader = AUG_FRAG;
            mat.extensions = Object.assign({}, mat.extensions, { derivatives: true });
            mat.needsUpdate = true;
          } catch (e) {}
        }

        // B) 法线贴图(延迟加载: 给 -hi 主贴图留 ~1s 带宽先行窗口, 法线是增强项晚一点不影响行星出现)
        deferLoad(function () {
          loadTex('./assets/textures/' + key + '-normal.webp', function (tex) {
            try {
              if (T.NoColorSpace) tex.colorSpace = T.NoColorSpace;
              else if (T.LinearSRGBColorSpace) tex.colorSpace = T.LinearSRGBColorSpace;
              var m = mesh.material;
              if (m && m.uniforms && m.uniforms.normalMap) {
                m.uniforms.normalMap.value = tex;
                m.uniforms.useNormal.value = 1;
                m.needsUpdate = true;
              } else if (m && m.normalMap !== undefined) {
                m.normalMap = tex;
                if (m.normalScale && m.normalScale.set) m.normalScale.set(NSTR[key] || 0.85, NSTR[key] || 0.85);
                m.needsUpdate = true;
              }
            } catch (e) {}
          });
        });
      });

      // 地球专属: 海洋镜面高光(云层已按要求移除)
      if (key === 'earth') {
        meshes.forEach(function (mesh) {
          var m = mesh.material;
          if (m && m.uniforms && m.uniforms.specularMap) {
            loadTex('./assets/textures/earth-specular.webp', function (tex) {
              try {
                if (T.NoColorSpace) tex.colorSpace = T.NoColorSpace;
                else if (T.LinearSRGBColorSpace) tex.colorSpace = T.LinearSRGBColorSpace;
                var mm = mesh.material;
                if (mm && mm.uniforms && mm.uniforms.specularMap) {
                  mm.uniforms.specularMap.value = tex;
                  mm.uniforms.useSpec.value = 1;
                  mm.needsUpdate = true;
                }
              } catch (e) {}
            });
          }
        });
      }
    });
  }

  // ===== 天空氛围: 银河星尘(淡色粒子, 增加太空纵深, 不眩目) =====
  function enhanceSky() {
    var T = window.THREE;
    if (!T || !viz || !objects) return;
    try {
      var scene = (typeof viz.getScene === 'function') ? viz.getScene() : null;
      if (scene && T.BufferGeometry && T.Points) {
        var N = 800;
        var positions = new Float32Array(N * 3);
        for (var i = 0; i < N; i++) {
          var ang = Math.random() * Math.PI * 2;
          var r = 900 + Math.random() * 500;
          var th = (Math.random() - 0.5) * 200;
          positions[i * 3] = Math.cos(ang) * r;
          positions[i * 3 + 1] = th;
          positions[i * 3 + 2] = Math.sin(ang) * r;
        }
        var geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(positions, 3));
        var pmat = new T.PointsMaterial({
          color: 0xc8d4ee, size: 2.0, sizeAttenuation: true,
          transparent: true, opacity: 0.24,
          blending: T.AdditiveBlending, depthWrite: false
        });
        var dust = new T.Points(geo, pmat);
        dust.name = 'galaxy-dust';
        scene.add(dust);
      }
    } catch (e) {}
  }
  try { enhancePlanets(); } catch (e) { console.error('enhancePlanets failed:', e); }
  try { enhanceSky(); } catch (e) { console.error('enhanceSky failed:', e); }

} catch (err) {
  console.error('3D初始化失败:', err);
  hideLoading();
}
