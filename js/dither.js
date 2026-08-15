/* Methun Raj — QuietDither: ordered-dither cover monograms. Zero deps.

   monogram — the projects covers: the same dot grid the static SVG covers
              use, but live. Idle, the letters sit barely resolved out of the
              noise; hovering the card settles the noise and warms the dots.

   The pointer-following field mode was retired when the Stillwater water
   background took over carrying the pointer's wake.

   The static SVG <img> stays in the markup as the no-JS fallback. Reduced
   motion gets a single resolved frame and no listeners. */
(function () {
  "use strict";

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- ordered dither threshold (8×8 Bayer) ---------- */
  var BAYER = [
    [ 0, 32,  8, 40,  2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44,  4, 36, 14, 46,  6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [ 3, 35, 11, 43,  1, 33,  9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47,  7, 39, 13, 45,  5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];
  function threshold(x, y) { return (BAYER[y & 7][x & 7] + 0.5) / 64; }

  /* ---------- value noise, 2 spatial dims + time ---------- */
  function hash(x, y, z) {
    var n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
    var c000 = hash(xi, yi, zi),     c100 = hash(xi + 1, yi, zi);
    var c010 = hash(xi, yi + 1, zi), c110 = hash(xi + 1, yi + 1, zi);
    var c001 = hash(xi, yi, zi + 1),     c101 = hash(xi + 1, yi, zi + 1);
    var c011 = hash(xi, yi + 1, zi + 1), c111 = hash(xi + 1, yi + 1, zi + 1);
    var x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
    var x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
    var y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
    return y0 + (y1 - y0) * zf;
  }

  function hexRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* Shared frame driver: caps fps, renders one frame synchronously on
     attach (so the first paint never depends on rAF), pauses offscreen. */
  function drive(canvas, render, fps) {
    var raf = 0, last = 0, visible = true, running = false;
    var interval = 1000 / fps;
    function frame(now) {
      raf = 0;
      if (!visible) { running = false; return; }
      if (now - last >= interval) { last = now; render(now / 1000); }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || motionQuery.matches) return;
      running = true;
      if (!raf) raf = requestAnimationFrame(frame);
    }
    var io = new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) start();
    });
    io.observe(canvas);
    render(0);
    start();
    return start;
  }

  /* ---------- cover monograms ---------- */
  /* Geometry mirrors the static SVG covers: a 1600×1000 plate, background
     grid dots every 26 units (r 1.6), letter dots every 22 units (r 6.4),
     bold Helvetica at 470 with wide tracking. */
  function attachMonogram(cover) {
    var img = cover.querySelector("img");
    var text = cover.getAttribute("data-monogram") || "";
    var hue = hexRgb(cover.getAttribute("data-hue") || "#E0884E");
    var inkMuted = hexRgb("#8A8378");
    if (!text) return;

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    cover.appendChild(canvas);
    cover.classList.add("dithered");
    if (img) img.setAttribute("aria-hidden", "true");

    var dots = [];        // letter cells: {x, y, seed}
    var plate = null;     // baked background layer
    var scale = 1;
    var R = 0, target = 0; // resolve: 0 = noisy idle, 1 = settled
    var lastT = 0;

    function bake(w, h) {
      plate = plate || document.createElement("canvas");
      plate.width = w; plate.height = h;
      var p = plate.getContext("2d");
      p.fillStyle = "#070B14"; /* matches --bg, so covers sit in the water family */
      p.fillRect(0, 0, w, h);
      p.fillStyle = "rgba(236, 232, 224, .028)";
      p.beginPath();
      p.ellipse(1020 * scale, 400 * scale, 720 * scale, 470 * scale, 0, 0, 7);
      p.fill();
      p.fillStyle = "rgba(236, 232, 224, .09)";
      var step = 26 * scale, r = Math.max(1.6 * scale, 0.6);
      for (var y = step / 2; y < h; y += step) {
        for (var x = step / 2; x < w; x += step) {
          p.beginPath(); p.arc(x, y, r, 0, 7); p.fill();
        }
      }
    }

    function sampleLetters(w, h) {
      var m = document.createElement("canvas");
      m.width = w; m.height = h;
      var mc = m.getContext("2d", { willReadFrequently: true });
      mc.fillStyle = "#fff";
      mc.textAlign = "center";
      mc.textBaseline = "middle";
      mc.font = "700 " + Math.round(470 * scale) + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
      if ("letterSpacing" in mc) mc.letterSpacing = Math.round(18 * scale) + "px";
      mc.fillText(text, w / 2, h / 2);
      var mask = mc.getImageData(0, 0, w, h).data;
      dots.length = 0;
      var step = 22 * scale;
      var iy = 0;
      for (var y = step / 2; y < h; y += step, iy++) {
        var ix = 0;
        for (var x = step / 2; x < w; x += step, ix++) {
          var a = mask[((y | 0) * w + (x | 0)) * 4 + 3];
          if (a > 128) dots.push({ x: x, y: y, ix: ix, iy: iy, seed: hash(x, y, 0) * 8 });
        }
      }
    }

    function resize() {
      var w = cover.clientWidth, h = cover.clientHeight;
      if (w < 4 || h < 4) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      scale = canvas.width / 1600;
      bake(canvas.width, canvas.height);
      sampleLetters(canvas.width, canvas.height);
    }

    function render(t) {
      if (!plate) return;
      var dt = Math.min(t - lastT, 0.1);
      lastT = t;
      R += (target - R) * Math.min(1, dt * 7);
      /* reduced motion: fully resolved geometry, but keep the resting ink —
         the hue is a hover reward, and there is no hover here */
      var hueMix = R;
      if (motionQuery.matches) { R = 1; hueMix = 0; }
      var w = canvas.width, h = canvas.height;
      ctx.drawImage(plate, 0, 0);
      var r0 = 6.4 * scale;
      var cr = [
        mix(inkMuted[0], hue[0], hueMix), mix(inkMuted[1], hue[1], hueMix),
        mix(inkMuted[2], hue[2], hueMix)
      ];
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        /* a slow, faint breathing — the letters stay readable at rest and
           simply settle and warm when the card is hovered */
        var n = noise(d.x * 0.014, d.y * 0.014, t * 0.3 + d.seed);
        var presence = mix(0.6 + 0.4 * n, 1, R);
        if (presence < threshold(d.ix, d.iy) * 0.3 * (1 - R)) continue;
        ctx.fillStyle = "rgba(" + (cr[0] | 0) + "," + (cr[1] | 0) + "," + (cr[2] | 0) + "," + (0.5 + 0.5 * presence).toFixed(3) + ")";
        ctx.beginPath();
        ctx.arc(d.x, d.y, r0 * (0.72 + 0.28 * presence), 0, 7);
        ctx.fill();
      }
    }

    resize();
    var start = drive(canvas, render, 24);

    if (!motionQuery.matches) {
      var card = cover.closest("a") || cover;
      card.addEventListener("pointerenter", function () { target = 1; start(); });
      card.addEventListener("pointerleave", function () { target = 0; start(); });
      card.addEventListener("focus", function () { target = 1; start(); });
      card.addEventListener("blur", function () { target = 0; start(); });
    }

    new ResizeObserver(function () { resize(); render(lastT); start(); }).observe(cover);
  }

  /* ---------- init ---------- */
  function init() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-monogram]"), attachMonogram);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { noise: noise, threshold: threshold };
})();
