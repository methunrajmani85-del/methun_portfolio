/* Methun Raj — shared site logic: nav, reveals, page transitions,
   Canvas UI ripple (landing), and cuelume-style interaction sounds
   (Web Audio, zero audio files, zero dependencies). */
(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- nav: border on scroll ---------- */
  var head = document.getElementById("site-head");
  function onScroll() { head.classList.toggle("scrolled", window.scrollY > 24); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- nav: landing hides links; subpages hide their own link ---------- */
  var path = location.pathname.split("/").pop() || "index.html";
  var navWrap = document.querySelector(".nav-links");
  if (navWrap) {
    if (path === "index.html") {
      navWrap.style.display = "none"; // the index rows are the navigation
    } else {
      Array.prototype.forEach.call(navWrap.querySelectorAll("[data-nav]"), function (a) {
        if (a.getAttribute("href") === path) a.style.display = "none";
      });
    }
  }

  /* ---------- reveal on scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reducedMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Canvas UI: Ripple (landing only) ---------- */
  var rippleOut = document.getElementById("ripple-output");
  if (rippleOut && window.CanvasUIRipple && typeof window.CanvasUIRipple.createRipple === "function") {
    try {
      window.CanvasUIRipple.createRipple(
        {
          source: document.getElementById("ripple-source"),
          content: document.getElementById("ripple-content"),
          output: rippleOut,
        },
        {
          trigger: "hover",
          interval: 7,
          amplitude: 0.42,
          speed: 0.55,
          wavelength: 110,
          rings: 2,
          decay: 1.05,
          refraction: 65,
          dispersion: 0.3,
          shine: 0.32,
        }
      );
    } catch (e) { /* WebGL unavailable — the page simply stays still */ }
  }

  /* ---------- interaction sounds (cuelume-style cues) ---------- */
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  var master = null;
  var lastTick = 0;
  var soundOn = true; // always on — no off switch

  function arm() {
    if (!AC || actx) return;
    try {
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.32;
      master.connect(actx.destination);
      window.__soundArmed = true;
    } catch (e) {}
  }
  window.addEventListener("pointerdown", arm, { passive: true });
  window.addEventListener("keydown", arm);

  function cue(freq, dur, peak, type, slideTo, delay) {
    if (!soundOn || !actx || !master) return;
    if (actx.state === "suspended") actx.resume();
    var t0 = actx.currentTime + (delay || 0);
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function thock(dur, peak, cutoff) {
    // tiny filtered noise burst — the mechanical body of a click
    if (!soundOn || !actx || !master) return;
    var len = Math.max(1, Math.floor(actx.sampleRate * dur));
    var buf = actx.createBuffer(1, len, actx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = actx.createBufferSource();
    src.buffer = buf;
    var f = actx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    var g = actx.createGain();
    g.gain.value = peak;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start();
  }

  function tick() { // hover: soft pluck + airy overtone, throttled
    var now = performance.now();
    if (now - lastTick < 60) return;
    lastTick = now;
    cue(1750, 0.05, 0.05, "sine", 1150);
    cue(3500, 0.03, 0.018, "sine");
  }
  function press() { // two-part mechanical click, down
    thock(0.028, 0.35, 750);
    cue(150, 0.08, 0.14, "triangle", 95);
  }
  function release() { // up: brighter snap
    cue(1050, 0.055, 0.06, "sine", 1500);
    cue(2100, 0.035, 0.02, "sine");
  }
  function confirmNav() { // navigation: warm two-note chime + sparkle
    cue(659.25, 0.1, 0.08, "triangle");
    cue(987.77, 0.16, 0.07, "triangle", null, 0.075);
    cue(1975.5, 0.12, 0.022, "sine", null, 0.075);
  }

  var HOVER_SEL = ".nav-links a, .index-row, .btn, .text-link, .footer-links a, .footer-mail, .bio-cta a, .live-link, .sound-state, .brand";
  document.addEventListener("pointerover", function (e) {
    if (e.target.closest && e.target.closest(HOVER_SEL)) tick();
  });
  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest("a, button")) press();
  }, { passive: true });
  document.addEventListener("pointerup", function (e) {
    if (e.target.closest && e.target.closest("a, button")) release();
  }, { passive: true });

  /* ---------- page transitions ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href$='.html']");
    if (!a || a.target === "_blank") return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    var page = url.pathname.split("/").pop();
    if (page === path) return; // already here
    e.preventDefault();
    confirmNav();
    if (reducedMotion) { location.href = a.href; return; }
    document.body.classList.add("leaving");
    setTimeout(function () { location.href = a.href; }, 170);
  });

  /* ---------- experience / education sidebar ---------- */
  var overlay = document.getElementById("xp-overlay");
  if (overlay) {
    var xpBody = document.getElementById("xp-body");
    var xpChapter = document.getElementById("xp-chapter");
    var docs = xpBody.querySelectorAll(".xp-doc");

    function openPanel(key, chapter) {
      Array.prototype.forEach.call(docs, function (d) {
        d.classList.toggle("show", d.getAttribute("data-doc") === key);
      });
      xpChapter.textContent = chapter;
      overlay.hidden = false;
      xpBody.parentNode.scrollTop = 0;
      requestAnimationFrame(function () { overlay.classList.add("open"); });
      document.body.style.overflow = "hidden";
      confirmNav();
    }
    function closePanel() {
      if (overlay.hidden) return;
      overlay.classList.remove("open");
      document.body.style.overflow = "";
      tick();
      setTimeout(function () { overlay.hidden = true; }, 500);
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-panel]"), function (btn) {
      btn.addEventListener("click", function () {
        openPanel(btn.getAttribute("data-panel"), btn.getAttribute("data-chapter"));
      });
    });
    overlay.querySelector("[data-close]").addEventListener("click", closePanel);
    document.getElementById("xp-close").addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });
  }
})();
