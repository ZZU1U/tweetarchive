// TweetArchive cursor effects — Blue Archive authentic style
//
// Pure canvas implementation. Matches the actual BA game effect:
//  • Tap = expanding filled blue circle + two rotating arc segments (gap in ring)
//         + 4 spark particles that burst outward
//  • Trail = glowing blue line + occasional triangular sparkles
//
// Non-negotiables:
//  • pointer-events: none  — never blocks input
//  • z-index: 99999        — above all app content
//  • honours prefers-reduced-motion: reduce
//  • pauses rAF when tab is hidden
//  • compositor-friendly (only canvas)

(() => {
  "use strict";

  // ----------------------------------------------------------------------
  // Settings (chrome.storage.sync, key "cursorEffects", default true)
  // ----------------------------------------------------------------------
  let enabled = true;
  try {
    chrome.storage.sync.get({ cursorEffects: true }).then((stored) => {
      enabled = !!stored.cursorEffects;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || !changes || !("cursorEffects" in changes)) return;
      enabled = !!changes.cursorEffects.newValue;
    });
  } catch (_) {
    /* storage unavailable → keep default */
  }

  // ----------------------------------------------------------------------
  // Environment gates
  // ----------------------------------------------------------------------
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // For touch devices we'd need extra handling, but this extension targets
  // desktop.  The trail uses pointer:fine to gate itself per spec.
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  // ----------------------------------------------------------------------
  // Canvas setup
  // ----------------------------------------------------------------------
  const cv = document.createElement("canvas");
  cv.style.cssText =
    "position:fixed;inset:0;z-index:99999;pointer-events:none;";
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");

  let dpr = 1;
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    cv.width = w;
    cv.height = h;
    cv.style.width = innerWidth + "px";
    cv.style.height = innerHeight + "px";
  };
  addEventListener("resize", fit);
  fit();

  // ----------------------------------------------------------------------
  // Constants (BA reference values)
  // ----------------------------------------------------------------------
  const BA_COLOR = "45,175,255"; // signature Blue Archive cyan-blue
  const RINGS_START = [250, 252, 252]; // near-white
  const RINGS_END = (() => {
    // blend toward BA_COLOR: (c + 255*2) / 3
    const parts = BA_COLOR.split(",").map(Number);
    return parts.map((n) => Math.round((n + 255 * 2) / 3));
  })();

  // Filled circle that blooms immediately on tap
  const FILLED_CFG = { rAddRate: 26, maxLife: 16 };

  // Arc ring segments (1.1π of a circle = gap in the ring)
  const RINGS_CFG = {
    rsList: [0, 0.08, 0.1],
    rRoundRateList: [0, 1, 1.5, 2],
    arcLen: 1.1 * Math.PI, // not a full circle!
    maxLife: 23,
    segNum: 10, // sub-segments per arc for varying stroke width
    minW: 0.4,
    maxW: 3.3,
    lenStopAddPoint: 0.1, // first 10% of life: arc grows to full length
    lenStartDimPoint: 0.4, // after 40% life: arc starts shrinking
  };

  const CLICK_SPARKS = 4;

  // Trail
  const MAX_TRAIL = 16;
  const TRAIL_LINE_WIDTH = 2;

  // ----------------------------------------------------------------------
  // State
  // ----------------------------------------------------------------------
  const waves = []; // tap effects
  const sparks = []; // spark particles
  const trail = []; // trail points

  let lastPointerPos = null;

  // ----------------------------------------------------------------------
  // Tap effect (pointerdown)
  // ----------------------------------------------------------------------
  document.addEventListener("pointerdown", (e) => {
    if (!enabled || e.button !== 0) return;

    const x = e.clientX;
    const y = e.clientY;

    // Create two arc ring segments with random offsets
    const ring = {
      ang: Math.random() * Math.PI * 2, // initial rotation
      rs: RINGS_CFG.rsList[Math.floor(Math.random() * RINGS_CFG.rsList.length)],
      segs: [
        {
          off: 0,
          len: RINGS_CFG.arcLen,
          rRoundRate: RINGS_CFG.rRoundRateList[
            Math.floor(Math.random() * RINGS_CFG.rRoundRateList.length)
          ],
        },
        {
          off: (Math.random() * 3 - 1.5) * Math.PI,
          len: RINGS_CFG.arcLen,
          rRoundRate: RINGS_CFG.rRoundRateList[
            Math.floor(Math.random() * RINGS_CFG.rRoundRateList.length)
          ],
        },
      ],
    };

    waves.push({ x, y, r: 0, life: 0, ring });

    // Burst sparks
    const speedAdj = 1; // no extra scale for now
    for (let i = 0; i < CLICK_SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (4.8 + Math.random() * 2) * speedAdj;
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: Math.random() * Math.PI * 2,
        rs: (Math.random() - 0.5) * 0.28,
        s: 4 + Math.random() * 3, // spark size (4-7)
        a: 1, // alpha
        f: 0.9, // friction
        fromClick: true,
      });
    }
  });

  // ----------------------------------------------------------------------
  // Trail (pointermove, fine pointer only)
  // ----------------------------------------------------------------------
  if (finePointer) {
    document.addEventListener("pointermove", (e) => {
      if (!enabled) return;
      const p = { x: e.clientX, y: e.clientY };

      if (lastPointerPos) {
        const dist = Math.hypot(p.x - lastPointerPos.x, p.y - lastPointerPos.y);
        if (dist > 2) {
          trail.push({ x: p.x, y: p.y, life: 1 });
          if (trail.length > MAX_TRAIL) trail.shift();

          // Occasionally spawn a trail sparkle (triangular)
          if (Math.random() < 0.3) {
            const a = Math.random() * Math.PI * 2;
            sparks.push({
              x: p.x + Math.cos(a) * 10,
              y: p.y + Math.sin(a) * 10,
              vx: Math.cos(a) * 1.3,
              vy: Math.sin(a) * 1.3,
              rot: Math.random() * Math.PI * 2,
              rs: 0.16,
              s: 9,
              a: 0.7,
              f: 0.95,
              fromClick: false,
            });
          }
        }
      }
      lastPointerPos = p;
    });
  }

  // ----------------------------------------------------------------------
  // Rendering
  // ----------------------------------------------------------------------
  // BA-style triangular spark (like a three-pointed star)
  function drawSpark(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rot);
    ctx.beginPath();
    ctx.moveTo(0, -s.s);
    ctx.lineTo(s.s * 0.6, s.s * 0.6);
    ctx.lineTo(-s.s * 0.6, s.s * 0.6);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, Math.min(1, s.a))})`;
    ctx.fill();
    ctx.restore();
  }

  // Draw one arc segment of the ring
  function strokeArcSegment(wx, wy, radius, a0, a1, lw, color) {
    ctx.beginPath();
    ctx.arc(wx, wy, radius, a0, a1);
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // Tap ring: filled circle + arc segments
  function drawWave(w) {
    const filled = FILLED_CFG;
    const rings = RINGS_CFG;

    const waveProg = Math.min(w.life / filled.maxLife, 1);
    const ringProg = Math.min(w.life / rings.maxLife, 1);

    // 1. Filled blue circle (fast bloom)
    if (waveProg < 1) {
      const ease = 1 - Math.pow(1 - waveProg, 3);
      w.r = filled.rAddRate * ease;
      const alpha = Math.max(0, 1 - waveProg);
      if (alpha > 0) {
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${BA_COLOR},${alpha})`;
        ctx.fill();
      }
    }

    // 2. Arc ring segments
    if (ringProg < 1) {
      const r = w.ring;
      r.ang -= r.rs; // rotate

      // Color: white → blue-white blend
      const t = Math.min(1.2 * ringProg, 1);
      const rr = Math.round(RINGS_START[0] * (1 - t) + RINGS_END[0] * t);
      const gg = Math.round(RINGS_START[1] * (1 - t) + RINGS_END[1] * t);
      const bb = Math.round(RINGS_START[2] * (1 - t) + RINGS_END[2] * t);
      const alpha = Math.min(1.1 - 0.3 * ringProg, 1);

      // Weight profile: center of segment is thicker
      const getWeight = (t) => Math.min(2 - Math.abs(4 * (t - 0.5)), 1);

      for (let si = 0; si < 2; si++) {
        const seg = r.segs[si];
        const base = r.ang + seg.off;

        let start, end, len;
        if (ringProg <= rings.lenStopAddPoint) {
          // Arc grows from 0 to full length
          len = seg.len * (ringProg / rings.lenStopAddPoint);
          end = base + seg.len;
          start = end - len;
        } else if (ringProg >= rings.lenStartDimPoint) {
          // Arc shrinks from full length to 0
          const shrink = (ringProg - rings.lenStartDimPoint) / (1 - rings.lenStartDimPoint);
          len = seg.len * (1 - shrink);
          start = base;
          end = start + len;
        } else {
          len = seg.len;
          start = base;
          end = start + len;
        }

        const lwMul = Math.min(-0.8 * (ringProg - 0.8) + 1, 1);
        const radius = w.r + seg.rRoundRate;

        for (let k = 0; k < rings.segNum; k++) {
          const t0 = k / rings.segNum;
          const t1 = (k + 1) / rings.segNum;
          const a0 = start + (end - start) * t0;
          const a1 = start + (end - start) * t1;
          if (Math.abs(a1 - a0) < 0.01) continue;

          const wT = getWeight(t0);
          const lw = (rings.minW * (1 - wT) + rings.maxW * wT) * lwMul;
          strokeArcSegment(
            w.x, w.y, radius, a0, a1, lw,
            `rgba(${rr},${gg},${bb},${alpha})`,
          );
        }
      }
    }
  }

  // Trail line (glowing blue)
  function drawTrail() {
    if (trail.length < 2) {
      // Single dot
      if (trail.length === 1) {
        const t = trail[0];
        const fade = Math.max(0, t.life);
        ctx.shadowColor = "transparent";
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2 + 1.5 * fade, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${BA_COLOR},${fade * 0.5})`;
        ctx.fill();
      }
      return;
    }

    const pts = lastPointerPos
      ? trail.concat([{ x: lastPointerPos.x, y: lastPointerPos.y, life: 1 }])
      : trail.slice();

    if (pts.length < 2) return;

    ctx.lineWidth = TRAIL_LINE_WIDTH;
    ctx.shadowColor = `rgba(${BA_COLOR},0.35)`;
    ctx.shadowBlur = 1.5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const lastIdx = pts.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      const alphaStart = i / lastIdx;
      const alphaEnd = (i + 1) / lastIdx;
      const a0 = pts[i];
      const a1 = pts[i + 1];

      const grad = ctx.createLinearGradient(a0.x, a0.y, a1.x, a1.y);
      grad.addColorStop(0, `rgba(${BA_COLOR},${alphaStart * 0.5})`);
      grad.addColorStop(1, `rgba(${BA_COLOR},${alphaEnd * 0.5})`);

      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.strokeStyle = grad;
      ctx.stroke();
    }

    ctx.shadowColor = "transparent";
  }

  // ----------------------------------------------------------------------
  // Update lifecycle
  // ----------------------------------------------------------------------
  function updateTrail() {
    const baseDecay = 0.085;
    const maxStep = 0.42;
    for (let i = trail.length - 1; i >= 0; i--) {
      const t = trail[i];
      const span = Math.max(1, trail.length - 1);
      const along = trail.length > 1 ? i / span : 1;
      const bias = 1.25 - 0.55 * along;
      let step = baseDecay * bias;
      if (step > maxStep) step = maxStep;
      t.life -= step;
      if (t.life <= 0) trail.splice(i, 1);
    }
  }

  function updateSparks() {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.vx *= s.f;
      s.vy *= s.f;
      s.rot += s.rs;
      s.a -= 0.032;
      if (s.a <= 0) {
        sparks.splice(i, 1);
      }
    }
  }

  function updateWaves() {
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life += 1;
      if (
        w.life >= FILLED_CFG.maxLife &&
        w.life >= RINGS_CFG.maxLife
      ) {
        waves.splice(i, 1);
      }
    }
  }

  // ----------------------------------------------------------------------
  // rAF loop (paused when tab hidden)
  // ----------------------------------------------------------------------
  let running = document.visibilityState === "visible";
  let rafId = 0;

  function tick() {
    if (!running) return;

    const hasWork =
      waves.length > 0 || sparks.length > 0 || trail.length > 0;

    // Clear canvas with DPR transform
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    if (hasWork) {
      updateTrail();
      updateSparks();
      updateWaves();

      // Additive blending for the glow effect (BA signature)
      ctx.globalCompositeOperation = "lighter";

      drawTrail();

      for (const w of waves) drawWave(w);
      for (const s of sparks) drawSpark(s);

      ctx.globalCompositeOperation = "source-over";
    }

    rafId = requestAnimationFrame(tick);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(tick);
      }
    } else if (running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  });

  if (running) rafId = requestAnimationFrame(tick);
})();