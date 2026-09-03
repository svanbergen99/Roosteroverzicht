(() => {
  "use strict";

  const EFFECTS = [
    { id: "snow", label: "Sneeuw", icon: "❄️" },
    { id: "fireworks", label: "Vuurwerk", icon: "🎆" },
    { id: "birthday", label: "Verjaardag", icon: "🎂" },
    { id: "orange", label: "Oranje feest", icon: "🧡" },
    { id: "hearts", label: "Hartjes", icon: "❤️" },
    { id: "stars", label: "Sterrenregen", icon: "✨" },
    { id: "petals", label: "Bloemblaadjes", icon: "🌸" },
    { id: "easter", label: "Paaseieren", icon: "🐣" },
    { id: "autumn", label: "Herfstbladeren", icon: "🍂" },
    { id: "halloween", label: "Halloween", icon: "🦇" },
    { id: "sinterklaas", label: "Sinterklaas", icon: "🎁" },
    { id: "christmas", label: "Kerstmis", icon: "🎄" }
  ];

  const COLORS = ["#ff4d6d", "#ff9f1c", "#ffd60a", "#2ec4b6", "#00b4d8", "#4361ee", "#8b5cf6", "#ec4899"];
  const ORANGE = ["#ff6200", "#ff7b00", "#ff9f1c", "#ffffff", "#21468b", "#ae1c28"];
  const FIREWORK = ["#ffffff", "#ffd166", "#ff4d6d", "#06d6a0", "#4cc9f0", "#a78bfa", "#f72585"];
  const PASTEL = ["#ffd6e0", "#ffe5b4", "#fff3b0", "#caffbf", "#bde0fe", "#cdb4db"];
  const CHRISTMAS = ["#d90429", "#2b9348", "#ffd166", "#ffffff"];
  const HALLOWEEN = ["#ff7b00", "#ff9f1c", "#7b2cbf", "#3c096c", "#111827"];
  const SINTERKLAAS = ["#b91c1c", "#dc2626", "#f6c453", "#ffffff"];

  const MOBILE = () => window.innerWidth < 680;
  const CAP = () => MOBILE() ? 220 : 360;
  const ACTIVE_EFFECT_DURATION_MS = 12000;
  const ACTIVE_EFFECT_FADE_AT_MS = 11200;
  const ACTIVE_EMITTER_UNTIL_MS = 10200;

  let canvas = null;
  let ctx = null;
  let particles = [];
  let emitters = [];
  let animationFrame = 0;
  let startedAt = 0;
  let endAt = 0;
  let lastTime = 0;
  let sceneGlow = null;
  let fadeTimer = 0;
  let hardStopTimer = 0;
  let effectsMenu = null;
  let effectsButton = null;

  const random = (min, max) => min + Math.random() * (max - min);
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "effect-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: true });
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function base(overrides = {}) {
    return {
      x: 0, y: 0, px: 0, py: 0,
      vx: 0, vy: 0, gravity: 0, drag: 1,
      size: 16, color: "#fff", color2: "#fff",
      rotation: 0, rotationSpeed: 0,
      phase: random(0, Math.PI * 2), wobble: 0, wobbleSpeed: 0,
      opacity: 1, age: 0, life: 5,
      kind: "emoji", text: "✨", layer: 1,
      ...overrides
    };
  }

  function push(particle) {
    if (particles.length >= CAP()) return;
    if (["confetti", "ribbon", "snow", "emoji", "star", "petal"].includes(particle.kind) && particle.vy > 0) {
      particle.vy *= 1.32;
      particle.gravity *= 1.08;
    }
    particle.px = particle.x;
    particle.py = particle.y;
    particles.push(particle);
  }

  function addEmitter(interval, duration, fn, immediate = true) {
    const compactInterval = Math.max(260, interval * .78);
    emitters.push({
      interval: compactInterval,
      until: startedAt + ACTIVE_EMITTER_UNTIL_MS,
      next: startedAt + (immediate ? 0 : compactInterval),
      fn
    });
  }

  function confettiRain(count, palette = COLORS, ySpread = 0.7) {
    const w = innerWidth;
    const h = innerHeight;
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: Math.random() < 0.2 ? "ribbon" : "confetti",
        x: random(-30, w + 30), y: random(-h * ySpread, 20),
        vx: random(-55, 55), vy: random(120, 245), gravity: random(24, 52), drag: .997,
        size: random(8, 18), color: pick(palette), rotation: random(0, Math.PI * 2),
        rotationSpeed: random(-8, 8), wobble: random(8, 26), wobbleSpeed: random(2.8, 6.8),
        life: random(5.5, 8.5)
      }));
    }
  }

  function confettiCannons(palette = COLORS, amount = 80) {
    const h = innerHeight;
    [[20, 1], [innerWidth - 20, -1]].forEach(([x, direction]) => {
      for (let i = 0; i < amount / 2; i += 1) {
        const speed = random(210, 470);
        push(base({
          kind: Math.random() < .22 ? "ribbon" : "confetti",
          x, y: h - random(0, 90),
          vx: direction * speed * random(.38, .86), vy: -speed * random(.65, 1.05),
          gravity: random(130, 210), drag: .992, size: random(9, 18), color: pick(palette),
          rotation: random(0, Math.PI * 2), rotationSpeed: random(-10, 10),
          wobble: random(6, 18), wobbleSpeed: random(3, 7), life: random(4.2, 6.6)
        }));
      }
    });
  }

  function fallingEmoji(count, texts, options = {}) {
    const w = innerWidth;
    const h = innerHeight;
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: "emoji", text: pick(texts),
        x: random(-30, w + 30), y: random(options.yMin ?? -h * .9, options.yMax ?? 30),
        vx: random(options.vxMin ?? -38, options.vxMax ?? 38),
        vy: random(options.vyMin ?? 58, options.vyMax ?? 125),
        gravity: options.gravity ?? 4, drag: options.drag ?? .999,
        size: random(options.sizeMin ?? 24, options.sizeMax ?? 48),
        rotation: random(-.35, .35), rotationSpeed: random(-1.1, 1.1),
        wobble: random(8, 30), wobbleSpeed: random(1.1, 2.7),
        life: random(options.lifeMin ?? 6.2, options.lifeMax ?? 9.2), layer: options.layer ?? 1
      }));
    }
  }

  function snow(count, depth = "mixed") {
    const h = innerHeight;
    for (let i = 0; i < count; i += 1) {
      const big = depth === "front" || (depth === "mixed" && Math.random() < .25);
      push(base({
        kind: "snow", x: random(-20, innerWidth + 20), y: random(-h, h * .08),
        vx: random(big ? -30 : -18, big ? 30 : 18), vy: random(big ? 52 : 30, big ? 105 : 72),
        size: random(big ? 9 : 3, big ? 19 : 10), color: pick(["#ffffff", "#e0f2fe", "#dbeafe"]),
        rotation: random(0, Math.PI * 2), rotationSpeed: random(-.7, .7),
        wobble: random(big ? 18 : 8, big ? 38 : 22), wobbleSpeed: random(.5, 1.5),
        life: random(8, 13), layer: big ? 3 : 0
      }));
    }
  }

  function vectorStars(count, palette = ["#ffffff", "#ffd166", "#fff4b8"], options = {}) {
    const h = innerHeight;
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: "star", x: random(0, innerWidth), y: random(options.yMin ?? -h * .65, options.yMax ?? h * .75),
        vx: random(-18, 18), vy: random(options.vyMin ?? 42, options.vyMax ?? 105),
        size: random(options.sizeMin ?? 5, options.sizeMax ?? 15), color: pick(palette),
        rotation: random(0, Math.PI), rotationSpeed: random(-1.8, 1.8),
        wobble: random(3, 16), wobbleSpeed: random(1, 3), life: random(4.8, 8), layer: 2
      }));
    }
  }

  function hearts(count) {
    const h = innerHeight;
    const palette = ["#fb7185", "#f43f5e", "#ec4899", "#f9a8d4", "#ef4444"];
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: "heart", x: random(0, innerWidth), y: random(h + 20, h * 1.35),
        vx: random(-28, 28), vy: random(-145, -76), gravity: -1,
        size: random(12, 30), color: pick(palette), rotation: random(-.35, .35),
        rotationSpeed: random(-.5, .5), wobble: random(12, 30), wobbleSpeed: random(1, 2.3),
        life: random(6.5, 10), layer: 2
      }));
    }
  }

  function balloons(count, palette = COLORS) {
    const h = innerHeight;
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: "balloon", x: random(20, innerWidth - 20), y: random(h + 30, h * 1.75),
        vx: random(-20, 20), vy: random(-118, -72), gravity: random(-2, -.3),
        size: random(22, 46), color: pick(palette), rotation: random(-.15, .15),
        wobble: random(18, 42), wobbleSpeed: random(.6, 1.5), life: random(8, 12), layer: 2
      }));
    }
  }

  function petals(count) {
    const h = innerHeight;
    const palette = ["#ffc2d1", "#ff8fab", "#fb6f92", "#ffe5ec", "#f9a8d4"];
    for (let i = 0; i < count; i += 1) {
      push(base({
        kind: "petal", x: random(-20, innerWidth + 20), y: random(-h * .8, 30),
        vx: random(-52, 52), vy: random(48, 105), gravity: 4, size: random(9, 19), color: pick(palette),
        rotation: random(0, Math.PI * 2), rotationSpeed: random(-2.8, 2.8),
        wobble: random(18, 50), wobbleSpeed: random(1.3, 3.3), life: random(6, 9)
      }));
    }
  }

  function fireworkBurst(x, y, amount = 105, forcedColor = null) {
    const color = forcedColor || pick(FIREWORK);
    const ringBias = Math.random() < .45;
    for (let i = 0; i < amount; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = ringBias ? random(175, 265) : random(95, 310);
      push(base({
        kind: "spark", x, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: random(70, 125), drag: random(.976, .987), size: random(1.8, 4.2),
        color: Math.random() < .16 ? "#ffffff" : color, opacity: 1, life: random(1.6, 2.8), layer: 3
      }));
    }
    for (let i = 0; i < 12; i += 1) {
      push(base({ kind: "star", x: x + random(-10, 10), y: y + random(-10, 10), vx: random(-70, 70), vy: random(-80, 40), gravity: 55, size: random(4, 8), color: "#ffffff", life: random(.8, 1.4), layer: 3 }));
    }
  }

  function shootingStars(count = 6) {
    for (let i = 0; i < count; i += 1) {
      const x = random(innerWidth * .05, innerWidth * .75);
      const y = random(innerHeight * .05, innerHeight * .55);
      push(base({ kind: "shooting", x, y, vx: random(230, 430), vy: random(90, 190), size: random(2, 4), color: pick(["#ffffff", "#ffd166", "#dbeafe"]), life: random(1.1, 1.8), layer: 3 }));
    }
  }

  function scene(type) {
    startedAt = performance.now();
    let duration = 8200;
    sceneGlow = null;

    switch (type) {
      case "snow":
        sceneGlow = { colors: ["#dbeafe", "#ffffff"], strength: .07 };
        snow(MOBILE() ? 150 : 250, "mixed");
        addEmitter(950, 7000, () => snow(MOBILE() ? 28 : 46, "front"), false);
        duration = 9200;
        break;
      case "fireworks":
        sceneGlow = { colors: ["#172554", "#3b0764"], strength: .10 };
        addEmitter(440, 6500, () => {
          const bursts = Math.random() < .25 ? 2 : 1;
          for (let i = 0; i < bursts; i += 1) fireworkBurst(random(innerWidth * .1, innerWidth * .9), random(innerHeight * .1, innerHeight * .62), MOBILE() ? 74 : 115);
        });
        duration = 7600;
        break;
      case "birthday":
        sceneGlow = { colors: ["#fffbeb", "#fdf2f8", "#eff6ff"], strength: .06 };
        confettiCannons(COLORS, MOBILE() ? 58 : 92);
        confettiRain(MOBILE() ? 90 : 145, COLORS, .58);
        balloons(MOBILE() ? 18 : 30, COLORS);
        addEmitter(720, 2100, () => confettiRain(MOBILE() ? 12 : 20, COLORS, .12), false);
        addEmitter(1100, 2100, () => balloons(MOBILE() ? 4 : 7, COLORS), false);
        duration = 3100;
        break;
      case "orange":
        sceneGlow = { colors: ["#ffedd5", "#fff7ed"], strength: .075 };
        confettiCannons(ORANGE, MOBILE() ? 80 : 140);
        confettiRain(MOBILE() ? 180 : 310, ORANGE);
        fallingEmoji(MOBILE() ? 22 : 38, ["🧡", "👑", "🇳🇱"], { sizeMin: 28, sizeMax: 54, vyMin: 55, vyMax: 112 });
        addEmitter(1350, 6000, () => confettiCannons(ORANGE, MOBILE() ? 38 : 62), false);
        duration = 8200;
        break;
      case "hearts":
        sceneGlow = { colors: ["#ffe4e6", "#fce7f3"], strength: .075 };
        hearts(MOBILE() ? 75 : 130);
        vectorStars(MOBILE() ? 35 : 60, ["#ffffff", "#f9a8d4", "#fecdd3"], { vyMin: 24, vyMax: 58, sizeMin: 4, sizeMax: 9 });
        addEmitter(1050, 6500, () => hearts(MOBILE() ? 18 : 30), false);
        duration = 8500;
        break;
      case "stars":
        sceneGlow = { colors: ["#172554", "#3b0764"], strength: .07 };
        vectorStars(MOBILE() ? 140 : 240, ["#ffffff", "#fde68a", "#bfdbfe"], { sizeMin: 4, sizeMax: 15, vyMin: 35, vyMax: 105 });
        shootingStars(MOBILE() ? 4 : 7);
        addEmitter(1250, 6200, () => shootingStars(MOBILE() ? 2 : 4), false);
        duration = 8200;
        break;
      case "petals":
        sceneGlow = { colors: ["#fdf2f8", "#fff1f2"], strength: .06 };
        petals(MOBILE() ? 160 : 280);
        addEmitter(1100, 6500, () => petals(MOBILE() ? 35 : 55), false);
        duration = 8500;
        break;
      case "easter":
        sceneGlow = { colors: ["#fef3c7", "#ecfccb", "#fce7f3"], strength: .07 };
        confettiRain(MOBILE() ? 110 : 190, PASTEL);
        fallingEmoji(MOBILE() ? 65 : 110, ["🥚", "🐣", "🐰", "🌷", "🌼"], { sizeMin: 26, sizeMax: 54, vyMin: 48, vyMax: 105 });
        addEmitter(1450, 6200, () => fallingEmoji(MOBILE() ? 18 : 30, ["🥚", "🌷", "🐣"], { yMin: -120, yMax: -20, sizeMin: 28, sizeMax: 50 }), false);
        duration = 8500;
        break;
      case "autumn":
        sceneGlow = { colors: ["#ffedd5", "#fef3c7"], strength: .06 };
        fallingEmoji(MOBILE() ? 120 : 210, ["🍂", "🍁", "🍃"], { sizeMin: 26, sizeMax: 54, vxMin: -65, vxMax: 65, vyMin: 44, vyMax: 105 });
        addEmitter(1100, 6500, () => fallingEmoji(MOBILE() ? 28 : 46, ["🍂", "🍁", "🍃"], { yMin: -150, yMax: -20, sizeMin: 27, sizeMax: 52, vxMin: -70, vxMax: 70 }), false);
        duration = 8500;
        break;
      case "halloween":
        sceneGlow = { colors: ["#3c096c", "#ff7b00"], strength: .09 };
        confettiRain(MOBILE() ? 80 : 140, HALLOWEEN, .45);
        fallingEmoji(MOBILE() ? 75 : 125, ["🦇", "🎃", "👻", "🕷️", "🕸️"], { sizeMin: 30, sizeMax: 62, vxMin: -58, vxMax: 58, vyMin: 48, vyMax: 115 });
        vectorStars(MOBILE() ? 36 : 65, ["#ff9f1c", "#c77dff", "#ffffff"], { vyMin: 28, vyMax: 62 });
        addEmitter(1350, 6200, () => fallingEmoji(MOBILE() ? 18 : 30, ["🦇", "🎃", "👻"], { yMin: -120, yMax: -15, sizeMin: 32, sizeMax: 58, vxMin: -70, vxMax: 70 }), false);
        duration = 8400;
        break;
      case "sinterklaas":
        sceneGlow = { colors: ["#fef2f2", "#fffbeb"], strength: .07 };
        confettiCannons(SINTERKLAAS, MOBILE() ? 60 : 100);
        fallingEmoji(MOBILE() ? 82 : 140, ["🎁", "🍪", "⭐", "🎀", "🍫"], { sizeMin: 27, sizeMax: 54, vyMin: 50, vyMax: 112 });
        vectorStars(MOBILE() ? 35 : 60, ["#ffffff", "#f6c453"], { vyMin: 28, vyMax: 66 });
        addEmitter(1250, 6500, () => fallingEmoji(MOBILE() ? 20 : 34, ["🎁", "🍪", "⭐"], { yMin: -130, yMax: -20, sizeMin: 28, sizeMax: 50 }), false);
        duration = 8500;
        break;
      case "christmas":
        sceneGlow = { colors: ["#ecfdf5", "#fef2f2", "#eff6ff"], strength: .075 };
        snow(MOBILE() ? 120 : 205, "mixed");
        fallingEmoji(MOBILE() ? 65 : 105, ["🎄", "🔔", "🎁", "⭐", "🕯️"], { sizeMin: 28, sizeMax: 54, vyMin: 46, vyMax: 98 });
        confettiRain(MOBILE() ? 55 : 95, CHRISTMAS, .35);
        vectorStars(MOBILE() ? 45 : 78, ["#ffffff", "#ffd166"], { vyMin: 24, vyMax: 55, sizeMin: 4, sizeMax: 10 });
        addEmitter(1100, 6500, () => snow(MOBILE() ? 22 : 36, "front"), false);
        addEmitter(1650, 6000, () => fallingEmoji(MOBILE() ? 12 : 20, ["🎄", "🔔", "🎁", "⭐"], { yMin: -120, yMax: -20, sizeMin: 30, sizeMax: 52 }), false);
        duration = 9000;
        break;
      default:
        return 0;
    }
    return duration;
  }

  function drawGlow(now) {
    if (!sceneGlow || !ctx) return;
    const pulse = .75 + Math.sin(now / 900) * .12;
    const alpha = sceneGlow.strength * pulse;
    const g1 = ctx.createRadialGradient(innerWidth * .22, innerHeight * .2, 0, innerWidth * .22, innerHeight * .2, Math.max(innerWidth, innerHeight) * .7);
    g1.addColorStop(0, hexAlpha(sceneGlow.colors[0], alpha));
    g1.addColorStop(1, hexAlpha(sceneGlow.colors[0], 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
    const color2 = sceneGlow.colors[1] || sceneGlow.colors[0];
    const g2 = ctx.createRadialGradient(innerWidth * .82, innerHeight * .72, 0, innerWidth * .82, innerHeight * .72, Math.max(innerWidth, innerHeight) * .62);
    g2.addColorStop(0, hexAlpha(color2, alpha * .8));
    g2.addColorStop(1, hexAlpha(color2, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, innerWidth, innerHeight);
  }

  function hexAlpha(hex, alpha) {
    const value = String(hex).replace("#", "");
    if (value.length !== 6) return `rgba(255,255,255,${alpha})`;
    const n = parseInt(value, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(alpha, 0, 1)})`;
  }

  function starPath(size) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const r = i % 2 === 0 ? size : size * .43;
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function heartPath(size) {
    const s = size / 30;
    ctx.beginPath();
    ctx.moveTo(0, 8 * s);
    ctx.bezierCurveTo(-24 * s, -8 * s, -16 * s, -25 * s, 0, -13 * s);
    ctx.bezierCurveTo(16 * s, -25 * s, 24 * s, -8 * s, 0, 8 * s);
    ctx.closePath();
  }

  function drawParticle(p) {
    const fadeIn = clamp(p.age / .22, 0, 1);
    const fadeOut = clamp((p.life - p.age) / .75, 0, 1);
    const alpha = p.opacity * Math.min(fadeIn, fadeOut);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    if (p.kind === "confetti") {
      const flip = .35 + Math.abs(Math.sin(p.age * 8 + p.phase)) * .65;
      ctx.fillStyle = p.color;
      ctx.shadowColor = hexAlpha(p.color, .35);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.roundRect(-p.size * .62, -p.size * .24 * flip, p.size * 1.24, p.size * .48 * flip, 2);
      ctx.fill();
    } else if (p.kind === "ribbon") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(2.2, p.size * .16);
      ctx.lineCap = "round";
      ctx.shadowColor = hexAlpha(p.color, .28);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(-p.size, -p.size * .2);
      ctx.bezierCurveTo(-p.size * .4, p.size * .6, p.size * .2, -p.size * .65, p.size, p.size * .2);
      ctx.stroke();
    } else if (p.kind === "spark" || p.kind === "shooting") {
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.kind === "shooting" ? p.size * 1.15 : p.size;
      ctx.lineCap = "round";
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.kind === "shooting" ? 14 : 10;
      const trail = p.kind === "shooting" ? 4.5 : 2.4;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - (p.x - p.px) * trail, p.y - (p.y - p.py) * trail);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * .55, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    } else if (p.kind === "snow") {
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.shadowColor = "rgba(255,255,255,.75)";
      ctx.shadowBlur = p.size > 10 ? 8 : 4;
      if (p.size < 7) {
        ctx.beginPath(); ctx.arc(0, 0, p.size * .48, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.lineWidth = Math.max(1, p.size * .08);
        for (let i = 0; i < 3; i += 1) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, p.size * .16, 0, Math.PI * 2); ctx.fill();
      }
    } else if (p.kind === "star") {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      starPath(p.size);
      ctx.fill();
    } else if (p.kind === "heart") {
      const gradient = ctx.createLinearGradient(-p.size, -p.size, p.size, p.size);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(.16, p.color);
      gradient.addColorStop(1, p.color);
      ctx.fillStyle = gradient;
      ctx.shadowColor = hexAlpha(p.color, .5);
      ctx.shadowBlur = 8;
      heartPath(p.size);
      ctx.fill();
    } else if (p.kind === "balloon") {
      const grad = ctx.createRadialGradient(-p.size * .25, -p.size * .32, p.size * .08, 0, 0, p.size);
      grad.addColorStop(0, "rgba(255,255,255,.92)");
      grad.addColorStop(.22, p.color);
      grad.addColorStop(1, p.color);
      ctx.fillStyle = grad;
      ctx.shadowColor = "rgba(15,23,42,.18)";
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size * .62, p.size * .82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(-4, p.size * .72); ctx.lineTo(4, p.size * .72); ctx.lineTo(0, p.size * .92); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(100,116,139,.55)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, p.size * .9); ctx.quadraticCurveTo(p.size * .2, p.size * 1.5, -p.size * .05, p.size * 2); ctx.stroke();
    } else if (p.kind === "petal") {
      ctx.fillStyle = p.color;
      ctx.shadowColor = hexAlpha(p.color, .3);
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.bezierCurveTo(p.size, -p.size * .35, p.size * .7, p.size * .55, 0, p.size);
      ctx.bezierCurveTo(-p.size * .65, p.size * .45, -p.size, -p.size * .35, 0, -p.size);
      ctx.fill();
    } else {
      ctx.font = `${Math.round(p.size)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(15,23,42,.16)";
      ctx.shadowBlur = p.size > 42 ? 6 : 3;
      ctx.fillText(p.text, 0, 0);
    }

    ctx.restore();
  }

  function updateParticle(p, dt) {
    p.px = p.x;
    p.py = p.y;
    p.age += dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotationSpeed * dt;
    if (p.wobble) p.x += Math.sin(p.age * p.wobbleSpeed + p.phase) * p.wobble * dt;
  }

  function animate(now) {
    if (!ctx || !canvas) return;
    const dt = clamp((now - lastTime) / 1000, .001, .04);
    lastTime = now;

    emitters.forEach((emitter) => {
      while (now >= emitter.next && emitter.next <= emitter.until) {
        emitter.fn();
        emitter.next += emitter.interval;
      }
    });
    emitters = emitters.filter((emitter) => emitter.next <= emitter.until);

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    drawGlow(now);

    particles.sort((a, b) => a.layer - b.layer);
    particles.forEach((p) => {
      updateParticle(p, dt);
      drawParticle(p);
    });
    particles = particles.filter((p) => p.age < p.life && p.y < innerHeight * 1.7 && p.x > -innerWidth * .35 && p.x < innerWidth * 1.35);

    if (now < endAt || particles.length || emitters.length) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      stopEffect();
    }
  }

  function stopEffect() {
    window.clearTimeout(fadeTimer);
    window.clearTimeout(hardStopTimer);
    fadeTimer = 0;
    hardStopTimer = 0;
    emitters = [];
    particles = [];
    startedAt = 0;
    endAt = 0;
    sceneGlow = null;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    if (canvas) canvas.style.opacity = "0";
    if (ctx) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  function startEffect(type) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    stopEffect();
    ensureCanvas();
    resizeCanvas();
    canvas.style.opacity = "0";
    const duration = scene(type);
    if (!duration) return;
    endAt = startedAt + ACTIVE_EFFECT_DURATION_MS;
    lastTime = performance.now();
    requestAnimationFrame(() => { if (canvas) canvas.style.opacity = "1"; });
    fadeTimer = window.setTimeout(() => {
      emitters = [];
      if (canvas) canvas.style.opacity = "0";
    }, ACTIVE_EFFECT_FADE_AT_MS);
    hardStopTimer = window.setTimeout(stopEffect, ACTIVE_EFFECT_DURATION_MS);
    animationFrame = requestAnimationFrame(animate);
  }

  function closeMenu() {
    if (!effectsMenu || !effectsButton) return;
    effectsMenu.hidden = true;
    effectsButton.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!effectsMenu || !effectsButton) return;
    effectsMenu.hidden = false;
    effectsButton.setAttribute("aria-expanded", "true");
  }

  function buildInterface() {
    const actionRow = document.querySelector(".today-workers-action");
    if (!actionRow || document.getElementById("effectsButton")) return;

    const wrap = document.createElement("div");
    wrap.className = "effects-menu-wrap";

    effectsButton = document.createElement("button");
    effectsButton.id = "effectsButton";
    effectsButton.className = "effects-button";
    effectsButton.type = "button";
    effectsButton.setAttribute("aria-haspopup", "menu");
    effectsButton.setAttribute("aria-expanded", "false");
    effectsButton.innerHTML = 'Effecten <span class="effects-button-caret" aria-hidden="true">▾</span>';

    effectsMenu = document.createElement("div");
    effectsMenu.id = "effectsMenu";
    effectsMenu.className = "effects-menu";
    effectsMenu.setAttribute("role", "menu");
    effectsMenu.hidden = true;
    effectsMenu.innerHTML = EFFECTS.map((effect) => `
      <button class="effects-menu-item" type="button" role="menuitem" data-effect="${effect.id}">
        <span class="effects-menu-icon" aria-hidden="true">${effect.icon}</span>
        <span>${effect.label}</span>
      </button>`).join("") + `
      <div class="effects-menu-separator" role="separator"></div>
      <button class="effects-menu-item stop-effect" type="button" role="menuitem" data-effect="stop">
        <span class="effects-menu-icon" aria-hidden="true">✕</span>
        <span>Effect stoppen</span>
      </button>`;

    wrap.append(effectsButton, effectsMenu);
    actionRow.appendChild(wrap);

    effectsButton.addEventListener("click", () => effectsMenu.hidden ? openMenu() : closeMenu());
    effectsMenu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-effect]");
      if (!item) return;
      const effect = item.dataset.effect;
      closeMenu();
      if (effect === "stop") stopEffect(); else startEffect(effect);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".effects-menu-wrap")) closeMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && effectsMenu && !effectsMenu.hidden) {
        closeMenu();
        effectsButton.focus();
      }
    });
  }

  window.addEventListener("resize", resizeCanvas);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildInterface, { once: true });
  else buildInterface();

  window.RoosterEffects = {
    start: startEffect,
    stop: stopEffect,
    list: () => EFFECTS.map(({ id, label }) => ({ id, label }))
  };
})();