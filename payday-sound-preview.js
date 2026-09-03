(() => {
  "use strict";

  const PRESETS = Object.freeze([
    Object.freeze({ id: "mixkit", icon: "🎧", label: "Huidige Mixkit", note: "De twee huidige WAV-bestanden" }),
    Object.freeze({ id: "coin-shower", icon: "🪙", label: "Coin Shower", note: "Veel heldere rinkelende munten" }),
    Object.freeze({ id: "cash-register", icon: "💵", label: "Cash Register", note: "Kassa-klap gevolgd door munten" }),
    Object.freeze({ id: "jackpot", icon: "🎰", label: "Jackpot Chime", note: "Casino-achtige winstmelodie + munten" }),
    Object.freeze({ id: "luxury", icon: "💎", label: "Luxury Payday", note: "Diepe impact, glans en rijke coin shower" })
  ]);

  let audioContext = null;
  let activeSources = new Set();
  let menu = null;
  let button = null;

  function getAudioContext() {
    if (!audioContext) {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      audioContext = new AudioContextCtor({ latencyHint: "interactive" });
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    return audioContext;
  }

  function remember(source) {
    activeSources.add(source);
    source.addEventListener?.("ended", () => activeSources.delete(source), { once: true });
    return source;
  }

  function stopSynth() {
    for (const source of activeSources) {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    activeSources.clear();
  }

  function stopAll() {
    stopSynth();
    window.RoosterPaydayAudio?.stop?.();
  }

  function createImpulse(ctx, seconds = .8, decay = 3.4) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  function createBus(ctx) {
    const input = ctx.createGain();
    const dry = ctx.createGain();
    const reverbSend = ctx.createGain();
    const convolver = ctx.createConvolver();
    const wet = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const master = ctx.createGain();

    dry.gain.value = .92;
    reverbSend.gain.value = .36;
    wet.gain.value = .34;
    master.gain.value = .82;
    compressor.threshold.value = -15;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = .003;
    compressor.release.value = .18;
    convolver.buffer = createImpulse(ctx);

    input.connect(dry);
    input.connect(reverbSend);
    reverbSend.connect(convolver);
    convolver.connect(wet);
    dry.connect(compressor);
    wet.connect(compressor);
    compressor.connect(master);
    master.connect(ctx.destination);
    return input;
  }

  function connectWithPan(ctx, source, bus, pan = 0) {
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      source.connect(panner);
      panner.connect(bus);
    } else {
      source.connect(bus);
    }
  }

  function metallicPing(ctx, bus, when, frequency = 2600, strength = .16, pan = 0) {
    const ratios = [1, 1.47, 2.13, 2.86];
    const gains = [1, .48, .26, .12];
    ratios.forEach((ratio, index) => {
      const osc = remember(ctx.createOscillator());
      const gain = ctx.createGain();
      osc.type = index === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(frequency * ratio, when);
      osc.frequency.exponentialRampToValueAtTime(frequency * ratio * .985, when + .16);
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, strength * gains[index]), when + .004 + index * .001);
      gain.gain.exponentialRampToValueAtTime(.0001, when + .23 + index * .075);
      osc.connect(gain);
      connectWithPan(ctx, gain, bus, pan);
      osc.start(when);
      osc.stop(when + .42 + index * .08);
    });
  }

  function shimmer(ctx, bus, when, notes, strength = .08) {
    notes.forEach((frequency, index) => {
      const osc = remember(ctx.createOscillator());
      const gain = ctx.createGain();
      osc.type = index % 2 ? "sine" : "triangle";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, when);
      gain.gain.exponentialRampToValueAtTime(strength / Math.max(1, index * .25 + 1), when + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, when + .75 + index * .08);
      osc.connect(gain);
      connectWithPan(ctx, gain, bus, index % 2 ? .25 : -.25);
      osc.start(when);
      osc.stop(when + 1.1);
    });
  }

  function impact(ctx, bus, when, strength = .22) {
    const osc = remember(ctx.createOscillator());
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(105, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + .32);
    gain.gain.setValueAtTime(.0001, when);
    gain.gain.exponentialRampToValueAtTime(strength, when + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, when + .38);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(when);
    osc.stop(when + .42);
  }

  function noiseHit(ctx, bus, when, strength = .08, duration = .09) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = remember(ctx.createBufferSource());
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = 2400;
    filter.Q.value = 1.4;
    gain.gain.setValueAtTime(strength, when);
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start(when);
  }

  function coinCascade(ctx, bus, when, count, spacing, base = 2350, spread = 900, strength = .13) {
    for (let i = 0; i < count; i += 1) {
      const offset = i * spacing + Math.random() * spacing * .45;
      const frequency = base + Math.random() * spread + (i % 4) * 110;
      const pan = -0.82 + Math.random() * 1.64;
      metallicPing(ctx, bus, when + offset, frequency, strength * (.82 + Math.random() * .34), pan);
    }
  }

  function previewCoinShower(ctx, bus, now) {
    shimmer(ctx, bus, now, [880, 1320, 1760], .045);
    coinCascade(ctx, bus, now + .04, 16, .095, 2200, 1250, .135);
    coinCascade(ctx, bus, now + .72, 9, .08, 2700, 900, .095);
  }

  function previewCashRegister(ctx, bus, now) {
    noiseHit(ctx, bus, now, .11, .045);
    impact(ctx, bus, now + .035, .16);
    shimmer(ctx, bus, now + .08, [1046.5, 1568, 2093], .065);
    metallicPing(ctx, bus, now + .13, 3050, .2, -.15);
    metallicPing(ctx, bus, now + .24, 3920, .17, .18);
    coinCascade(ctx, bus, now + .34, 9, .105, 2350, 1050, .12);
  }

  function previewJackpot(ctx, bus, now) {
    const melody = [659.25, 783.99, 987.77, 1318.51, 1567.98];
    melody.forEach((frequency, index) => {
      shimmer(ctx, bus, now + index * .12, [frequency, frequency * 2], .065);
      metallicPing(ctx, bus, now + index * .12 + .018, frequency * 3.1, .085, -0.55 + index * .28);
    });
    impact(ctx, bus, now + .48, .11);
    coinCascade(ctx, bus, now + .54, 14, .075, 2450, 1350, .105);
  }

  function previewLuxury(ctx, bus, now) {
    impact(ctx, bus, now, .22);
    noiseHit(ctx, bus, now + .012, .055, .065);
    shimmer(ctx, bus, now + .04, [523.25, 783.99, 1046.5, 1567.98, 2093], .072);
    metallicPing(ctx, bus, now + .11, 3300, .2, -.25);
    metallicPing(ctx, bus, now + .18, 4180, .17, .28);
    coinCascade(ctx, bus, now + .28, 18, .085, 2300, 1550, .125);
    shimmer(ctx, bus, now + 1.12, [1046.5, 1318.51, 1567.98, 2093], .045);
  }

  function previewSynth(id) {
    stopAll();
    const ctx = getAudioContext();
    if (!ctx) return;
    const bus = createBus(ctx);
    const now = ctx.currentTime + .025;
    if (id === "coin-shower") previewCoinShower(ctx, bus, now);
    else if (id === "cash-register") previewCashRegister(ctx, bus, now);
    else if (id === "jackpot") previewJackpot(ctx, bus, now);
    else if (id === "luxury") previewLuxury(ctx, bus, now);
  }

  function preview(id) {
    if (id === "mixkit") {
      stopAll();
      window.RoosterPaydayAudio?.play?.();
      return;
    }
    previewSynth(id);
  }

  function closeMenu() {
    if (!menu || !button) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (!menu || !button) return;
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
  }

  function ensureInterface() {
    if (document.getElementById("paydayPreviewWrap")) return true;
    const shell = document.getElementById("backgroundBrightnessBar");
    const effects = shell?.querySelector(".brightness-effects-wrap");
    if (!shell || !effects) return false;

    const wrap = document.createElement("div");
    wrap.id = "paydayPreviewWrap";
    wrap.className = "payday-preview-wrap";
    wrap.innerHTML = `
      <button id="paydayPreviewButton" class="payday-preview-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="paydayPreviewMenu">
        Payday <span aria-hidden="true">▾</span>
      </button>
      <div id="paydayPreviewMenu" class="payday-preview-menu" role="menu" hidden>
        <div class="payday-preview-heading">Beluister Payday-geluiden</div>
        ${PRESETS.map((preset) => `
          <button class="payday-preview-item" type="button" role="menuitem" data-payday-preview="${preset.id}">
            <span class="payday-preview-icon" aria-hidden="true">${preset.icon}</span>
            <span class="payday-preview-copy"><strong>${preset.label}</strong><small>${preset.note}</small></span>
            <span class="payday-preview-play" aria-hidden="true">▶</span>
          </button>`).join("")}
        <div class="payday-preview-separator" role="separator"></div>
        <button class="payday-preview-item payday-preview-stop" type="button" role="menuitem" data-payday-preview="stop">
          <span class="payday-preview-icon" aria-hidden="true">■</span>
          <span class="payday-preview-copy"><strong>Geluid stoppen</strong><small>Stop de huidige preview</small></span>
        </button>
      </div>`;

    effects.after(wrap);
    button = wrap.querySelector("#paydayPreviewButton");
    menu = wrap.querySelector("#paydayPreviewMenu");

    button?.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMenu();
    });

    menu?.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = event.target.closest("[data-payday-preview]");
      if (!item) return;
      const id = item.dataset.paydayPreview;
      if (id === "stop") stopAll();
      else preview(id);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest("#paydayPreviewWrap")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu && !menu.hidden) {
        closeMenu();
        button?.focus();
      }
    });
    return true;
  }

  function ensureWithRetry() {
    if (ensureInterface()) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (ensureInterface() || attempts >= 80) window.clearInterval(timer);
    }, 100);
  }

  const observer = new MutationObserver(() => ensureInterface());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("rooster-unlocked", ensureWithRetry);
  window.addEventListener("rooster-months-updated", ensureWithRetry);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureWithRetry, { once: true });
  else ensureWithRetry();

  window.RoosterPaydaySoundPreview = Object.freeze({
    play: preview,
    stop: stopAll,
    presets: () => PRESETS.map(({ id, label }) => ({ id, label }))
  });
})();
