/* Methun Raj — Stillwater: the whole site floats on a slow, dark water
   field. One fixed canvas, two WebGL passes, zero dependencies.

   pass 1 (flow)    — a half-resolution ping-pong buffer that the pointer
                      paints into: a soft brush of influence (R) and drift
                      direction (GB), decaying every frame, so the cursor
                      leaves a wake like a hand dragged through still water.
   pass 2 (surface) — simplex-noise water, domain-warped twice so the field
                      folds over itself and reads as liquid. A five-stop
                      palette of deep blues with a rare cream crest resolves
                      out of near-black; the wake bends and swirls the
                      surface and lifts a pale-cream glow. A resting pool of
                      light leans gently toward the pointer.

   No WebGL: the page simply keeps its plain dark background.
   Reduced motion: one static frame, no listeners.
   The clock is carried through sessionStorage, so the water keeps drifting
   across page transitions instead of restarting. */
(function () {
  "use strict";

  function mount() {

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- canvas ---------- */
  var canvas = document.createElement("canvas");
  canvas.className = "water-bg";
  canvas.setAttribute("aria-hidden", "true");
  document.body.insertBefore(canvas, document.body.firstChild);

  var CTX_OPTS = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false
  };
  var gl = canvas.getContext("webgl2", CTX_OPTS) || canvas.getContext("webgl", CTX_OPTS);
  if (!gl) { canvas.parentNode.removeChild(canvas); return; }

  /* ---------- shaders ---------- */
  var QUAD_VERT = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPos * 0.5 + 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  /* The wake: gaussian brush of influence + drift direction, decaying. */
  var FLOW_FRAG = [
    "precision mediump float;",
    "varying vec2 vUv;",
    "uniform sampler2D uPrev;",
    "uniform vec2 uPointer;",   // pointer in uv (y up); far away when absent
    "uniform vec2 uVelocity;",  // smoothed velocity, uv per second
    "uniform float uDecay;",    // framerate-independent, per frame
    "uniform float uRadius;",
    "uniform float uAspect;",
    "",
    "void main() {",
    "  vec4 prev = texture2D(uPrev, vUv);",
    "  float influence = prev.r * uDecay;",
    "  vec2 dir = mix(vec2(0.5), prev.gb, uDecay);",
    "",
    "  vec2 d = vUv - uPointer;",
    "  d.x *= uAspect;",
    "  float brush = exp(-dot(d, d) / (uRadius * uRadius));",
    "",
    "  float speed = length(uVelocity);",
    "  float strength = 0.30 + min(speed * 1.35, 1.0) * 0.62;",
    "  influence = max(influence, brush * strength);",
    "",
    "  vec2 vdir = clamp(uVelocity * 0.9 + 0.5, 0.0, 1.0);",
    "  dir = mix(dir, vdir, clamp(brush * strength, 0.0, 1.0) * 0.6);",
    "",
    "  gl_FragColor = vec4(clamp(influence, 0.0, 1.0), dir, 1.0);",
    "}"
  ].join("\n");

  /* The surface: warped simplex noise resolved through a deep-blue palette.
     snoise is the standard Ashima Arts 3-D simplex (MIT licence). */
  var WATER_FRAG = [
    "precision highp float;",
    "varying vec2 vUv;",
    "uniform float uTime;",
    "uniform vec2 uResolution;",
    "uniform sampler2D uFlow;",
    "",
    "uniform vec3 uC0, uC1, uC2, uC3, uC4;",
    "uniform vec3 uGlowCore, uGlowMid, uGlowDeep;",
    "uniform vec3 uLightTint;",
    "uniform vec2 uLight;",
    "uniform float uScale;",
    "uniform float uDistort;",
    "uniform float uSwirl;",
    "uniform float uGlow;",
    "uniform float uVignette;",
    "uniform float uGrain;",
    "",
    "vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }",
    "vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }",
    "vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }",
    "",
    "float snoise(vec3 v) {",
    "  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);",
    "  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);",
    "  vec3 i = floor(v + dot(v, C.yyy));",
    "  vec3 x0 = v - i + dot(i, C.xxx);",
    "  vec3 g = step(x0.yzx, x0.xyz);",
    "  vec3 l = 1.0 - g;",
    "  vec3 i1 = min(g.xyz, l.zxy);",
    "  vec3 i2 = max(g.xyz, l.zxy);",
    "  vec3 x1 = x0 - i1 + C.xxx;",
    "  vec3 x2 = x0 - i2 + C.yyy;",
    "  vec3 x3 = x0 - D.yyy;",
    "  i = mod289(i);",
    "  vec4 p = permute(permute(permute(",
    "      i.z + vec4(0.0, i1.z, i2.z, 1.0))",
    "    + i.y + vec4(0.0, i1.y, i2.y, 1.0))",
    "    + i.x + vec4(0.0, i1.x, i2.x, 1.0));",
    "  float n_ = 0.142857142857;",
    "  vec3 ns = n_ * D.wyz - D.xzx;",
    "  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);",
    "  vec4 x_ = floor(j * ns.z);",
    "  vec4 y_ = floor(j - 7.0 * x_);",
    "  vec4 x = x_ * ns.x + ns.yyyy;",
    "  vec4 y = y_ * ns.x + ns.yyyy;",
    "  vec4 h = 1.0 - abs(x) - abs(y);",
    "  vec4 b0 = vec4(x.xy, y.xy);",
    "  vec4 b1 = vec4(x.zw, y.zw);",
    "  vec4 s0 = floor(b0) * 2.0 + 1.0;",
    "  vec4 s1 = floor(b1) * 2.0 + 1.0;",
    "  vec4 sh = -step(h, vec4(0.0));",
    "  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;",
    "  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;",
    "  vec3 p0 = vec3(a0.xy, h.x);",
    "  vec3 p1 = vec3(a0.zw, h.y);",
    "  vec3 p2 = vec3(a1.xy, h.z);",
    "  vec3 p3 = vec3(a1.zw, h.w);",
    "  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));",
    "  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;",
    "  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);",
    "  m = m * m;",
    "  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));",
    "}",
    "",
    "float fbm(vec3 p) {",
    "  float v = 0.0;",
    "  float amp = 0.55;",
    "  for (int i = 0; i < 2; i++) {",
    "    v += amp * snoise(p);",
    "    p = p * 2.04 + vec3(31.7, 11.3, 7.1);",
    "    amp *= 0.45;",
    "  }",
    "  return v;",
    "}",
    "",
    /* two-stage domain warp — the fold is what makes it liquid, not smoke */
    "vec2 waterField(vec2 p, float t) {",
    "  float n1 = snoise(vec3(p * 0.9, t * 0.050));",
    "  float n2 = snoise(vec3(p * 0.9 + vec2(5.2, 1.3), t * 0.050 + 1.7));",
    "  vec2 w1 = vec2(n1, n2) * 0.62;",
    "  vec2 q = (p + w1) * 0.8;",
    "  float n3 = snoise(vec3(q + vec2(1.7, 9.2), t * 0.042 + 3.1));",
    "  float n4 = snoise(vec3(q + vec2(8.3, 2.8), t * 0.042 + 5.9));",
    "  vec2 w2 = vec2(n3, n4) * 0.5;",
    "  vec2 r = p + w1 + w2;",
    "  float base = fbm(vec3(r * 0.62, t * 0.034));",
    "  float detail = snoise(vec3(r * 2.1 + w2, t * 0.055));",
    "  return vec2(base, detail);",
    "}",
    "",
    "void main() {",
    "  float aspect = uResolution.x / uResolution.y;",
    "  vec2 uv = vUv;",
    "  vec2 p = vec2(uv.x * aspect, uv.y) * uScale;",
    "  float t = uTime;",
    "",
    /* the wake pushes the surface along its drift and twists it a little */
    "  vec4 flow = texture2D(uFlow, uv);",
    "  float infl = flow.r;",
    "  vec2 fdir = (flow.gb - 0.5) * 2.0;",
    "  vec2 base = p;",
    "  p += fdir * infl * uDistort;",
    "  float ang = infl * uSwirl;",
    "  float cs = cos(ang), sn = sin(ang);",
    "  vec2 delta = p - base;",
    "  p += (mat2(cs, sn, -sn, cs) * delta) - delta;",
    "",
    "  vec2 field = waterField(p, t);",
    "  float n = field.x * 0.5 + 0.5;",
    "  float d = field.y * 0.5 + 0.5;",
    "",
    "  vec3 col = uC0;",
    "  col = mix(col, uC1, smoothstep(0.20, 0.68, n));",
    "  col = mix(col, uC2, smoothstep(0.52, 0.88, n + d * 0.14));",
    "  col = mix(col, uC3, smoothstep(0.66, 0.95, d + n * 0.10) * 0.42);",
    "  col = mix(col, uC4, smoothstep(0.78, 0.995, n * d * 1.7) * 0.32);",
    "",
    /* a resting pool of light that leans toward the pointer */
    "  vec2 cp = vec2(uv.x * aspect, uv.y);",
    "  vec2 lp = vec2(uLight.x * aspect, uLight.y);",
    "  float ld = distance(cp, lp);",
    "  float pool = exp(-ld * ld / 0.055) * 0.6 + exp(-ld * ld / 0.42) * 0.25;",
    "  col += uLightTint * pool * 0.11;",
    "",
    /* the wake lifts a warm glow with a cool undertow — what sells water */
    "  float g = smoothstep(0.04, 0.9, infl);",
    "  if (g > 0.001) {",
    "    float gn = snoise(vec3(p * 1.4, t * 0.09)) * 0.5 + 0.5;",
    "    vec3 glowCol = mix(uGlowDeep, uGlowMid, smoothstep(0.0, 0.85, infl));",
    "    glowCol = mix(glowCol, uGlowCore, gn * smoothstep(0.30, 1.0, infl));",
    "    col = mix(col, glowCol, g * uGlow);",
    "  }",
    "",
    /* vignette, then grain — mostly so the near-blacks never band */
    "  vec2 vc = uv - 0.5;",
    "  col *= 1.0 - uVignette * dot(vc, vc) * 2.4;",
    "  float gt = fract(uTime) * 61.7;",
    "  float grain = fract(sin(dot(gl_FragCoord.xy + vec2(gt, gt * 0.73), vec2(12.9898, 78.233))) * 43758.5453);",
    "  col += (grain - 0.5) * uGrain;",
    "",
    "  gl_FragColor = vec4(col, 1.0);",
    "}"
  ].join("\n");

  /* ---------- palette — deep water under ink ----------
     Blue-family water with a rare cream crest, in the same register as the
     reference the design was tuned against — but every stop shifted to sit
     with this site's ink and stay a touch darker at rest. */
  function hex(hexStr) {
    var n = parseInt(hexStr.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  var PALETTE = {
    stops: ["#020409", "#0e2246", "#1c4173", "#35598c", "#e8d19c"].map(hex),
    glowCore: hex("#f8eec9"),
    glowMid: hex("#4c82ba"),
    glowDeep: hex("#24407c"),   /* deep blue undertow of the wake */
    lightTint: hex("#55719c")
  };

  var TUNE = {
    scale: 1.55,       /* noise scale over the viewport */
    distort: 0.42,     /* how hard the wake pushes the surface */
    swirl: 1.15,       /* wake twist, radians at full influence */
    glow: 0.5,         /* wake glow strength */
    vignette: 0.42,
    grain: 0.014,
    brushRadius: 0.085,
    decayPerFrame: 0.93, /* at 60fps */
    lightAnchor: { x: 0.76, y: 0.66 },
    lightFollow: 0.16
  };

  /* ---------- GL plumbing ---------- */
  function compile(type, src) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Stillwater shader:", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }
  function link(vertSrc, fragSrc) {
    var vs = compile(gl.VERTEX_SHADER, vertSrc);
    var fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return null;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("Stillwater link:", gl.getProgramInfoLog(prog));
      return null;
    }
    return prog;
  }
  function uniformsOf(prog) {
    var out = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(prog, i);
      var name = info.name.replace("[0]", "");
      out[name] = gl.getUniformLocation(prog, name);
    }
    return out;
  }

  var flowProg, flowU, waterProg, waterU, quadBuf;
  var sim = { size: [0, 0], tex: [null, null], fbo: [null, null], read: 0 };

  function boot() {
    flowProg = link(QUAD_VERT, FLOW_FRAG);
    waterProg = link(QUAD_VERT, WATER_FRAG);
    if (!flowProg || !waterProg) {
      /* shaders failed — leave the plain background in place */
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      gl = null;
      return false;
    }
    flowU = uniformsOf(flowProg);
    waterU = uniformsOf(waterProg);

    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    allocSim();
    applySize();
    return true;
  }

  function makeSimTarget(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    /* neutral state: no influence, direction at rest */
    gl.clearColor(0, 0.5, 0.5, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex: tex, fbo: fbo };
  }

  function allocSim() {
    var w = Math.max(64, Math.round(window.innerWidth * 0.5));
    var h = Math.max(64, Math.round(window.innerHeight * 0.5));
    w = Math.min(w, 1024); h = Math.min(h, 1024);
    if (sim.size[0] === w && sim.size[1] === h && sim.tex[0]) return;
    for (var i = 0; i < 2; i++) {
      if (sim.tex[i]) { gl.deleteTexture(sim.tex[i]); gl.deleteFramebuffer(sim.fbo[i]); }
      var t = makeSimTarget(w, h);
      sim.tex[i] = t.tex; sim.fbo[i] = t.fbo;
    }
    sim.size = [w, h];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ---------- sizing & adaptive quality ---------- */
  var quality = 1;                 /* 1 → 0.66 under sustained load */
  var MAX_BACKING_WIDTH = 2200;

  function backingScale() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    return Math.min(dpr, MAX_BACKING_WIDTH / Math.max(window.innerWidth, 1)) * quality;
  }
  function applySize() {
    if (!gl) return;
    var s = backingScale();
    var w = Math.max(2, Math.round(window.innerWidth * s));
    var h = Math.max(2, Math.round(window.innerHeight * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    allocSim();
  }

  /* ---------- pointer → wake ---------- */
  var target = { x: -10, y: -10 };
  var smooth = { x: -10, y: -10 };
  var vel = { x: 0, y: 0 };
  var away = true;
  var simHeat = 0;               /* skips the sim pass once the wake is gone */
  var light = { x: TUNE.lightAnchor.x, y: TUNE.lightAnchor.y };

  function pointerUv(e) {
    target.x = e.clientX / Math.max(window.innerWidth, 1);
    target.y = 1 - e.clientY / Math.max(window.innerHeight, 1);
    if (away) { smooth.x = target.x; smooth.y = target.y; vel.x = 0; vel.y = 0; away = false; }
    simHeat = 1;
  }
  function pointerGone() { target.x = -10; target.y = -10; away = true; }

  function stepPointer(dt) {
    var k = 1 - Math.exp(-dt * 8);
    if (target.x > -5) {
      var nx = smooth.x + (target.x - smooth.x) * k;
      var ny = smooth.y + (target.y - smooth.y) * k;
      vel.x = (nx - smooth.x) / dt;
      vel.y = (ny - smooth.y) / dt;
      var mag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (mag > 2.5) { vel.x *= 2.5 / mag; vel.y *= 2.5 / mag; }
      smooth.x = nx; smooth.y = ny;
    }
    /* the light pool leans toward the pointer, slowly */
    var lx = TUNE.lightAnchor.x, ly = TUNE.lightAnchor.y;
    if (target.x > -5) {
      lx += (target.x - lx) * TUNE.lightFollow;
      ly += (target.y - ly) * TUNE.lightFollow;
    }
    var lk = 1 - Math.exp(-dt * 1.6);
    light.x += (lx - light.x) * lk;
    light.y += (ly - light.y) * lk;
  }

  /* ---------- passes ---------- */
  function bindQuad(prog) {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    var loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  function stepFlow(dt) {
    if (simHeat < 0.004) return;             /* wake fully decayed — rest */
    var decay = Math.pow(TUNE.decayPerFrame, dt * 60);
    simHeat *= decay;
    var write = 1 - sim.read;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.fbo[write]);
    gl.viewport(0, 0, sim.size[0], sim.size[1]);
    bindQuad(flowProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.tex[sim.read]);
    gl.uniform1i(flowU.uPrev, 0);
    gl.uniform2f(flowU.uPointer, away ? -10 : smooth.x, away ? -10 : smooth.y);
    gl.uniform2f(flowU.uVelocity, vel.x, vel.y);
    gl.uniform1f(flowU.uDecay, decay);
    gl.uniform1f(flowU.uRadius, TUNE.brushRadius);
    gl.uniform1f(flowU.uAspect, window.innerWidth / Math.max(window.innerHeight, 1));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    sim.read = write;
  }

  function renderSurface(t) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    bindQuad(waterProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sim.tex[sim.read]);
    gl.uniform1i(waterU.uFlow, 0);
    gl.uniform1f(waterU.uTime, t);
    gl.uniform2f(waterU.uResolution, canvas.width, canvas.height);
    var stops = PALETTE.stops;
    gl.uniform3fv(waterU.uC0, stops[0]);
    gl.uniform3fv(waterU.uC1, stops[1]);
    gl.uniform3fv(waterU.uC2, stops[2]);
    gl.uniform3fv(waterU.uC3, stops[3]);
    gl.uniform3fv(waterU.uC4, stops[4]);
    gl.uniform3fv(waterU.uGlowCore, PALETTE.glowCore);
    gl.uniform3fv(waterU.uGlowMid, PALETTE.glowMid);
    gl.uniform3fv(waterU.uGlowDeep, PALETTE.glowDeep);
    gl.uniform3fv(waterU.uLightTint, PALETTE.lightTint);
    gl.uniform2f(waterU.uLight, light.x, light.y);
    gl.uniform1f(waterU.uScale, TUNE.scale);
    gl.uniform1f(waterU.uDistort, TUNE.distort);
    gl.uniform1f(waterU.uSwirl, TUNE.swirl);
    gl.uniform1f(waterU.uGlow, TUNE.glow);
    gl.uniform1f(waterU.uVignette, TUNE.vignette);
    gl.uniform1f(waterU.uGrain, TUNE.grain);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------- clock — carried across pages so the drift never restarts --- */
  var carried = 0;
  try { carried = parseFloat(sessionStorage.getItem("methun.water.t")) || 0; } catch (e) {}
  var epoch = performance.now();
  function clock() { return carried + (performance.now() - epoch) / 1000; }
  function persistClock() {
    try { sessionStorage.setItem("methun.water.t", String(clock())); } catch (e) {}
  }
  window.addEventListener("pagehide", persistClock);

  /* ---------- loop ---------- */
  var raf = 0, running = false, destroyed = false;
  var lastTime = 0, frameCount = 0, emaDt = 1 / 60, lastAdapt = 0;

  function adapt(nowMs) {
    frameCount++;
    if (frameCount < 90 || nowMs - lastAdapt < 3000) return;
    if (emaDt > 0.024 && quality > 0.66) {
      quality = Math.max(0.66, quality - 0.17);
      applySize();
      lastAdapt = nowMs;
    } else if (emaDt < 0.013 && quality < 1) {
      quality = Math.min(1, quality + 0.17);
      applySize();
      lastAdapt = nowMs;
    }
  }

  function frame(nowMs) {
    if (destroyed || !running) return;
    raf = requestAnimationFrame(frame);
    var dt = lastTime ? (nowMs - lastTime) / 1000 : 1 / 60;
    lastTime = nowMs;
    dt = Math.min(Math.max(dt, 0.001), 1 / 15);
    emaDt += (dt - emaDt) * 0.06;
    stepPointer(dt);
    stepFlow(dt);
    renderSurface(clock());
    adapt(nowMs);
  }

  function start() {
    if (destroyed || running || motionQuery.matches || !gl) return;
    running = true;
    lastTime = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function renderOnce() { renderSurface(clock()); }

  /* ---------- events ---------- */
  function onResize() { if (gl) { applySize(); if (!running) renderOnce(); } }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) lastTime = 0;  /* avoid a dt spike on return */
  });

  function onMotionChange() {
    if (motionQuery.matches) { stop(); renderOnce(); detachPointer(); }
    else { attachPointer(); start(); }
  }
  motionQuery.addEventListener
    ? motionQuery.addEventListener("change", onMotionChange)
    : motionQuery.addListener(onMotionChange);

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    stop();
  }, false);
  canvas.addEventListener("webglcontextrestored", function () {
    if (boot()) {
      if (motionQuery.matches) renderOnce(); else start();
    }
  }, false);

  function attachPointer() {
    window.addEventListener("pointermove", pointerUv, { passive: true });
    window.addEventListener("pointerdown", pointerUv, { passive: true });
    window.addEventListener("pointerout", function (e) {
      if (!e.relatedTarget) pointerGone();
    });
    window.addEventListener("blur", pointerGone);
  }
  function detachPointer() {
    window.removeEventListener("pointermove", pointerUv);
    window.removeEventListener("pointerdown", pointerUv);
  }

  /* ---------- go ---------- */
  if (boot()) {
    if (motionQuery.matches) {
      renderOnce();               /* one still frame of water, nothing moves */
    } else {
      attachPointer();
      start();
    }
  }

  } /* end mount */

  /* the script normally sits at the end of <body>; if it is ever moved
     into <head>, wait for the body before mounting the canvas */
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
