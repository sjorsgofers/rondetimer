'use strict';

const $ = (id) => document.getElementById(id);

const STORE_KEY = 'rondetimer.v1';
const DEFAULTS = { rounds: 12, work: 180, rest: 60, warn: true };
const LIMITS = { rounds: [1, 99], work: [5, 3600], rest: [0, 900] };
// Vast aftellen voor de eerste ronde, in seconden.
const PREP = 10;
const PRESETS = [
  { name: 'Boksen', rounds: 12, work: 180, rest: 60 },
  { name: 'Kickboksen', rounds: 5, work: 180, rest: 60 },
  { name: 'Karate', rounds: 6, work: 120, rest: 30 },
  { name: 'MMA', rounds: 3, work: 300, rest: 60 },
  { name: 'Tabata', rounds: 8, work: 20, rest: 10 },
];
// Hoe ver de cijfers verticaal uitgerekt mogen worden om het scherm te vullen.
const MAX_STRETCH = 1.8;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

let cfg = loadConfig();

function loadConfig() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { /* geen opslag */ }
  const c = { ...DEFAULTS, ...saved };
  for (const field of Object.keys(LIMITS)) {
    c[field] = clamp(Math.round(Number(c[field])) || DEFAULTS[field], LIMITS[field]);
  }
  if (saved && saved.rest === 0) c.rest = 0;
  c.warn = Boolean(c.warn);
  return c;
}

function saveConfig() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch { /* geen opslag */ }
}

/* ---------- Instellen ---------- */

function stepFor(field, value, dir) {
  if (field === 'rounds') return 1;
  // Omlaag vanaf een grens gebruikt de kleinere stap, zodat waarden netjes blijven.
  const v = dir < 0 ? value - 1 : value;
  if (v < 60) return 5;
  if (v < 300) return 15;
  return 30;
}

function change(field, dir) {
  const next = clamp(cfg[field] + dir * stepFor(field, cfg[field], dir), LIMITS[field]);
  if (next === cfg[field]) return;
  cfg[field] = next;
  saveConfig();
  renderSetup();
}

function renderSetup() {
  $('v-rounds').textContent = cfg.rounds;
  $('v-work').textContent = fmt(cfg.work);
  $('v-rest').textContent = cfg.rest ? fmt(cfg.rest) : 'geen';
  $('warn').checked = cfg.warn;
  const total = cfg.rounds * cfg.work + (cfg.rounds - 1) * cfg.rest;
  const hours = Math.floor(total / 3600);
  const text = hours ? `${hours}:${fmt(total % 3600).padStart(5, '0')}` : fmt(total);
  $('total').innerHTML = `Totale duur<b>${text}</b>`;
  document.querySelectorAll('.preset').forEach((btn, i) => {
    const p = PRESETS[i];
    btn.classList.toggle('active', p.rounds === cfg.rounds && p.work === cfg.work && p.rest === cfg.rest);
  });
}

function buildPresets() {
  const box = $('presets');
  PRESETS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.innerHTML = `<b>${p.name}</b><span>${p.rounds} × ${fmt(p.work)} · pauze ${fmt(p.rest)}</span>`;
    btn.addEventListener('click', () => {
      Object.assign(cfg, { rounds: p.rounds, work: p.work, rest: p.rest });
      saveConfig();
      renderSetup();
    });
    box.appendChild(btn);
  });
}

// Ingedrukt houden herhaalt de stap.
function bindSteppers() {
  let delay = null;
  let repeat = null;
  const stop = () => { clearTimeout(delay); clearInterval(repeat); };
  document.querySelectorAll('.step').forEach((btn) => {
    const { field } = btn.dataset;
    const dir = Number(btn.dataset.dir);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      stop();
      change(field, dir);
      delay = setTimeout(() => { repeat = setInterval(() => change(field, dir), 90); }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

/* ---------- Geluid ---------- */

let actx = null;
let master = null;
let silentAudio = null;

function audio() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 1.6;
  const comp = actx.createDynamicsCompressor();
  // Zachte begrenzer: zo hard mogelijk zonder te kraken.
  const limiter = actx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 2.2);
  limiter.curve = curve;
  master.connect(comp).connect(limiter).connect(actx.destination);
  return actx;
}

function silentWavUrl() {
  const rate = 8000;
  const buf = new ArrayBuffer(44 + rate);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + rate, true); str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, rate, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// Moet vanuit een tik op het scherm worden aangeroepen (eis van iOS).
function unlockAudio() {
  const ctx = audio();
  if (!ctx) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // Zorgt dat de bel ook klinkt als de iPad op stil staat.
  if (navigator.audioSession) {
    try { navigator.audioSession.type = 'playback'; } catch { /* niet ondersteund */ }
  } else {
    if (!silentAudio) {
      silentAudio = new Audio(silentWavUrl());
      silentAudio.loop = true;
      silentAudio.setAttribute('playsinline', '');
    }
    silentAudio.play().catch(() => {});
  }
}

// Boventonen van de bel: [verhouding tot grondtoon, sterkte, uitklinktijd in s]
const BELL_PARTIALS = [
  [1.00, 1.00, 2.6], [2.00, 0.55, 2.0], [2.76, 0.50, 1.6], [3.90, 0.36, 1.2],
  [5.40, 0.30, 0.9], [6.80, 0.20, 0.7], [8.90, 0.14, 0.5],
];

function noiseBurst(ctx, t, { freq, q, level, decay }) {
  const len = Math.ceil(ctx.sampleRate * (decay + 0.02));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter).connect(gain).connect(master);
  src.start(t);
}

function strike(ctx, t) {
  const f0 = 587;
  for (const [ratio, level, decay] of BELL_PARTIALS) {
    // Twee licht verstemde oscillatoren geven de zweving van echt metaal.
    for (const cents of [-4, 4]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f0 * ratio;
      osc.detune.value = cents;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level * 0.5, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }
  // De klap van de hamer.
  noiseBurst(ctx, t, { freq: 3200, q: 0.8, level: 0.9, decay: 0.05 });
}

function bell(times) {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.03;
  for (let i = 0; i < times; i++) strike(ctx, t0 + i * 0.4);
}

// Houten klepper: waarschuwing dat de ronde bijna om is.
function clapper() {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.03;
  for (let i = 0; i < 3; i++) noiseBurst(ctx, t0 + i * 0.16, { freq: 1500, q: 3, level: 2.2, decay: 0.07 });
}

function beep() {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime + 0.02;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 880;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.setValueAtTime(0.25, t + 0.1);
  gain.gain.linearRampToValueAtTime(0, t + 0.13);
  osc.connect(gain).connect(master);
  osc.start(t);
  osc.stop(t + 0.15);
}

/* ---------- Scherm aan houden ---------- */

let wakeLock = null;

async function keepAwake(on) {
  if (!on) {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    return;
  }
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* geweigerd of niet ondersteund */ }
}

/* ---------- Klok zo groot mogelijk ---------- */

const timerEl = $('timer');
const stage = $('stage');
const clock = $('clock');
const barFill = $('barFill');

let metrics = null;
let clockText = '';

// Meet de cijfers één keer op 100px; daarna is schalen alleen rekenwerk.
function measure() {
  const probe = document.createElement('span');
  probe.className = 'clockfont';
  probe.style.cssText = 'position:absolute;visibility:hidden;font-size:100px';
  stage.appendChild(probe);
  const width = (s) => { probe.textContent = s; return probe.getBoundingClientRect().width; };
  const digit = Math.max(...'0123456789'.split('').map(width));
  const colon = width(':');
  const cs = getComputedStyle(probe);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
  const m = ctx.measureText('0123456789');
  probe.remove();
  const asc = m.actualBoundingBoxAscent || 72;
  const desc = m.actualBoundingBoxDescent || 0;
  // Afstand tussen het midden van de regel en het midden van de cijfers zelf.
  const offset = m.fontBoundingBoxAscent === undefined
    ? 0
    : ((m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) - (asc - desc)) / 2;
  metrics = { digit: digit / 100, colon: colon / 100, height: (asc + desc) / 100, offset: offset / 100 };
}

function fit() {
  if (timerEl.hidden || !clockText) return;
  if (!metrics) measure();
  const box = stage.getBoundingClientRect();
  const maxW = box.width * 0.97;
  const maxH = box.height * 0.95;
  const digits = clockText.length - 1;
  const widthEm = digits * metrics.digit + metrics.colon;
  let size = maxW / widthEm;
  let stretch = 1;
  if (size * metrics.height > maxH) size = maxH / metrics.height;
  else stretch = Math.min(maxH / (size * metrics.height), MAX_STRETCH);
  const off = metrics.offset * size;
  clock.style.fontSize = `${size}px`;
  clock.style.setProperty('--dw', `${metrics.digit}em`);
  clock.style.transformOrigin = `50% calc(50% + ${off}px)`;
  clock.style.transform = `translateY(${-off}px) scaleY(${stretch})`;
}

function drawClock(secs) {
  const text = fmt(secs);
  const resized = text.length !== clockText.length;
  clockText = text;
  clock.innerHTML = [...text]
    .map((ch) => (ch === ':' ? '<span class="c">:</span>' : `<span class="d">${ch}</span>`))
    .join('');
  if (resized) fit();
}

/* ---------- Timer ---------- */

let run = null;
let ticker = null;

function showScreen(name) {
  $('setup').hidden = name !== 'setup';
  timerEl.hidden = name !== 'timer';
}

function startSession() {
  unlockAudio();
  keepAwake(true);
  run = { round: 1, phase: null, endAt: 0, dur: 0, paused: false, left: 0, lastSec: null };
  clockText = '';
  showScreen('timer');
  enterPhase('prep', Date.now());
  clearInterval(ticker);
  ticker = setInterval(tick, 100);
}

function enterPhase(phase, from, silent) {
  run.phase = phase;
  run.dur = { prep: PREP, round: cfg.work, rest: cfg.rest }[phase] * 1000;
  run.endAt = from + run.dur;
  run.lastSec = null;
  if (phase === 'round' && !silent) bell(1);
  renderPhase();
  tick();
}

function nextPhase() {
  const now = Date.now();
  // Sluit aan op het einde van de vorige fase, tenzij de app op de achtergrond stond.
  const from = now - run.endAt < 1000 ? run.endAt : now;
  if (run.phase === 'round') {
    bell(3);
    if (run.round >= cfg.rounds) return finish();
    if (cfg.rest > 0) return enterPhase('rest', from);
    run.round++;
    return enterPhase('round', from, true);
  }
  if (run.phase === 'rest') run.round++;
  return enterPhase('round', from);
}

function tick() {
  if (!run || run.paused || run.phase === 'done') return;
  const left = run.endAt - Date.now();
  if (left <= 0) { nextPhase(); return; }
  barFill.style.transform = `scaleX(${1 - left / run.dur})`;
  const secs = Math.ceil(left / 1000);
  if (secs === run.lastSec) return;
  run.lastSec = secs;
  drawClock(secs);
  const lastTen = run.phase === 'round' && secs <= 10 && cfg.work > 10;
  timerEl.classList.toggle('last10', lastTen);
  if (run.phase === 'round') {
    if (cfg.warn && secs === 10 && cfg.work > 10) clapper();
  } else if (secs <= 3) {
    beep();
  }
}

function renderPhase() {
  const { phase, round, paused } = run;
  const done = phase === 'done';
  timerEl.dataset.phase = phase;
  timerEl.classList.toggle('paused', paused);
  if (phase !== 'round') timerEl.classList.remove('last10');
  const shown = phase === 'rest' ? round + 1 : round;
  $('roundLabel').textContent = `${phase === 'rest' ? 'STRAKS: ' : ''}RONDE ${shown} / ${cfg.rounds}`;
  clock.hidden = done;
  $('doneText').hidden = !done;
  $('pauseBtn').hidden = done || paused;
  $('resumeBtn').hidden = done || !paused;
  $('againBtn').hidden = !done;
  $('stopBtn').hidden = !done && !paused;
  $('stopBtn').textContent = done ? 'TERUG' : 'STOP';
}

function pause() {
  if (!run || run.paused || run.phase === 'done') return;
  run.paused = true;
  run.left = run.endAt - Date.now();
  renderPhase();
}

function resume() {
  if (!run || !run.paused) return;
  unlockAudio();
  keepAwake(true);
  run.paused = false;
  run.endAt = Date.now() + run.left;
  renderPhase();
  tick();
}

function finish() {
  clearInterval(ticker);
  keepAwake(false);
  run.phase = 'done';
  barFill.style.transform = 'scaleX(1)';
  renderPhase();
}

function stop() {
  clearInterval(ticker);
  keepAwake(false);
  if (silentAudio) silentAudio.pause();
  run = null;
  showScreen('setup');
}

/* ---------- Koppelen ---------- */

function bindFullscreen() {
  const root = document.documentElement;
  const request = root.requestFullscreen || root.webkitRequestFullscreen;
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!request || standalone) return;
  const btn = $('fsBtn');
  btn.hidden = false;
  btn.addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const result = request.call(root);
      if (result && result.catch) result.catch(() => {});
    }
  });
}

buildPresets();
bindSteppers();
bindFullscreen();
renderSetup();

$('warn').addEventListener('change', (e) => { cfg.warn = e.target.checked; saveConfig(); });
$('testBtn').addEventListener('click', () => { unlockAudio(); bell(1); });
$('startBtn').addEventListener('click', startSession);
$('pauseBtn').addEventListener('click', pause);
$('resumeBtn').addEventListener('click', resume);
$('againBtn').addEventListener('click', startSession);
$('stopBtn').addEventListener('click', stop);

new ResizeObserver(fit).observe(stage);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !run || run.phase === 'done') return;
  if (actx && actx.state !== 'running') actx.resume().catch(() => {});
  if (!run.paused) keepAwake(true);
  tick();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
