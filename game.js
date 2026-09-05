/**
 * FAKE CASH SLOTS — Physical upright cabinet (play money only)
 */
(function () {
  "use strict";

  const STORAGE_KEY = "fakeCashSlots.balance";
  const START_BALANCE = 1000;
  const BETS = [5, 10, 25, 50, 100];
  const SYMBOL_H = 100;
  const VISIBLE = 3;
  const STAGGER_MS = 280;
  const HOLD_AFTER_STOP_MS = 420;
  const WIN_POP_MS = 400;
  const MAX_PARTICLES = 48;
  /** Demo-friendly 3-of-a-kind rate (~30%). Toggle with ?demoWins=0 or localStorage fakeCashSlots.demoWins=0 */
  const DEMO_WIN_RATE = 0.30;

  /** @type {{id:string,emoji:string,name:string,mult:number,tier:string,color:string}[]} */
  const SYMBOLS = [
    { id: "cherry", emoji: "🍒", name: "Cherries", mult: 2, tier: "low", color: "#c41e3a" },
    { id: "lemon", emoji: "🍋", name: "Lemon", mult: 3, tier: "low", color: "#d4a017" },
    { id: "orange", emoji: "🍊", name: "Orange", mult: 4, tier: "low", color: "#d2691e" },
    { id: "grape", emoji: "🍇", name: "Grapes", mult: 5, tier: "low", color: "#6b3fa0" },
    { id: "bell", emoji: "🔔", name: "Bell", mult: 8, tier: "mid", color: "#c9a227" },
    { id: "bar", emoji: "▬", name: "BAR", mult: 12, tier: "mid", color: "#2a6f8f" },
    { id: "seven", emoji: "7", name: "Sevens", mult: 25, tier: "high", color: "#b91c1c" },
    { id: "diamond", emoji: "💎", name: "Diamond", mult: 50, tier: "high", color: "#5eead4" },
  ];

  const WEIGHTS = {
    cherry: 14, lemon: 13, orange: 12, grape: 11,
    bell: 9, bar: 7, seven: 5, diamond: 3,
  };

  const els = {
    cabinet: document.getElementById("cabinet"),
    marquee: document.getElementById("marquee"),
    message: document.getElementById("message"),
    balance: document.getElementById("balance"),
    lastWin: document.getElementById("last-win"),
    spinBtn: document.getElementById("spin-btn"),
    betButtons: document.getElementById("bet-buttons"),
    paytable: document.getElementById("paytable"),
    paysTab: document.getElementById("pays-tab"),
    paysPanel: document.getElementById("pays-panel"),
    addBtn: document.getElementById("add-btn"),
    resetBtn: document.getElementById("reset-btn"),
    confetti: document.getElementById("confetti"),
    candleBar: document.getElementById("candle-bar"),
    winLights: document.getElementById("win-lights"),
  };

  const canvases = [
    document.getElementById("reel-0"),
    document.getElementById("reel-1"),
    document.getElementById("reel-2"),
  ];
  const ctxs = canvases.map((c) => c.getContext("2d"));

  let balance = loadBalance();
  let bet = 10;
  let spinning = false;
  let lastWin = 0;
  let attractTimer = null;
  let attractIdx = 0;

  /** @type {object[]} */
  const reels = [];

  // —— Audio ——————————————————————————————————————————
  let audioCtx = null;
  let whirNodes = null;

  function ensureAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function playSfx(kind) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (kind === "click") {
      tone(ctx, "triangle", 660, 440, 0.07, 0.05, now);
    } else if (kind === "spin") {
      tone(ctx, "square", 180, 320, 0.12, 0.04, now);
    } else if (kind === "clack") {
      tone(ctx, "square", 420, 180, 0.06, 0.07, now);
      noiseBurst(ctx, 0.04, 0.045, now);
    } else if (kind === "tick") {
      tone(ctx, "sine", 880, 760, 0.05, 0.035, now);
    } else if (kind === "win") {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(ctx, "triangle", f, f * 1.01, 0.18, 0.07, now + i * 0.08);
      });
    } else if (kind === "bigwin") {
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        tone(ctx, "sawtooth", f, f * 1.002, 0.22, 0.055, now + i * 0.07);
      });
    } else if (kind === "lose") {
      tone(ctx, "triangle", 300, 160, 0.2, 0.04, now);
    }
  }

  function tone(ctx, type, f0, f1, dur, gainVal, when) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 4200;
    osc.type = type;
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), when + dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(gainVal, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function noiseBurst(ctx, dur, gainVal, when) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1400;
    src.buffer = buf;
    gain.gain.setValueAtTime(gainVal, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    src.start(when);
  }

  function startWhir() {
    const ctx = ensureAudio();
    if (!ctx || whirNodes) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 900;
    osc.type = "sawtooth";
    osc2.type = "square";
    osc.frequency.value = 55;
    osc2.frequency.value = 82;
    gain.gain.value = 0.025;
    osc.connect(filt);
    osc2.connect(filt);
    filt.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    whirNodes = { osc, osc2, gain, filt };
  }

  function stopWhir() {
    if (!whirNodes || !audioCtx) return;
    const now = audioCtx.currentTime;
    try {
      whirNodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      whirNodes.osc.stop(now + 0.1);
      whirNodes.osc2.stop(now + 0.1);
    } catch (_) { /* ignore */ }
    whirNodes = null;
  }

  // —— Balance / storage ——————————————————————————————
  function loadBalance() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v != null) {
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0) return Math.floor(n);
      }
    } catch (_) { /* ignore */ }
    return START_BALANCE;
  }

  function saveBalance() {
    try { localStorage.setItem(STORAGE_KEY, String(balance)); } catch (_) { /* ignore */ }
  }

  /** LED-style numeric display */
  function formatLed(n) {
    return Math.floor(n).toLocaleString("en-US");
  }

  function formatMoney(n) {
    return "$" + Math.floor(n).toLocaleString("en-US");
  }

  function setMessage(text, cls) {
    els.message.textContent = text;
    els.message.className = "message" + (cls ? " " + cls : "");
  }

  function setMarquee(text, cls) {
    els.marquee.textContent = text;
    els.marquee.className = "marquee-readout" + (cls ? " " + cls : "");
  }

  function updateMeters() {
    els.balance.textContent = formatLed(balance);
    els.lastWin.textContent = formatLed(lastWin);
    updateBetButtons();
    // Leave SPIN lit during spin (no slam-stop / no dim); only disable when broke
    els.spinBtn.disabled = !spinning && balance < bet;
    els.spinBtn.classList.toggle("is-spinning", spinning);
    els.spinBtn.setAttribute("aria-busy", spinning ? "true" : "false");
  }

  function updateBetButtons() {
    els.betButtons.querySelectorAll(".bet-btn").forEach((btn) => {
      const b = Number(btn.dataset.bet);
      btn.classList.toggle("active", b === bet);
      btn.disabled = spinning || b > balance;
    });
  }

  // —— Weighted strips ————————————————————————————————
  function buildWeightedPool() {
    const pool = [];
    SYMBOLS.forEach((s) => {
      const w = WEIGHTS[s.id] || 1;
      for (let i = 0; i < w; i++) pool.push(SYMBOLS.indexOf(s));
    });
    return pool;
  }

  const POOL = buildWeightedPool();

  function demoWinsEnabled() {
    try {
      const q = new URLSearchParams(location.search).get("demoWins");
      if (q === "0" || q === "false") return false;
      if (q === "1" || q === "true") return true;
      const ls = localStorage.getItem("fakeCashSlots.demoWins");
      if (ls === "0" || ls === "false") return false;
    } catch (_) { /* ignore */ }
    return true; // casual play-money default: slightly juicy
  }

  function randomSymbolIndex() {
    return POOL[Math.floor(Math.random() * POOL.length)];
  }

  /** Pick center-line results; ~DEMO_WIN_RATE chance of 3-of-a-kind when demo wins on */
  function pickSpinResults() {
    if (demoWinsEnabled() && Math.random() < DEMO_WIN_RATE) {
      const idx = randomSymbolIndex();
      return [idx, idx, idx];
    }
    let results = [randomSymbolIndex(), randomSymbolIndex(), randomSymbolIndex()];
    // If we accidentally hit 3oak outside the demo roll, keep it (still a win)
    if (!demoWinsEnabled() && results[0] === results[1] && results[1] === results[2]) {
      // rare natural — fine
    }
    // When demo is on but we didn't force a win, avoid accidental 3oak to keep rate near target
    if (demoWinsEnabled() && results[0] === results[1] && results[1] === results[2]) {
      results[2] = (results[2] + 1 + Math.floor(Math.random() * (SYMBOLS.length - 1))) % SYMBOLS.length;
    }
    return results;
  }

  function buildStrip() {
    const strip = [];
    for (let i = 0; i < 24; i++) strip.push(randomSymbolIndex());
    return strip;
  }

  function initReels() {
    for (let i = 0; i < 3; i++) {
      const strip = buildStrip();
      reels.push({
        offset: 0,
        target: 0,
        phase: "idle",
        speed: 0,
        blur: 0,
        resultIndex: strip[1],
        strip,
        startTime: 0,
        duration: 0,
        startOffset: 0,
        overshoot: 0,
      });
    }
    reels.forEach((r) => { r.offset = SYMBOL_H; });
  }

  // —— Canvas: mechanical / painted drum symbols ————————
  function resizeCanvases() {
    canvases.forEach((canvas) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(120, Math.floor(rect.width * dpr));
      const h = Math.max(180, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Painted cardboard / enamel tile on a mechanical reel */
  function drawMechTile(ctx, x, y, w, h, sym, glow, dim, popScale) {
    const pad = Math.max(3, w * 0.04);
    const r = Math.min(8, w * 0.06);
    const pop = popScale || 1;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.42;

    // Cream / aged card stock behind symbols (classic mechanical)
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    if (sym.tier === "high") {
      bg.addColorStop(0, "#2a1810");
      bg.addColorStop(0.5, "#1a100c");
      bg.addColorStop(1, "#120c08");
    } else if (sym.tier === "mid") {
      bg.addColorStop(0, "#1e2418");
      bg.addColorStop(1, "#10140e");
    } else {
      bg.addColorStop(0, "#1a1814");
      bg.addColorStop(1, "#0e0c0a");
    }
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, r);
    ctx.fillStyle = bg;
    ctx.fill();

    // Thin painted rim
    ctx.strokeStyle = glow ? sym.color : "rgba(200, 180, 140, 0.22)";
    ctx.lineWidth = glow ? 2.8 : 1.4;
    if (glow) {
      ctx.shadowColor = sym.color;
      ctx.shadowBlur = sym.tier === "high" ? 22 : 14;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Soft top highlight (printed varnish)
    ctx.beginPath();
    roundRect(ctx, x + pad + 3, y + pad + 3, w - pad * 2 - 6, (h - pad * 2) * 0.22, r - 1);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.fill();

    const cx = x + w / 2;
    const cy = y + h / 2;

    if (glow && pop > 1.01) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -cy);
    }

    // Base glyph size (outer ctx.scale applies win pop)
    const baseHero = sym.tier === "high" ? 0.72 : sym.tier === "mid" ? 0.62 : 0.58;
    if (sym.id === "seven") {
      drawPaintedSeven(ctx, cx, cy, Math.min(w, h) * baseHero, glow);
    } else if (sym.id === "bar") {
      drawPaintedBar(ctx, cx, cy, w * 0.72, glow);
    } else if (sym.id === "diamond") {
      // Extra radius nudge so diamonds feel like they "pop"
      const dR = Math.min(w, h) * (0.38 + (glow ? 0.04 : 0));
      drawPaintedDiamond(ctx, cx, cy, dR, glow, pop);
    } else {
      const size = Math.floor(h * baseHero);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Drop shadow for physical print depth
      ctx.font = `${size}px serif`;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(sym.emoji, cx + 2, cy + 3);
      if (glow || sym.tier !== "low") {
        ctx.shadowColor = sym.color;
        ctx.shadowBlur = glow ? (sym.tier === "high" ? 28 : 18) : 10;
        ctx.fillStyle = sym.color;
        ctx.fillText(sym.emoji, cx, cy);
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = "#fff";
      ctx.fillText(sym.emoji, cx, cy);
    }

    if (glow && pop > 1.01) ctx.restore();
    ctx.restore();
  }

  function drawPaintedSeven(ctx, cx, cy, size, glow) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${size}px "Bebas Neue", "Orbitron", Impact, sans-serif`;
    // Deep drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillText("7", cx + 3, cy + 4);
    if (glow) {
      ctx.shadowColor = "#ef4444";
      ctx.shadowBlur = 32;
      ctx.fillStyle = "#ef4444";
      ctx.fillText("7", cx, cy);
      ctx.shadowBlur = 0;
    }
    const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
    g.addColorStop(0, "#fff5f5");
    g.addColorStop(0.3, "#ff6b6b");
    g.addColorStop(0.55, "#b91c1c");
    g.addColorStop(0.8, "#7f1d1d");
    g.addColorStop(1, "#450a0a");
    ctx.fillStyle = g;
    ctx.fillText("7", cx, cy);
    // Rim light
    ctx.strokeStyle = "rgba(255,220,180,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeText("7", cx, cy);
    ctx.restore();
  }

  function drawPaintedBar(ctx, cx, cy, w, glow) {
    ctx.save();
    const h = w * 0.36;
    const x = cx - w / 2;
    const y = cy - h / 2;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, x + 2, y + 3, w, h, 3);
    ctx.fill();
    if (glow) {
      ctx.shadowColor = "#5eead4";
      ctx.shadowBlur = 20;
    }
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#e8eef5");
    g.addColorStop(0.35, "#94a3b8");
    g.addColorStop(0.5, "#334155");
    g.addColorStop(1, "#1e293b");
    roundRect(ctx, x, y, w, h, 3);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#0a0a0a";
    ctx.font = `900 ${Math.floor(h * 0.72)}px "Orbitron", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BAR", cx, cy + 1);
    ctx.restore();
  }

  function drawPaintedDiamond(ctx, cx, cy, r, glow, pop) {
    ctx.save();
    const p = pop || 1;
    // Shadow
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - r + 3);
    ctx.lineTo(cx + r * 0.75 + 2, cy + 3);
    ctx.lineTo(cx + 2, cy + r + 3);
    ctx.lineTo(cx - r * 0.75 + 2, cy + 3);
    ctx.closePath();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fill();

    if (glow) {
      ctx.shadowColor = "#5eead4";
      ctx.shadowBlur = 30 + (p - 1) * 40;
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.75, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.75, cy);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.3, "#99f6e4");
    g.addColorStop(0.55, "#2dd4bf");
    g.addColorStop(0.8, "#0f766e");
    g.addColorStop(1, "#e8eef5");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Facet highlight — brighter on pop
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.22, cy - r * 0.12);
    ctx.lineTo(cx, cy + r * 0.08);
    ctx.lineTo(cx - r * 0.22, cy - r * 0.12);
    ctx.closePath();
    ctx.fillStyle = glow ? `rgba(255,255,255,${Math.min(0.85, 0.5 + (p - 1) * 1.2)})` : "rgba(255,255,255,0.5)";
    ctx.fill();
    // Specular sparkle burst when popping
    if (glow && p > 1.04) {
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.9, (p - 1) * 3)})`;
      ctx.lineWidth = 1.2;
      const spark = r * (0.55 + (p - 1) * 1.4);
      ctx.beginPath();
      ctx.moveTo(cx - spark, cy);
      ctx.lineTo(cx + spark, cy);
      ctx.moveTo(cx, cy - spark);
      ctx.lineTo(cx, cy + spark);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawReel(reelIndex, highlight, popScale) {
    const canvas = canvases[reelIndex];
    const ctx = ctxs[reelIndex];
    const reel = reels[reelIndex];
    const W = canvas.width;
    const H = canvas.height;
    const cellH = H / VISIBLE;
    const cellW = W;
    const pop = popScale || 1;

    ctx.clearRect(0, 0, W, H);
    // Dark felt / velvet behind drums
    ctx.fillStyle = "#060a08";
    ctx.fillRect(0, 0, W, H);

    const strip = reel.strip;
    const len = strip.length;
    const totalH = len * cellH;
    let off = ((reel.offset % totalH) + totalH) % totalH;

    // Independent COLUMN motion blur — vertical smear on this reel only
    const b = reel.blur || 0;
    let blurPasses = 1;
    if (b > 0.55) blurPasses = 7;
    else if (b > 0.3) blurPasses = 5;
    else if (b > 0.12) blurPasses = 3;
    else if (b > 0.04) blurPasses = 2;

    for (let pass = blurPasses - 1; pass >= 0; pass--) {
      const tPass = blurPasses === 1 ? 0 : pass / (blurPasses - 1);
      const alpha = pass === 0 ? 1 : (0.22 / blurPasses) * (1 - tPass * 0.35);
      // Stretch smear along spin axis (downward trail)
      const yShift = pass * cellH * (0.10 + b * 0.16) * b;
      ctx.globalAlpha = alpha;
      drawStripAt(ctx, strip, cellH, cellW, off + yShift, highlight && pass === 0, pop);
    }
    ctx.globalAlpha = 1;

    // Extra vertical streak overlay while this column is blurred (per-drum, not whole window)
    if (b > 0.2) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.35, b * 0.28);
      const streak = ctx.createLinearGradient(0, 0, 0, H);
      streak.addColorStop(0, "rgba(255,255,255,0)");
      streak.addColorStop(0.5, "rgba(220,200,160,0.12)");
      streak.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = streak;
      // thin column-center streaks
      const sw = Math.max(2, W * 0.04);
      for (let s = 0; s < 3; s++) {
        const sx = W * (0.25 + s * 0.25) - sw / 2;
        ctx.fillRect(sx, 0, sw, H);
      }
      ctx.restore();
    }

    // Toggle CSS column-blur class on the drum (independent strips)
    const drum = canvases[reelIndex].closest(".reel-drum");
    if (drum) {
      drum.classList.toggle("column-blur", b > 0.15);
      drum.classList.toggle("column-blur-hard", b > 0.55);
    }

    // Top/bottom vignette inside drum window
    const vig = ctx.createLinearGradient(0, 0, 0, H);
    vig.addColorStop(0, "rgba(0,0,0,0.8)");
    vig.addColorStop(0.2, "rgba(0,0,0,0)");
    vig.addColorStop(0.8, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStripAt(ctx, strip, cellH, cellW, off, highlight, popScale) {
    const len = strip.length;
    const startIdx = Math.floor(off / cellH) - 1;
    const pop = popScale || 1;
    for (let i = startIdx; i < startIdx + VISIBLE + 3; i++) {
      const idx = ((i % len) + len) % len;
      const y = i * cellH - off;
      const sym = SYMBOLS[strip[idx]];
      const isCenter = highlight && Math.abs(y + cellH / 2 - cellH * 1.5) < cellH * 0.55;
      const dim = !!highlight && !isCenter;
      drawMechTile(ctx, 0, y, cellW, cellH, sym, isCenter, dim, isCenter ? pop : 1);
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function easeInQuad(t) {
    return t * t;
  }

  function centerSymbolIndex(reel) {
    const cellH = canvases[0].height / VISIBLE;
    const totalH = reel.strip.length * cellH;
    const off = ((reel.offset % totalH) + totalH) % totalH;
    const topIdx = Math.round(off / cellH) % reel.strip.length;
    return reel.strip[(topIdx + 1) % reel.strip.length];
  }

  // —— Spin ————————————————————————————————————————————
  function spin() {
    if (spinning || balance < bet) return;
    ensureAudio();
    playSfx("spin");

    spinning = true;
    balance -= bet;
    lastWin = 0;
    saveBalance();
    updateMeters();
    stopAttract();
    els.cabinet.classList.remove("attract", "winning", "big-win", "small-win");
    els.cabinet.classList.add("spinning");
    document.querySelectorAll(".reel-drum").forEach((f) => {
      f.classList.remove("winner", "win-pulse", "win-pulse-big");
    });
    setMessage("SPINNING…", "spinning");
    setMarquee("GOOD LUCK", "cyan");
    startWhir();

    const results = pickSpinResults();

    reels.forEach((reel, i) => {
      const strip = buildStrip();
      const centerPos = 5 + Math.floor(Math.random() * 12);
      strip[centerPos] = results[i];
      reel.strip = strip;
      reel.resultIndex = results[i];
      reel.landIndex = centerPos;

      const cellH = canvases[i].height / VISIBLE;
      const landOffset = (centerPos - 1) * cellH;
      // Clear L→R stagger: more spins + longer duration per column
      const spins = 5 + i * 3;
      const startNorm = ((reel.offset % (strip.length * cellH)) + strip.length * cellH) % (strip.length * cellH);
      const distance = spins * strip.length * cellH + ((landOffset - startNorm + strip.length * cellH) % (strip.length * cellH));
      const overshoot = cellH * 0.035;

      reel.phase = "spinning";
      reel.startTime = performance.now() + i * STAGGER_MS;
      reel.duration = 1200 + i * (STAGGER_MS * 2.8 + 180);
      reel.startOffset = reel.offset;
      reel.target = reel.offset + distance;
      reel.landOffset = landOffset;
      reel.overshoot = overshoot;
      reel.blur = 1;
      reel._stopped = false;
      reel._ticked = false;
    });

    requestAnimationFrame(tick);
  }

  function tick(now) {
    let allDone = true;

    reels.forEach((reel, i) => {
      if (reel.phase === "idle") return;
      allDone = false;

      const localNow = now - reel.startTime;
      if (localNow < 0) {
        drawReel(i, false);
        return;
      }

      const t = Math.min(1, localNow / reel.duration);

      if (t < 0.15) {
        const p = easeInQuad(t / 0.15);
        reel.offset = reel.startOffset + (reel.target - reel.startOffset) * p * 0.15;
        reel.blur = 0.4 + p * 0.6;
      } else if (t < 0.7) {
        const p = 0.15 + ((t - 0.15) / 0.55) * 0.55;
        reel.offset = reel.startOffset + (reel.target - reel.startOffset) * p;
        reel.blur = 1;
      } else {
        const p = easeOutCubic((t - 0.7) / 0.3);
        const base = 0.7 + p * 0.3;
        let pos = reel.startOffset + (reel.target - reel.startOffset) * base;
        if (t < 0.92) {
          pos += Math.sin(((t - 0.7) / 0.22) * Math.PI) * reel.overshoot;
        }
        reel.offset = pos;
        reel.blur = Math.max(0, 1 - p);

        if (i === 2 && t > 0.78 && t < 0.82 && !reel._ticked) {
          reel._ticked = true;
          playSfx("tick");
        }
      }

      if (t >= 1 && !reel._stopped) {
        reel._stopped = true;
        reel.phase = "idle";
        reel.blur = 0;
        const cellH = canvases[i].height / VISIBLE;
        reel.offset = (reel.landIndex - 1) * cellH;
        playSfx("clack");
        const drum = canvases[i].closest(".reel-drum");
        if (drum) drum.classList.remove("column-blur", "column-blur-hard");
        drawReel(i, false);

        if (i === 2) {
          stopWhir();
          // Hold beat before win FX (300–500ms)
          setTimeout(() => finishSpin(), HOLD_AFTER_STOP_MS);
        }
      } else {
        drawReel(i, false);
      }
    });

    if (!allDone) requestAnimationFrame(tick);
  }

  function finishSpin() {
    const results = reels.map((r) => r.resultIndex);
    results.forEach((_, i) => drawReel(i, false));
    els.cabinet.classList.remove("spinning");

    const [a, b, c] = results;
    if (a === b && b === c) {
      const sym = SYMBOLS[a];
      const payout = bet * sym.mult;
      // ×25+ / sevens / diamond get jackpot treatment
      const isBig = sym.mult >= 25 || sym.id === "seven" || sym.id === "diamond";

      // Keep WIN meter at 0 until count-up — never snap to payout
      lastWin = 0;
      els.lastWin.textContent = formatLed(0);

      els.cabinet.classList.add("winning");
      els.cabinet.classList.toggle("big-win", isBig);
      els.cabinet.classList.toggle("small-win", !isBig);
      document.querySelectorAll(".reel-drum").forEach((f) => {
        f.classList.add("winner", "win-pulse");
        f.classList.toggle("win-pulse-big", isBig);
      });

      // Phase 1: harder center-line pulse/scale ~0.4s BEFORE banner
      const popStart = performance.now();
      const amp = isBig ? 0.2 : 0.13;
      function popTick(now) {
        const t = Math.min(1, (now - popStart) / WIN_POP_MS);
        const pop = 1 + Math.sin(t * Math.PI) * amp;
        results.forEach((_, i) => drawReel(i, true, pop));
        if (t < 1) {
          requestAnimationFrame(popTick);
        } else {
          results.forEach((_, i) => drawReel(i, true, 1.05));
          revealWinPay(payout, sym, isBig);
        }
      }
      requestAnimationFrame(popTick);
    } else {
      playSfx("lose");
      setMarquee("TRY AGAIN", "");
      setMessage("NO WIN — PLAY MONEY ONLY", "lose");
      lastWin = 0;
      updateMeters();
      spinning = false;
      updateMeters();
      startAttract();
    }
  }

  function revealWinPay(payout, sym, isBig) {
    setMarquee(isBig ? "★ JACKPOT ★" : "★ WINNER ★", "win");
    setMessage(`THREE ${sym.name.toUpperCase()}!`, "win");

    if (isBig) playSfx("bigwin");
    else playSfx("win");

    // Short capped coin/chip burst toward WIN insert
    burstTowardWinMeter(isBig ? 36 : 20, sym.color, isBig);
    showWinToast(payout, sym, isBig);

    // Count-up 0→win on WIN + CREDITS (never snap)
    const balBefore = balance;
    countUpWin(payout, balBefore, () => {
      lastWin = payout;
      balance = balBefore + payout;
      saveBalance();
      updateMeters();
      spinning = false;
      updateMeters();
      setTimeout(() => {
        els.cabinet.classList.remove("winning", "big-win", "small-win");
        document.querySelectorAll(".reel-drum").forEach((f) => {
          f.classList.remove("winner", "win-pulse", "win-pulse-big");
        });
        resultsHoldClear();
        startAttract();
      }, isBig ? 1900 : 1500);
    });
  }

  function resultsHoldClear() {
    reels.forEach((_, i) => drawReel(i, false));
  }

  function countUpWin(total, balBefore, done) {
    const start = performance.now();
    // Always animate 0→win (even tiny/fast) — never snap
    const dur = Math.max(320, Math.min(1200, 420 + Math.log10(Math.max(2, total)) * 180));
    els.balance.classList.add("counting");
    els.lastWin.classList.add("counting");
    els.lastWin.textContent = formatLed(0);
    els.balance.textContent = formatLed(balBefore);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = easeOutCubic(t);
      // Ensure first painted frame is 0, last is exact total
      const val = t <= 0 ? 0 : t >= 1 ? total : Math.max(0, Math.floor(total * eased));
      els.lastWin.textContent = formatLed(val);
      els.balance.textContent = formatLed(balBefore + val);
      setMessage(`YOU WON ${formatMoney(val)} PLAY MONEY!`, "win");
      if (t < 1) requestAnimationFrame(step);
      else {
        els.lastWin.textContent = formatLed(total);
        els.balance.textContent = formatLed(balBefore + total);
        els.balance.classList.remove("counting");
        els.lastWin.classList.remove("counting");
        done();
      }
    }
    requestAnimationFrame(step);
  }

  // —— Win toast (compact; big wins get stronger treatment) ——
  let toastEl = null;
  function showWinToast(payout, sym, isBig) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "win-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.className = "win-toast" + (isBig ? " big" : "");
    toastEl.innerHTML =
      `${isBig ? "JACKPOT " : "WIN "}${formatMoney(payout)}` +
      `<span class="sub">${sym.emoji} ${sym.name.toUpperCase()} ×${sym.mult} · PLAY MONEY</span>`;
    // Force reflow then show
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), isBig ? 2000 : 1400);
  }

  // —— Particles toward WIN meter ——————————————————————
  const particles = [];
  let confettiRaf = null;

  function getWinMeterOrigin() {
    const meter = document.querySelector(".win-meter");
    if (!meter) {
      return { x: window.innerWidth * 0.65, y: window.innerHeight * 0.55 };
    }
    const r = meter.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function getReelCenter() {
    const win = document.querySelector(".glass-window");
    if (!win) {
      return { x: window.innerWidth / 2, y: window.innerHeight * 0.38 };
    }
    const r = win.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function burstTowardWinMeter(count, accent, isBig) {
    const canvas = els.confetti;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.min(count, MAX_PARTICLES - particles.length);
    const colors = [accent || "#c9a227", "#f0d878", "#5eead4", "#ffffff", "#ef4444", "#d4a017"];
    const from = getReelCenter();
    const to = getWinMeterOrigin();

    for (let i = 0; i < n; i++) {
      const delay = Math.random() * (isBig ? 0.12 : 0.08);
      // Mostly fly toward WIN meter with scatter
      const tx = to.x + (Math.random() - 0.5) * 36;
      const ty = to.y + (Math.random() - 0.5) * 20;
      const dx = tx - from.x;
      const dy = ty - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = (isBig ? 6.5 : 5.2) + Math.random() * (isBig ? 7 : 5);
      const roll = Math.random();
      const kind = roll > 0.55 ? "coin" : roll > 0.22 ? "chip" : "spark";
      particles.push({
        x: from.x + (Math.random() - 0.5) * 54,
        y: from.y + (Math.random() - 0.5) * 30,
        vx: (dx / dist) * speed * (0.88 + Math.random() * 0.4) + (Math.random() - 0.5) * 1.4,
        vy: (dy / dist) * speed * (0.88 + Math.random() * 0.4) - Math.random() * 1.2,
        life: 1,
        decay: (isBig ? 0.012 : 0.016) + Math.random() * 0.012,
        color: colors[i % colors.length],
        size: (kind === "chip" ? 3.5 : 2.5) + Math.random() * (isBig ? 4.5 : 3.2),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.28,
        kind,
        targetX: tx,
        targetY: ty,
        delay,
      });
    }
    if (!confettiRaf) confettiRaf = requestAnimationFrame(paintConfetti);
  }

  function paintConfetti() {
    const canvas = els.confetti;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.delay > 0) {
        p.delay -= 0.016;
        continue;
      }
      // Soft homing toward WIN meter early in life
      if (p.life > 0.35 && p.targetX != null) {
        p.vx += (p.targetX - p.x) * 0.014;
        p.vy += (p.targetY - p.y) * 0.014;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.985;
      p.rot += p.vr;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.kind === "coin") {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.ellipse(-p.size * 0.2, -p.size * 0.15, p.size * 0.28, p.size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "chip") {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 5;
        roundRect(ctx, -p.size * 0.55, -p.size * 0.22, p.size * 1.1, p.size * 0.44, p.size * 0.12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.35);
      }
      ctx.restore();
    }

    if (particles.length) {
      confettiRaf = requestAnimationFrame(paintConfetti);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      confettiRaf = null;
    }
  }

  // —— Attract ————————————————————————————————————————
  const ATTRACT_MSGS = [
    "TRY YOUR LUCK",
    "PLAY MONEY ONLY",
    "HIT SPIN TO PLAY",
    "NO REAL CASH",
    "JACKPOT DREAMS",
  ];

  function startAttract() {
    if (spinning) return;
    els.cabinet.classList.add("attract");
    if (attractTimer) clearInterval(attractTimer);
    attractTimer = setInterval(() => {
      attractIdx = (attractIdx + 1) % ATTRACT_MSGS.length;
      setMarquee(ATTRACT_MSGS[attractIdx], attractIdx % 2 ? "cyan" : "");
    }, 2200);
  }

  function stopAttract() {
    if (attractTimer) {
      clearInterval(attractTimer);
      attractTimer = null;
    }
  }

  // —— LEDs / candles / paytable ——————————————————————
  function buildCandles() {
    if (!els.candleBar) return;
    els.candleBar.innerHTML = "";
    for (let i = 0; i < 14; i++) {
      const d = document.createElement("div");
      d.className = "candle";
      d.style.setProperty("--i", String(i));
      d.style.animationDelay = `${(i * 0.09).toFixed(2)}s`;
      els.candleBar.appendChild(d);
    }
    document.querySelectorAll(".marquee-bulbs").forEach((col, colIdx) => {
      col.innerHTML = "";
      for (let i = 0; i < 5; i++) {
        const b = document.createElement("span");
        b.className = "bulb";
        const idx = colIdx * 5 + i;
        b.style.setProperty("--i", String(idx));
        b.style.animationDelay = `${(idx * 0.11).toFixed(2)}s`;
        col.appendChild(b);
      }
    });
  }

  function buildPaytable() {
    els.paytable.innerHTML = "";
    [...SYMBOLS].sort((a, b) => b.mult - a.mult).forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML =
        `<span class="syms">${s.emoji}${s.emoji}${s.emoji}<span class="name">${s.name}</span></span>` +
        `<span class="mult">×${s.mult}</span>`;
      els.paytable.appendChild(li);
    });
  }

  // —— Events ——————————————————————————————————————————
  els.spinBtn.addEventListener("click", () => {
    ensureAudio();
    spin();
  });

  els.betButtons.addEventListener("click", (e) => {
    const btn = e.target.closest(".bet-btn");
    if (!btn || spinning) return;
    const b = Number(btn.dataset.bet);
    if (!BETS.includes(b) || b > balance) return;
    bet = b;
    playSfx("click");
    updateMeters();
  });

  els.paysTab.addEventListener("click", () => {
    const open = els.paysPanel.hasAttribute("hidden");
    if (open) {
      els.paysPanel.removeAttribute("hidden");
      els.paysTab.setAttribute("aria-expanded", "true");
    } else {
      els.paysPanel.setAttribute("hidden", "");
      els.paysTab.setAttribute("aria-expanded", "false");
    }
    playSfx("click");
  });

  els.addBtn.addEventListener("click", () => {
    ensureAudio();
    playSfx("click");
    balance += 500;
    saveBalance();
    updateMeters();
    setMessage("+$500 PLAY MONEY ADDED", "win");
    setMarquee("CREDITS IN", "cyan");
  });

  els.resetBtn.addEventListener("click", () => {
    ensureAudio();
    playSfx("click");
    balance = START_BALANCE;
    lastWin = 0;
    saveBalance();
    updateMeters();
    setMessage("RESET TO $1,000 PLAY MONEY", "spinning");
    setMarquee("RESET", "");
  });

  window.addEventListener("resize", () => {
    resizeCanvases();
    reels.forEach((_, i) => drawReel(i, false));
  });

  function boot() {
    buildCandles();
    buildPaytable();
    initReels();
    resizeCanvases();
    reels.forEach((r, i) => {
      const cellH = canvases[i].height / VISIBLE;
      r.offset = cellH;
      r.resultIndex = r.strip[1];
      drawReel(i, false);
    });
    updateMeters();
    startAttract();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
