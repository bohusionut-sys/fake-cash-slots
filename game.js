/**
 * FAKE CASH SLOTS — Vegas HD play-money slot machine
 * All cash is fictional. No real gambling.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "fakeCashSlots.balance";
  const START_BALANCE = 1000;
  const BETS = [5, 10, 25, 50, 100];
  const SYMBOL_H = 100; // logical px per symbol cell
  const VISIBLE = 3;
  const STRIP_COPIES = 8;
  const STAGGER_MS = 130;
  const MAX_PARTICLES = 90;

  /** @type {{id:string,emoji:string,name:string,mult:number,tier:string,color:string}[]} */
  const SYMBOLS = [
    { id: "cherry", emoji: "🍒", name: "Cherries", mult: 2, tier: "low", color: "#ff2d55" },
    { id: "lemon", emoji: "🍋", name: "Lemon", mult: 3, tier: "low", color: "#f5c542" },
    { id: "orange", emoji: "🍊", name: "Orange", mult: 4, tier: "low", color: "#ff8c32" },
    { id: "grape", emoji: "🍇", name: "Grapes", mult: 5, tier: "low", color: "#a855f7" },
    { id: "bell", emoji: "🔔", name: "Bell", mult: 8, tier: "mid", color: "#f5c542" },
    { id: "bar", emoji: "▬", name: "BAR", mult: 12, tier: "mid", color: "#22d3ee" },
    { id: "seven", emoji: "7", name: "Sevens", mult: 25, tier: "high", color: "#ff2d95" },
    { id: "diamond", emoji: "💎", name: "Diamond", mult: 50, tier: "high", color: "#67e8f9" },
  ];

  // Weighted reel strip (low pays more common)
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
    addBtn: document.getElementById("add-btn"),
    resetBtn: document.getElementById("reset-btn"),
    confetti: document.getElementById("confetti"),
    ledTop: document.getElementById("led-top"),
    ledBottom: document.getElementById("led-bottom"),
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

  /** @type {{offset:number, target:number, phase:string, speed:number, blur:number, resultIndex:number, strip:number[], startTime:number, duration:number, startOffset:number, overshoot:number}[]} */
  const reels = [];

  // —— Audio (procedural, Sky Hop–style) ————————————————
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
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        tone(ctx, "triangle", f, f * 1.01, 0.18, 0.07, now + i * 0.08);
      });
    } else if (kind === "bigwin") {
      const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((f, i) => {
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

  function formatMoney(n) {
    return "$" + Math.floor(n).toLocaleString("en-US");
  }

  function setMessage(text, cls) {
    els.message.textContent = text;
    els.message.className = "message" + (cls ? " " + cls : "");
  }

  function setMarquee(text, cls) {
    els.marquee.textContent = text;
    els.marquee.className = "marquee-display" + (cls ? " " + cls : "");
  }

  function updateMeters() {
    els.balance.textContent = formatMoney(balance);
    els.lastWin.textContent = formatMoney(lastWin);
    updateBetButtons();
    els.spinBtn.disabled = spinning || balance < bet;
  }

  function updateBetButtons() {
    els.betButtons.querySelectorAll(".bet-btn").forEach((btn) => {
      const b = Number(btn.dataset.bet);
      btn.classList.toggle("active", b === bet);
      btn.disabled = spinning || b > balance;
    });
  }

  // —— Weighted strip builders ——————————————————————————
  function buildWeightedPool() {
    const pool = [];
    SYMBOLS.forEach((s) => {
      const w = WEIGHTS[s.id] || 1;
      for (let i = 0; i < w; i++) pool.push(SYMBOLS.indexOf(s));
    });
    return pool;
  }

  const POOL = buildWeightedPool();

  function randomSymbolIndex() {
    return POOL[Math.floor(Math.random() * POOL.length)];
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
    // Center each reel on a symbol
    reels.forEach((r) => {
      r.offset = SYMBOL_H; // show strip[1] on center line (visible rows 0,1,2 → center is index 1)
    });
  }

  // —— Canvas symbol art ——————————————————————————————
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

  function drawJewelTile(ctx, x, y, w, h, sym, glow) {
    const r = Math.min(14, w * 0.1);
    ctx.save();
    // Tile background
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    if (sym.tier === "high") {
      grad.addColorStop(0, "#2a1838");
      grad.addColorStop(0.5, "#12081f");
      grad.addColorStop(1, "#1a0c28");
    } else if (sym.tier === "mid") {
      grad.addColorStop(0, "#1a2030");
      grad.addColorStop(1, "#0c1018");
    } else {
      grad.addColorStop(0, "#14101f");
      grad.addColorStop(1, "#0a0812");
    }
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r);
    ctx.fillStyle = grad;
    ctx.fill();

    // Neon rim
    ctx.strokeStyle = glow ? sym.color : "rgba(232,238,248,0.15)";
    ctx.lineWidth = glow ? 2.5 : 1.2;
    if (glow) {
      ctx.shadowColor = sym.color;
      ctx.shadowBlur = 18;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner specular
    ctx.beginPath();
    roundRect(ctx, x + 8, y + 8, w - 16, h * 0.28, r - 2);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();

    // Symbol
    const cx = x + w / 2;
    const cy = y + h / 2;

    if (sym.id === "seven") {
      drawChromeSeven(ctx, cx, cy, Math.min(w, h) * 0.42, glow);
    } else if (sym.id === "bar") {
      drawBar(ctx, cx, cy, w * 0.55, glow);
    } else if (sym.id === "diamond") {
      drawDiamond(ctx, cx, cy, Math.min(w, h) * 0.32, glow);
    } else if (sym.id === "bell") {
      // emoji + glow
      if (glow) {
        ctx.font = `bold ${Math.floor(h * 0.48)}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = sym.color;
        ctx.shadowBlur = 28;
        ctx.fillStyle = sym.color;
        ctx.fillText(sym.emoji, cx, cy);
        ctx.shadowBlur = 0;
      }
      ctx.font = `${Math.floor(h * 0.48)}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(sym.emoji, cx, cy);
    } else {
      // Fruit — neon outline then crisp
      const size = Math.floor(h * 0.46);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (glow || sym.tier === "low") {
        ctx.font = `${size}px serif`;
        ctx.shadowColor = sym.color;
        ctx.shadowBlur = glow ? 26 : 12;
        ctx.fillStyle = sym.color;
        ctx.fillText(sym.emoji, cx, cy);
        ctx.shadowBlur = 0;
      }
      ctx.font = `${size}px serif`;
      ctx.fillStyle = "#fff";
      ctx.fillText(sym.emoji, cx, cy);
    }
    ctx.restore();
  }

  function drawChromeSeven(ctx, cx, cy, size, glow) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${size}px "Orbitron", "Bebas Neue", sans-serif`;
    if (glow) {
      ctx.shadowColor = "#ff2d95";
      ctx.shadowBlur = 30;
      ctx.fillStyle = "#ff2d95";
      ctx.fillText("7", cx, cy);
      ctx.shadowBlur = 0;
    }
    const g = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#e8eef8");
    g.addColorStop(0.5, "#ff2d95");
    g.addColorStop(0.7, "#a8b2c4");
    g.addColorStop(1, "#7a8699");
    ctx.fillStyle = g;
    ctx.fillText("7", cx, cy);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeText("7", cx, cy);
    ctx.restore();
  }

  function drawBar(ctx, cx, cy, w, glow) {
    ctx.save();
    const h = w * 0.38;
    const x = cx - w / 2;
    const y = cy - h / 2;
    if (glow) {
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = 22;
    }
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, "#e8eef8");
    g.addColorStop(0.4, "#22d3ee");
    g.addColorStop(0.6, "#0e7490");
    g.addColorStop(1, "#7a8699");
    roundRect(ctx, x, y, w, h, 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#05030c";
    ctx.font = `900 ${Math.floor(h * 0.7)}px "Orbitron", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("BAR", cx, cy + 1);
    ctx.restore();
  }

  function drawDiamond(ctx, cx, cy, r, glow) {
    ctx.save();
    if (glow) {
      ctx.shadowColor = "#67e8f9";
      ctx.shadowBlur = 28;
    }
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.75, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.75, cy);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#67e8f9");
    g.addColorStop(0.7, "#0891b2");
    g.addColorStop(1, "#e8eef8");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // facet
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.2, cy - r * 0.15);
    ctx.lineTo(cx, cy + r * 0.1);
    ctx.lineTo(cx - r * 0.2, cy - r * 0.15);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
    ctx.restore();
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

  function drawReel(reelIndex, highlight) {
    const canvas = canvases[reelIndex];
    const ctx = ctxs[reelIndex];
    const reel = reels[reelIndex];
    const W = canvas.width;
    const H = canvas.height;
    const cellH = H / VISIBLE;
    const cellW = W;

    ctx.clearRect(0, 0, W, H);
    // Dark felt
    ctx.fillStyle = "#05030c";
    ctx.fillRect(0, 0, W, H);

    const strip = reel.strip;
    const len = strip.length;
    const totalH = len * cellH;
    // Normalize offset
    let off = ((reel.offset % totalH) + totalH) % totalH;

    // Motion blur: draw faded copies
    const blurPasses = reel.blur > 0.3 ? 3 : reel.blur > 0.1 ? 2 : 1;
    for (let pass = blurPasses - 1; pass >= 0; pass--) {
      const alpha = pass === 0 ? 1 : 0.22 / pass;
      const yShift = pass * cellH * 0.12 * reel.blur;
      ctx.globalAlpha = alpha;
      drawStripAt(ctx, strip, W, cellH, cellW, off + yShift, totalH, highlight && pass === 0);
    }
    ctx.globalAlpha = 1;

    // Vignette top/bottom
    const vig = ctx.createLinearGradient(0, 0, 0, H);
    vig.addColorStop(0, "rgba(0,0,0,0.75)");
    vig.addColorStop(0.22, "rgba(0,0,0,0)");
    vig.addColorStop(0.78, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.75)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStripAt(ctx, strip, W, cellH, cellW, off, totalH, highlight) {
    const len = strip.length;
    // Draw enough cells to cover view + 2
    const startIdx = Math.floor(off / cellH) - 1;
    for (let i = startIdx; i < startIdx + VISIBLE + 3; i++) {
      const idx = ((i % len) + len) % len;
      const y = i * cellH - off;
      const sym = SYMBOLS[strip[idx]];
      const isCenter = highlight && Math.abs(y + cellH / 2 - (cellH * 1.5)) < cellH * 0.55;
      drawJewelTile(ctx, 0, y, cellW, cellH, sym, isCenter);
    }
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function easeInQuad(t) {
    return t * t;
  }

  // —— Spin logic ——————————————————————————————————————
  function centerSymbolIndex(reel) {
    // offset such that strip[k] is centered: offset = k * cellH conceptually
    // With VISIBLE=3, center row is the middle. offset tracks top of strip[0] relative to top of view.
    // When offset = n * SYMBOL_H (logical), strip[n] is at top; center shows strip[n+1].
    const cellH = canvases[0].height / VISIBLE;
    const totalH = reel.strip.length * cellH;
    const off = ((reel.offset % totalH) + totalH) % totalH;
    const topIdx = Math.round(off / cellH) % reel.strip.length;
    return reel.strip[(topIdx + 1) % reel.strip.length];
  }

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
    els.cabinet.classList.remove("attract", "winning");
    document.querySelectorAll(".reel-frame").forEach((f) => f.classList.remove("winner"));
    setMessage("SPINNING…", "spinning");
    setMarquee("GOOD LUCK", "cyan");
    startWhir();

    // Pick results & rebuild strips so center lands on result
    const results = [randomSymbolIndex(), randomSymbolIndex(), randomSymbolIndex()];

    reels.forEach((reel, i) => {
      // Fresh strip with result locked at center position (index 1 after land)
      const strip = buildStrip();
      const centerPos = 5 + Math.floor(Math.random() * 12);
      strip[centerPos] = results[i];
      reel.strip = strip;
      reel.resultIndex = results[i];
      reel.landIndex = centerPos;

      const cellH = canvases[i].height / VISIBLE;
      const landOffset = (centerPos - 1) * cellH;
      const spins = 6 + i * 2;
      // Travel several full loops then arrive at landOffset from a normalized start
      const startNorm = ((reel.offset % (strip.length * cellH)) + strip.length * cellH) % (strip.length * cellH);
      const distance = spins * strip.length * cellH + ((landOffset - startNorm + strip.length * cellH) % (strip.length * cellH));
      const overshoot = cellH * 0.035;

      reel.phase = "spinning";
      reel.startTime = performance.now() + i * STAGGER_MS;
      reel.duration = 1450 + i * STAGGER_MS * 2.1;
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
        // ease-in
        const p = easeInQuad(t / 0.15);
        reel.offset = reel.startOffset + (reel.target - reel.startOffset) * p * 0.15;
        reel.blur = 0.4 + p * 0.6;
      } else if (t < 0.7) {
        // constant-ish high speed
        const p = 0.15 + ((t - 0.15) / 0.55) * 0.55;
        reel.offset = reel.startOffset + (reel.target - reel.startOffset) * p;
        reel.blur = 1;
      } else {
        // ease-out with overshoot
        const p = easeOutCubic((t - 0.7) / 0.3);
        const base = 0.7 + p * 0.3;
        let pos = reel.startOffset + (reel.target - reel.startOffset) * base;
        if (t < 0.92) {
          pos += Math.sin(((t - 0.7) / 0.22) * Math.PI) * reel.overshoot;
        }
        reel.offset = pos;
        reel.blur = Math.max(0, 1 - p);

        // Anticipation tick before final reel stops
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
        drawReel(i, false);

        if (i === 2) {
          stopWhir();
          // Hold 1 beat then resolve
          setTimeout(() => finishSpin(), 280);
        }
      } else {
        drawReel(i, false);
      }
    });

    if (!allDone) {
      requestAnimationFrame(tick);
    }
  }

  function finishSpin() {
    const landed = reels.map((r) => centerSymbolIndex(r));
    // Verify / force from resultIndex (authoritative)
    const results = reels.map((r) => r.resultIndex);
    results.forEach((_, i) => drawReel(i, false));

    const [a, b, c] = results;
    if (a === b && b === c) {
      const sym = SYMBOLS[a];
      const payout = bet * sym.mult;
      lastWin = payout;
      els.cabinet.classList.add("winning");
      document.querySelectorAll(".reel-frame").forEach((f) => f.classList.add("winner"));
      results.forEach((_, i) => drawReel(i, true));

      setMarquee("★ WINNER ★", "win");
      setMessage(`THREE ${sym.name.toUpperCase()}!`, "win");

      if (sym.mult >= 25) playSfx("bigwin");
      else playSfx("win");

      burstConfetti(sym.mult >= 25 ? 80 : 55);
      showWinBanner(payout, sym);
      countUpWin(payout, () => {
        balance += payout;
        saveBalance();
        updateMeters();
        spinning = false;
        updateMeters();
        setTimeout(() => {
          els.cabinet.classList.remove("winning");
          document.querySelectorAll(".reel-frame").forEach((f) => f.classList.remove("winner"));
          startAttract();
        }, 1600);
      });
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

  function countUpWin(total, done) {
    const start = performance.now();
    const dur = Math.min(900, 400 + total * 2);
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = easeOutCubic(t);
      const val = Math.floor(total * eased);
      els.lastWin.textContent = formatMoney(val);
      setMessage(`YOU WON ${formatMoney(val)} PLAY MONEY!`, "win");
      if (t < 1) requestAnimationFrame(step);
      else {
        els.lastWin.textContent = formatMoney(total);
        done();
      }
    }
    requestAnimationFrame(step);
  }

  // —— Win banner ——————————————————————————————————————
  let bannerEl = null;
  function showWinBanner(payout, sym) {
    if (!bannerEl) {
      bannerEl = document.createElement("div");
      bannerEl.className = "win-banner";
      bannerEl.innerHTML = '<div class="win-banner-inner"></div>';
      document.body.appendChild(bannerEl);
    }
    const inner = bannerEl.querySelector(".win-banner-inner");
    inner.innerHTML = `WIN ${formatMoney(payout)}<span class="sub">${sym.emoji} ${sym.name.toUpperCase()} ×${sym.mult} · PLAY MONEY</span>`;
    bannerEl.classList.add("show");
    setTimeout(() => bannerEl.classList.remove("show"), 1800);
  }

  // —— Confetti / coin particles ———————————————————————
  const particles = [];
  let confettiRaf = null;

  function burstConfetti(count) {
    const canvas = els.confetti;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const n = Math.min(count, MAX_PARTICLES - particles.length);
    const colors = ["#f5c542", "#ff2d95", "#22d3ee", "#ffe08a", "#ffffff", "#3dff9a"];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.42;

    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      particles.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        color: colors[i % colors.length],
        size: 3 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        kind: Math.random() > 0.4 ? "coin" : "spark",
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
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.99;
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
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.4);
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

  // —— Attract mode ————————————————————————————————————
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

  // —— LEDs & marquee bulbs ————————————————————————————
  function buildLeds() {
    [els.ledTop, els.ledBottom].forEach((row) => {
      if (!row) return;
      row.innerHTML = "";
      for (let i = 0; i < 18; i++) {
        const d = document.createElement("div");
        d.className = "led";
        d.style.animationDelay = `${(i * 0.08).toFixed(2)}s`;
        row.appendChild(d);
      }
    });
    document.querySelectorAll(".marquee-bulbs").forEach((col) => {
      col.innerHTML = "";
      for (let i = 0; i < 5; i++) {
        const b = document.createElement("span");
        b.className = "bulb";
        b.style.animationDelay = `${(i * 0.15).toFixed(2)}s`;
        col.appendChild(b);
      }
    });
  }

  function buildPaytable() {
    els.paytable.innerHTML = "";
    // High to low for drama
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

  // —— Boot ————————————————————————————————————————————
  function boot() {
    buildLeds();
    buildPaytable();
    initReels();
    resizeCanvases();
    // Sync offsets to canvas cell size
    reels.forEach((r, i) => {
      const cellH = canvases[i].height / VISIBLE;
      r.offset = cellH; // center strip[1]
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
