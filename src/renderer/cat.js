// Sprite-sheet desktop cat: walks, faces the cursor, sits, grooms, sleeps and
// does jump animations for startle/bop. Sheet = 8 cols x 10 rows of 32x32 frames.

// ---------------------------------------------------------------------------
// sheet + scaling
// ---------------------------------------------------------------------------
const FW = 32, FH = 32;
let PIXEL = 4;                   // frame -> screen scale (Small/Med/Large = 3/4/5)
let SW = FW * PIXEL, SH = FH * PIXEL;
const MARGIN = 8;
let corner = 'br';

const sheetImg = new Image();
let sheetReady = false;
sheetImg.onload = () => { sheetReady = true; try { window.catApi.report('sheet loaded ' + sheetImg.width + 'x' + sheetImg.height); } catch (_) {} };
sheetImg.onerror = () => { try { window.catApi.report('SHEET FAILED to load'); } catch (_) {} };
sheetImg.src = 'sheet.png';
window.addEventListener('error', (e) => { try { window.catApi.report('ERR ' + (e.message || (e.error && e.error.message))); } catch (_) {} });

// clip = { row, c0, n, fps, loop }   (walkL = walkR flipped)
const CLIPS = {
  sit:    { row: 0, c0: 0, n: 4, fps: 3, loop: true },
  groom:  { row: 3, c0: 0, n: 4, fps: 6, loop: true },
  meow:   { row: 2, c0: 0, n: 4, fps: 6, loop: true },
  walkR:  { row: 4, c0: 0, n: 8, fps: 10, loop: true },
  scared: { row: 8, c0: 1, n: 3, fps: 12, loop: true },
  sleep:  { row: 5, c0: 1, n: 3, fps: 4, loop: false },
};

const stage = document.getElementById('stage');
const ctx = stage.getContext('2d');
let DPR = 1, W = window.innerWidth, H = window.innerHeight;

function applyScale(px) { PIXEL = px; SW = FW * PIXEL, SH = FH * PIXEL; }
function positionCorner(c) {
  corner = c;
  if (c === 'br') { cat.x = W - SW / 2 - MARGIN; cat.y = H - SH / 2 - MARGIN; }
  else if (c === 'bc') { cat.x = W / 2; cat.y = H - SH / 2 - MARGIN; }
  else if (c === 'bl') { cat.x = SW / 2 + MARGIN; cat.y = H - SH / 2 - MARGIN; }
  if (c !== 'free') { cat.home = { x: cat.x, y: cat.y }; cat.mode = 'sit'; }
}
let prevDirty = { x: 0, y: 0, w: 0, h: 0 };
function resize() {
  DPR = window.devicePixelRatio || 1;
  W = window.innerWidth; H = window.innerHeight;
  stage.width = Math.round(W * DPR); stage.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.imageSmoothingEnabled = false;
  prevDirty = { x: 0, y: 0, w: W, h: H };
  if (corner !== 'free') positionCorner(corner);
}
window.addEventListener('resize', resize);

// global (physical px) -> local CSS px
let ORIGIN = { x: 0, y: 0 }, SCALE = 1;
const toLocal = (gx, gy) => ({ x: gx / SCALE - ORIGIN.x, y: gy / SCALE - ORIGIN.y });

// ---------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const now = () => performance.now() / 1000;

const cat = {
  x: 0, y: 0, home: { x: 0, y: 0 },
  mode: 'sit',                   // sit | walk | sleep | react | drag
  clipName: 'sit', clipT: 0,
  faceLeft: false,
  target: { x: 0, y: 0 }, runSpeed: 0,
  reactClip: 'sit', reactT: 0, reactFlee: false,
  bubble: null, bubbleT: 0,
  groomUntil: 0, idleNext: 4, zT: 0,
  typingUntil: 0, tapPhase: 0, tapSpeed: 6,
  mood: 0.6, lastActivity: 0,
};
let muted = false;

let interactive = false;
function setInteractive(v) { if (v === interactive) return; interactive = v; window.catApi.setInteractive(v); }

let cursor = { x: -9999, y: -9999 };
let pressing = false, dragging = false, dragOff = { x: 0, y: 0 }, pressPos = { x: 0, y: 0 };
let clickStreak = 0, lastClickAt = 0, typeTimes = [];

function inCat(px, py) {
  const dx = (px - cat.x) / (SW * 0.32), dy = (py - (cat.y + SH * 0.06)) / (SH * 0.3);
  return dx * dx + dy * dy <= 1;
}
function clampPos() { cat.x = clamp(cat.x, SW / 2, W - SW / 2); cat.y = clamp(cat.y, SH / 2, H - SH / 2); }

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------
const particles = [];
function spawnHearts(n) { for (let i = 0; i < n; i++) particles.push({ kind: 'heart', x: cat.x + (Math.random() - 0.5) * SW * 0.4, y: cat.y - SH * 0.25, vx: (Math.random() - 0.5) * 24, vy: -32 - Math.random() * 22, life: 0, max: 0.9 + Math.random() * 0.5, s: 2.4 + Math.random() }); }
function spawnStars(n) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 28 + Math.random() * 40; particles.push({ kind: 'star', x: cat.x + (Math.random() - 0.5) * SW * 0.3, y: cat.y - SH * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 8, life: 0, max: 0.7 + Math.random() * 0.4, s: 2.2 + Math.random() }); } }
function spawnZ() { particles.push({ kind: 'zzz', x: cat.x + SW * 0.2, y: cat.y - SH * 0.28, vx: 9, vy: -20, life: 0, max: 1.6, s: 9 + Math.random() * 5 }); }

// ---------------------------------------------------------------------------
// sound
// ---------------------------------------------------------------------------
let actx = null;
function ac() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); return actx; } catch (_) { return null; } }
function blip(freq, dur, type = 'sine', vol = 0.05, delay = 0) {
  if (muted) return; const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
const snd = {
  pet: () => { blip(680, 0.12, 'sine', 0.05); blip(900, 0.13, 'sine', 0.04, 0.08); },
  bop: () => { blip(300, 0.16, 'triangle', 0.06); blip(170, 0.2, 'triangle', 0.05, 0.06); },
  startled: () => blip(1020, 0.08, 'square', 0.035),
  happy: () => { blip(523, 0.1, 'sine', 0.045); blip(659, 0.1, 'sine', 0.045, 0.09); blip(784, 0.13, 'sine', 0.04, 0.18); },
  wave: () => { blip(720, 0.1, 'sine', 0.045); blip(520, 0.13, 'sine', 0.04, 0.1); },
  email: () => { blip(660, 0.1, 'sine', 0.045); blip(880, 0.1, 'sine', 0.045, 0.09); blip(990, 0.14, 'sine', 0.04, 0.18); },
};

// ---------------------------------------------------------------------------
// reactions / clip control
// ---------------------------------------------------------------------------
function setClip(name) { if (cat.clipName !== name) { cat.clipName = name; cat.clipT = 0; } }
function react(clip, dur, opts = {}) {
  cat.mode = 'react'; cat.reactClip = clip; cat.reactT = dur; cat.reactFlee = !!opts.flee; cat.runSpeed = 0;
  if (opts.bubble) { cat.bubble = opts.bubble; cat.bubbleT = dur; }
  setClip(clip); cat.clipT = 0;
  if (opts.hearts) spawnHearts(opts.hearts);
  if (opts.stars) spawnStars(opts.stars);
  if (opts.sound) opts.sound();
}
function startFlee() {
  const dir = (cursor.x > cat.x) ? -1 : 1;
  cat.target = { x: clamp(cat.x + dir * 190, SW / 2, W - SW / 2), y: cat.y };
  cat.runSpeed = 130 * (PIXEL / 4); cat.mode = 'walk';
}
function wake() { if (cat.mode === 'sleep') { cat.mode = 'sit'; cat.idleNext = now() + 4; } }
function baseSpeed() { return 52 * (PIXEL / 4); }

// ---------------------------------------------------------------------------
// stimulus handling
// ---------------------------------------------------------------------------
window.catApi.onInit((p) => {
  ORIGIN = { x: p.originX, y: p.originY }; SCALE = p.scaleFactor || 1;
  muted = !!p.muted; cat.lastActivity = now();
  if (p.pixel) applyScale(p.pixel);
  positionCorner(p.corner || 'br');
});

window.catApi.onStimulus(({ type, data }) => {
  switch (type) {
    case 'mousemove': onMove(toLocal(data.x, data.y)); break;
    case 'mousedown': onDown(toLocal(data.x, data.y), data.button); break;
    case 'mouseup': onUp(toLocal(data.x, data.y), data.button); break;
    case 'scroll': onScroll(); break;
    case 'type': onType(); break;
    case 'arrow': onArrow(data.dir); break;
    case 'closewindow': cat.lastActivity = now(); wake(); react('sit', 1.4, { bubble: 'bye~', sound: snd.wave }); break;
    case 'email': cat.lastActivity = now(); wake(); react('meow', 2.4, { hearts: 6, bubble: '\u2709', sound: snd.email }); break;
    case 'poke': cat.lastActivity = now(); wake(); react('meow', 1.0, { hearts: 4, sound: snd.happy }); break;
    case 'recenter': cat.target = { x: W / 2, y: cat.y }; cat.home = { x: W / 2, y: cat.y }; cat.runSpeed = 0; cat.mode = 'walk'; corner = 'free'; break;
    case 'mute': muted = !!data.muted; break;
    case 'setsize': applyScale(data.pixel); positionCorner(corner === 'free' ? 'br' : corner); break;
    case 'setcorner': positionCorner(data.corner); break;
  }
});

function onMove(pt) {
  cursor = pt; cat.lastActivity = now(); wake();
  const hovering = inCat(pt.x, pt.y);
  setInteractive(hovering || dragging);
  if (dragging) { corner = 'free'; cat.x = clamp(pt.x + dragOff.x, SW * 0.4, W - SW * 0.4); cat.y = clamp(pt.y + dragOff.y, SH * 0.4, H - SH * 0.4); }
}
function onDown(pt, button) {
  wake();
  const onCat = inCat(pt.x, pt.y);
  if (button === 2) { onCat ? react('meow', 1.0, { hearts: 3, sound: snd.happy }) : react('scared', 0.6, { sound: snd.startled }); return; }
  if (onCat) { pressing = true; dragging = false; pressPos = { x: pt.x, y: pt.y }; dragOff = { x: cat.x - pt.x, y: cat.y - pt.y }; setInteractive(true); }
}
function onUp(pt, button) {
  if (button === 2 || !pressing) return;
  const moved = Math.hypot(pt.x - pressPos.x, pt.y - pressPos.y);
  if (dragging || moved > 6) { cat.home = { x: cat.x, y: cat.y }; cat.mode = 'sit'; }
  else {
    const t = now(); clickStreak = (t - lastClickAt < 0.5) ? clickStreak + 1 : 1; lastClickAt = t;
    if (clickStreak >= 4) { react('scared', 0.8, { stars: 7, flee: true, sound: snd.bop }); cat.mood = clamp(cat.mood - 0.12, 0, 1); clickStreak = 0; }
    else { react('meow', 1.0, { hearts: 5, sound: snd.pet }); cat.mood = clamp(cat.mood + 0.07, 0, 1); }
  }
  pressing = false; dragging = false; setInteractive(inCat(pt.x, pt.y));
}
function onScroll() {
  cat.lastActivity = now(); wake();   // just stay awake/alert — no sparks
}
function onType() {
  cat.lastActivity = now(); wake();
  const t = now();
  cat.typingUntil = t + 0.7;          // show the keyboard-typing animation
  typeTimes.push(t); typeTimes = typeTimes.filter((x) => t - x < 1.0);
  cat.tapSpeed = clamp(5 + typeTimes.length * 1.4, 5, 16);   // type faster -> tap faster
}
function onArrow(dir) {
  cat.lastActivity = now(); wake();
  if (dir !== 'left' && dir !== 'right') return;   // no vertical movement
  const tx = clamp(cat.x + (dir === 'left' ? -130 : 130), SW / 2, W - SW / 2);
  cat.target = { x: tx, y: cat.y }; cat.runSpeed = 0; cat.mode = 'walk';
}

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------
function stepToward(tx, sp, dt) {       // horizontal only — the cat stays on the ground
  const dx = tx - cat.x;
  if (Math.abs(dx) < 2) return true;
  cat.x += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
  cat.faceLeft = dx < 0;
  return false;
}
function doIdleAction(t) {
  const r = Math.random();
  if (r < 0.55) { cat.target = { x: clamp(cat.home.x + (Math.random() - 0.5) * 420, SW / 2, W - SW / 2), y: cat.y }; cat.runSpeed = 0; cat.mode = 'walk'; }
  else if (r < 0.85) { cat.groomUntil = t + 2 + Math.random() * 2.5; }
  else { react('meow', 1.0, {}); }
  cat.idleNext = t + 5 + Math.random() * 6;
}
function pickClip() {
  if (cat.mode === 'react') return cat.reactClip;
  if (cat.mode === 'drag') return 'sit';
  if (cat.mode === 'sleep') return 'sleep';
  if (cat.mode === 'walk') return 'walkR';
  if (now() < cat.typingUntil) return 'sit';   // front-facing while "typing"
  if (now() < cat.groomUntil) return 'groom';
  return 'sit';
}
const isTyping = () => cat.mode === 'sit' && now() < cat.typingUntil;

function update(dt) {
  const t = now();
  if (cat.bubbleT > 0) cat.bubbleT -= dt;
  if (isTyping()) cat.tapPhase += dt * cat.tapSpeed;

  if (dragging) cat.mode = 'drag';
  else if (cat.mode === 'drag') { cat.mode = 'sit'; cat.idleNext = t + 4; }

  if (cat.mode === 'react') { cat.reactT -= dt; if (cat.reactT <= 0) { cat.reactFlee ? startFlee() : (cat.mode = 'sit', cat.idleNext = t + 3); } }

  if (cat.mode === 'walk') { if (stepToward(cat.target.x, cat.runSpeed || baseSpeed(), dt)) { cat.mode = 'sit'; cat.runSpeed = 0; cat.idleNext = t + 4 + Math.random() * 5; } clampPos(); }

  if (cat.mode === 'sit' && t - cat.lastActivity > 30) { cat.mode = 'sleep'; cat.zT = 0; }
  if (cat.mode === 'sit' && t > cat.idleNext && t >= cat.groomUntil && t >= cat.typingUntil) doIdleAction(t);

  if (cat.mode === 'sleep') { cat.zT -= dt; if (cat.zT <= 0) { spawnZ(); cat.zT = 1.6; } }

  setClip(pickClip()); cat.clipT += dt;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.kind === 'heart') p.vy += 6 * dt; if (p.kind === 'star') p.vy += 70 * dt;
    if (p.life >= p.max) particles.splice(i, 1);
  }
}

// ---------------------------------------------------------------------------
// draw
// ---------------------------------------------------------------------------
function drawHeartPx(x, y, s, a) {
  const P = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
  ctx.fillStyle = `rgba(247,150,170,${a})`;
  for (const [dx, dy] of P) ctx.fillRect(Math.round(x + (dx - 2) * s), Math.round(y + (dy - 2) * s), Math.ceil(s), Math.ceil(s));
}
function drawStarPx(x, y, s, a) {
  ctx.fillStyle = `rgba(255,238,150,${a})`;
  for (const [dx, dy] of [[0, -2], [0, -1], [0, 0], [0, 1], [0, 2], [-2, 0], [-1, 0], [1, 0], [2, 0]]) ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.ceil(s), Math.ceil(s));
}
function drawZ(x, y, s, a) { ctx.fillStyle = `rgba(120,120,150,${a})`; ctx.font = `bold ${Math.round(s)}px "Segoe UI", monospace`; ctx.fillText('z', x, y); }
function drawParticles() {
  for (const p of particles) {
    const a = clamp(1 - p.life / p.max, 0, 1);
    if (p.kind === 'heart') drawHeartPx(p.x, p.y, p.s, a);
    else if (p.kind === 'star') drawStarPx(p.x, p.y, p.s, a);
    else drawZ(p.x, p.y, p.s, a);
  }
}
function drawBubble(text, cx, topY) {
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  const tw = ctx.measureText(text).width, w = tw + 16, h = 22, r = 7;
  const x = Math.round(cx - w / 2), y = Math.round(topY - h - 8);
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#2a2122'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, y + h - 1); ctx.lineTo(cx, y + h + 7); ctx.lineTo(cx + 5, y + h - 1); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#2a2122'; ctx.stroke();
  ctx.fillStyle = '#2a2122'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cx, y + h / 2 + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}
function drawEnvelope(cx, cy) {
  const w = 22, h = 15, x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 2; ctx.strokeStyle = '#2a2122'; ctx.strokeRect(x, y, w, h);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, y + h * 0.6); ctx.lineTo(x + w, y); ctx.stroke();
  ctx.fillStyle = '#f4a64a'; ctx.fillRect(cx - 2, y + h - 4, 4, 4);
}

function dirtyRect() {
  let minx = cat.x - SW / 2, maxx = cat.x + SW / 2, miny = cat.y - SH / 2 - 40, maxy = cat.y + SH / 2 + 14;
  for (const p of particles) { minx = Math.min(minx, p.x - 16); maxx = Math.max(maxx, p.x + 16); miny = Math.min(miny, p.y - 16); maxy = Math.max(maxy, p.y + 16); }
  return { x: clamp(minx - 10, 0, W), y: clamp(miny - 10, 0, H), w: 0, h: 0, _x2: clamp(maxx + 10, 0, W), _y2: clamp(maxy + 10, 0, H) };
}

// crisp pixel rect + outlined rect helpers
function pr(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
function orect(x, y, w, h, fill, out) { pr(x - 1, y - 1, w + 2, h + 2, out); pr(x, y, w, h, fill); }

// little keyboard with 2 keys + two cat paws alternately tapping it
function drawKeyboard(yOff) {
  const SC = 0.65;                        // keyboard size (relative to full)
  const s = PIXEL * SC, OUT = '#2f2f2e';
  const kbW = Math.round(SW * 0.56 * SC), kbH = Math.round(s * 4);
  const kx = Math.round(cat.x - kbW / 2), ky = Math.round(cat.y + SH * 0.40 + yOff);
  const leftDown = Math.sin(cat.tapPhase) >= 0;

  // base slab (top face + darker front lip)
  orect(kx, ky, kbW, kbH, '#54545f', OUT);
  pr(kx, ky + Math.round(kbH * 0.55), kbW, Math.round(kbH * 0.45), '#3c3c46');

  // two keycaps (pressed one sinks + darkens)
  const keyW = Math.round(kbW * 0.30), gap = Math.round(kbW * 0.1);
  const k1x = Math.round(cat.x - gap / 2 - keyW), k2x = Math.round(cat.x + gap / 2);
  const keyH = Math.round(s * 2.6), keyY = ky - Math.round(s * 1.4);
  orect(k1x, keyY + (leftDown ? s : 0), keyW, keyH, leftDown ? '#c2c2cc' : '#ededf4', OUT);
  orect(k2x, keyY + (!leftDown ? s : 0), keyW, keyH, !leftDown ? '#c2c2cc' : '#ededf4', OUT);

  // two paws (white, matching the cat) tapping the keys
  const pawW = Math.round(s * 3.4), pawH = Math.round(s * 3);
  const basePawY = keyY - pawH + Math.round(s * 0.4);
  orect(k1x + (keyW - pawW) / 2, basePawY + (leftDown ? s * 2 : 0), pawW, pawH, '#e6e6e6', OUT);
  orect(k2x + (keyW - pawW) / 2, basePawY + (!leftDown ? s * 2 : 0), pawW, pawH, '#e6e6e6', OUT);
}

function draw() {
  const d = dirtyRect(); d.w = d._x2 - d.x; d.h = d._y2 - d.y;
  const cx = Math.min(prevDirty.x, d.x), cy = Math.min(prevDirty.y, d.y);
  const cw = Math.max(prevDirty.x + prevDirty.w, d.x + d.w) - cx, ch = Math.max(prevDirty.y + prevDirty.h, d.y + d.h) - cy;
  ctx.clearRect(cx, cy, cw, ch);
  prevDirty = { x: d.x, y: d.y, w: d.w, h: d.h };
  if (!sheetReady) return;

  // soft ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(cat.x, cat.y + SH * 0.36, SW * 0.26, SH * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  const cl = CLIPS[cat.clipName] || CLIPS.sit;
  let idx = Math.floor(cat.clipT * cl.fps); idx = cl.loop ? idx % cl.n : Math.min(idx, cl.n - 1);
  const sx = (cl.c0 + idx) * FW, sy = cl.row * FH;

  let flip;
  if (isTyping()) flip = false;            // face forward while typing
  else if (cat.mode === 'walk') flip = cat.faceLeft;
  else flip = cursor.x < cat.x;

  const bob = (cat.mode === 'sit' || cat.mode === 'sleep') ? Math.sin(now() * 3) * (PIXEL * 0.35) : 0;
  ctx.save();
  ctx.translate(cat.x, cat.y + bob);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheetImg, sx, sy, FW, FH, -SW / 2, -SH / 2, SW, SH);
  ctx.restore();

  if (isTyping()) drawKeyboard(bob);

  if (cat.bubbleT > 0 && cat.bubble) {
    if (cat.bubble === '\u2709') drawEnvelope(cat.x, cat.y - SH * 0.42);
    else drawBubble(cat.bubble, cat.x + SW * 0.24, cat.y - SH * 0.34);
  }
  drawParticles();
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  update(dt); draw();
  requestAnimationFrame(loop);
}
resize();
positionCorner('br');
cat.lastActivity = now();
requestAnimationFrame(loop);
