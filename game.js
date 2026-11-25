// Dodge The Fruit Salad
// A sideways runner: you're a banana dodging fruit and knives.
// Reach the portal before time runs out, fly the fruit-bowl spaceship
// past the blueberries, and you're on to the next (harder) level.

// ================= SETTINGS (fun to tweak!) =================
const SETTINGS = {
  maxEnergy: 100,
  raspberryDamage: 35,  // 3 raspberries from full = blender time
  pickupEnergy: 15,     // energy from a puddle or a sunshine
  bonusEvery: 5,        // every 5th sun/puddle gives a bonus...
  bonusEnergy: 35,      // ...this much energy if you've lost some
  maxHearts: 3,         // ...or a heart if you're full (each heart saves you once)
  shieldFrames: 100,    // how long you're safe after a heart saves you
  jumpPower: 14.5,      // bigger = higher jumps
  gravity: 0.8,
  sprintBoost: 1.4,     // speed multiplier while holding → / D
  stumbleSlow: 0.45,    // speed multiplier right after a raspberry hit
  stumbleFrames: 35,
  hurtFrames: 70,       // how long you flash after a raspberry hit
  shipLift: 0.55,       // spaceship: how fast it rises while you hold jump
  shipFall: 0.5,        // spaceship: how fast it sinks when you let go
};

const MAX_LEVEL = 100;

// Grows from 0 at level 1 towards 1 by the later levels.
// Smaller k = gets hard sooner, bigger k = more gradual.
const ramp = (n, k) => 1 - Math.exp(-(n - 1) / k);

// How each running level is built. n = level number (1 to 100)
function levelConfig(n) {
  const speed = 5 + 6 * ramp(n, 18);                // 5 at level 1, ~8 at 15, ~11 by 70+
  const length = 5000 + Math.min(n - 1, 20) * 600;  // distance to the portal (stops growing at level 21)
  const margin = 1.3 - 0.2 * ramp(n, 15);           // spare time: 30% early on, 10% later
  return {
    speed,
    length,
    blueChance: 0.25 + 0.45 * ramp(n, 15),          // chance a fruit is a blueberry
    floatChance: 0.15 + 0.3 * ramp(n, 15),          // chance fruit floats (duck under!)
    groupChance: n === 1 ? 0 : 0.45 * ramp(n, 10),  // 2-3 in a row
    platformChance: 0.15 + 0.15 * ramp(n, 15),
    knifeChance: n === 1 ? 0.08 : 0.1 + 0.15 * ramp(n, 15),
    pickupChance: 0.3,                              // puddle or sunshine in a gap
    gapVariety: 1 - 0.7 * ramp(n, 12),              // smaller = packed tighter
    timeLimit: Math.ceil((length / (speed * 60)) * margin),
  };
}

// How each spaceship flight is built
function flightConfig(n) {
  return {
    speed: 5 + 4 * ramp(n, 20),
    length: 2400 + Math.min(n - 1, 15) * 200,
    gateChance: n === 1 ? 0.25 : 0.35 + 0.5 * ramp(n, 12), // walls of blueberries
    gap: 170 - 45 * ramp(n, 15),                           // hole in the wall
  };
}

// ================= SETUP =================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const GROUND_Y = 380;
const PLAYER_X = 170;
const SHIP_X = 195;
const STAND = { w: 40, h: 50 };
const DUCK = { w: 48, h: 24 };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const TEXT_FONT = '"Trebuchet MS","Comic Sans MS",sans-serif';

// Colour schemes, one per level. Kept deep and cool so the yellow banana stands out
// (avoid pale yellows, creams and oranges near the ground).
const PALETTES = [
  { skyTop: "#2f7fd0", skyBot: "#7cc0ec", hill: "#3f9b4f", ground: "#2f7d3a", dirt: "#6b4a2b" }, // blue day
  { skyTop: "#43246f", skyBot: "#b04f7c", hill: "#6e3262", ground: "#4e7a3a", dirt: "#4a3020" }, // dusk
  { skyTop: "#14163f", skyBot: "#3e3580", hill: "#2a2468", ground: "#3a337a", dirt: "#221c4a" }, // night
  { skyTop: "#0d5c68", skyBot: "#3fa3a3", hill: "#1d6e55", ground: "#2a8a58", dirt: "#553a22" }, // teal
];

const startScreen = document.getElementById("start-screen");
const gameOverScreen = document.getElementById("gameover-screen");
const goTitle = document.getElementById("go-title");
const goMsg = document.getElementById("go-msg");
const bestEl = document.getElementById("best");
const retryBtn = document.getElementById("retry-btn");
const continueBtn = document.getElementById("continue-btn");

let bestLevel = 1;
try { bestLevel = Number(localStorage.getItem("dtfs-best-level")) || 1; } catch (e) {}
bestLevel = Math.min(bestLevel, MAX_LEVEL);
bestEl.textContent = bestLevel;
function updateContinueButton() {
  continueBtn.classList.toggle("hidden", bestLevel <= 1);
  continueBtn.textContent = `Continue from level ${bestLevel}`;
}
updateContinueButton();

// ================= SOUND (made with code, no files needed) =================
const Sound = {
  ctx: null,
  muted: false,
  noiseBuf: null,
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  ready() { return this.ctx && !this.muted; },
  tone(f1, f2, start, dur, type = "sine", vol = 0.2) {
    const c = this.ctx, t = c.currentTime + start;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  },
  noise(start, dur, vol, filterType, f1, f2) {
    const c = this.ctx, t = c.currentTime + start;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.05);
  },
  // energy pickup: a little "ring"
  ring() {
    if (!this.ready()) return;
    this.tone(1319, 1319, 0, 0.12, "sine", 0.18);
    this.tone(1976, 1976, 0.07, 0.4, "sine", 0.16);
    this.tone(3951, 3951, 0.07, 0.25, "sine", 0.03);
  },
  jump() {
    if (!this.ready()) return;
    this.tone(380, 720, 0, 0.09, "square", 0.035);
  },
  hurt() {
    if (!this.ready()) return;
    this.tone(320, 140, 0, 0.18, "square", 0.07);
    this.noise(0, 0.12, 0.15, "lowpass", 2000, 400);
  },
  // a squishy banana splat
  squash(start = 0) {
    if (!this.ready()) return;
    this.noise(start, 0.35, 0.6, "lowpass", 1800, 150);
    this.tone(260, 55, start, 0.32, "sine", 0.35);
    this.tone(140, 70, start + 0.05, 0.25, "triangle", 0.2);
    this.noise(start + 0.12, 0.2, 0.25, "bandpass", 900, 300);
  },
  chop() {
    if (!this.ready()) return;
    for (const s of [0, 0.12, 0.24]) {
      this.noise(s, 0.09, 0.35, "highpass", 6000, 2500);
      this.tone(2400, 1300, s, 0.08, "triangle", 0.06);
    }
    this.squash(0.3);
  },
  blend(dur = 1.2) {
    if (!this.ready()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(150, t + 0.3);
    const lfo = c.createOscillator();
    lfo.frequency.value = 18;
    const lg = c.createGain();
    lg.gain.value = 25;
    lfo.connect(lg).connect(o.frequency);
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.setValueAtTime(0.12, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(c.destination);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    this.noise(0, dur, 0.07, "bandpass", 1500, 1200);
  },
  ding() {
    if (!this.ready()) return;
    this.tone(880, 880, 0, 0.5, "sine", 0.12);
  },
  bonus() {
    if (!this.ready()) return;
    [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, f, 0.15 + i * 0.06, 0.3, "sine", 0.12));
  },
  save() {
    if (!this.ready()) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, f, i * 0.05, 0.35, "triangle", 0.12));
  },
  portal() {
    if (!this.ready()) return;
    [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, i * 0.07, 0.25, "triangle", 0.08));
  },
};

// ================= MUSIC: "Banana banana banana, Anna Anna banana, Anna Anna" =================
// A synth voice sings each syllable on a note, over a bouncy beat. Press N to turn music on/off.
const BPM = 132;
const EIGHTH = 60 / BPM / 2;
const NOTE_INDEX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteFreq = (n) => 440 * 2 ** ((NOTE_INDEX[n[0]] + 12 * (Number(n.slice(-1)) + 1) - 69) / 12);

// [step (in eighth notes), syllable, note, length in eighths]
// Syllables: "ba", "na", "NA" (stressed, as in ba-NA-na), "an", "ooh", "mash", "smash"
const SONG_VOICE = [
  // banana, banana, banana, banana
  [0, "ba", "C4", 1], [1, "NA", "E4", 1], [2, "na", "G4", 1],
  [3, "ba", "C4", 1], [4, "NA", "E4", 1], [5, "na", "G4", 1],
  [6, "ba", "A4", 1], [7, "NA", "G4", 1], [8, "na", "E4", 1],
  [9, "ba", "F4", 1], [10, "NA", "E4", 1], [11, "na", "D4", 2],
  // SMASH!
  [14, "smash", "A4", 2],
  // banana, banana, banana
  [16, "ba", "G4", 1], [17, "NA", "A4", 1], [18, "na", "G4", 1],
  [19, "ba", "E4", 1], [20, "NA", "G4", 1], [21, "na", "E4", 1],
  [22, "ba", "C4", 1], [23, "NA", "D4", 1], [24, "na", "E4", 2],
  // SMASH!
  [27, "smash", "C5", 3],
];
const SONG_HOOK = []; // optional extra tune: [step, note, length]
const SONG_BASS = ["C2", "C2", "F2", "G2", "C2", "F2", "G2", "C2"]; // one chord root per half bar
const SONG_STEPS = 32;
const SONG_CRASH = [14, 27]; // cymbal crash on each SMASH

const Music = {
  enabled: true,
  playing: false,
  step: 0,
  nextTime: 0,
  timer: null,
  out: null,

  start() {
    const c = Sound.ctx;
    if (!c || this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = c.currentTime + 0.1;
    this.out = c.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(c.destination);
    this.timer = setInterval(() => this.schedule(), 25);
  },
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const g = this.out, c = Sound.ctx;
    g.gain.setTargetAtTime(0, c.currentTime, 0.05);
    setTimeout(() => g.disconnect(), 600);
  },
  schedule() {
    const c = Sound.ctx;
    const audible = this.enabled && !Sound.muted;
    this.out.gain.setTargetAtTime(audible ? 0.55 : 0, c.currentTime, 0.03);
    while (this.nextTime < c.currentTime + 0.12) {
      if (audible) this.playStep(this.step % SONG_STEPS, this.nextTime);
      this.nextTime += EIGHTH;
      this.step++;
    }
  },
  playStep(s, t) {
    for (const [st, syl, note, len] of SONG_VOICE) if (st === s) this.sing(syl, noteFreq(note), t, len * EIGHTH * 0.92);
    for (const [st, note, len] of SONG_HOOK) if (st === s) this.lead(noteFreq(note), t, len * EIGHTH * 0.9);
    const bar8 = s % 8;
    const root = noteFreq(SONG_BASS[Math.floor(s / 4)]);
    if (bar8 % 2 === 0) this.bass(bar8 === 2 || bar8 === 6 ? root * 2 : root, t, EIGHTH * 0.9);
    if (bar8 === 0 || bar8 === 4) this.kick(t);
    if (SONG_CRASH.includes(s)) { this.kick(t); this.noiseHit(t, 0.8, 0.2, "highpass", 4500); }
    if (bar8 === 2 || bar8 === 6) this.snare(t);
    this.hat(t, bar8 % 2 ? 0.05 : 0.025);
  },

  // A singing "voice": a buzzy tone shaped by vowel filters (formants)
  sing(syl, freq, t, dur) {
    const c = Sound.ctx;
    if (syl === "smash") {
      this.noiseHit(t, 0.08, 0.22, "highpass", 5000);
      return this.sing("mash", freq, t + 0.06, dur - 0.06);
    }
    if (syl === "mash") {
      // "ma" then a "sh" hiss
      this.voice("m", "ah", freq, t, dur - 0.13, 1.35);
      this.noiseHit(t + dur - 0.15, 0.2, 0.3, "bandpass", 3000);
      return;
    }
    if (syl === "ooh") return this.voice("", "oo", freq, t, dur, 1.1);
    if (syl === "ba") return this.voice("b", "ah", freq, t, dur, 1);
    if (syl === "NA") return this.voice("n", "ah", freq, t, dur, 1.35);
    if (syl === "an") return this.voice("", "ah", freq, t, dur, 1, true);
    return this.voice("n", "ah", freq, t, dur, 1);
  },
  voice(consonant, vowel, freq, t, dur, stress = 1, endsInN = false) {
    const c = Sound.ctx;
    const V = vowel === "oo" ? [350, 850, 2700] : [800, 1250, 2700]; // vowel formants
    const NASAL = 260;
    const src = c.createOscillator();
    src.type = "sawtooth";
    src.frequency.setValueAtTime(freq, t);
    const vib = c.createOscillator();
    vib.frequency.value = 6;
    const vibAmt = c.createGain();
    vibAmt.gain.setValueAtTime(0, t);
    vibAmt.gain.linearRampToValueAtTime(freq * 0.015, t + dur);
    vib.connect(vibAmt).connect(src.frequency);

    const env = c.createGain();
    env.connect(this.out);
    const formant = (f, q, g) => {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(f, t);
      bp.Q.value = q;
      const gain = c.createGain();
      gain.gain.setValueAtTime(g, t);
      src.connect(bp).connect(gain).connect(env);
      return { bp, gain };
    };
    const F1 = formant(V[0], 4, 1.4);
    const F2 = formant(V[1], 5, vowel === "oo" ? 0.4 : 0.9);
    formant(V[2], 8, 0.3);
    const dry = c.createBiquadFilter();
    dry.type = "lowpass";
    dry.frequency.value = 2000;
    const dryG = c.createGain();
    dryG.gain.value = 0.12;
    src.connect(dry).connect(dryG).connect(env);

    const v = 0.45 * stress;
    const f2Open = vowel === "oo" ? 0.4 : 0.9;
    env.gain.setValueAtTime(0.0001, t);
    if (consonant === "b") {
      env.gain.exponentialRampToValueAtTime(v, t + 0.02);
      F1.bp.frequency.setValueAtTime(350, t);
      F1.bp.frequency.exponentialRampToValueAtTime(V[0], t + 0.05);
    } else if (consonant === "n" || consonant === "m") {
      env.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.015);
      env.gain.setValueAtTime(v * 0.45, t + 0.05);
      env.gain.exponentialRampToValueAtTime(v, t + 0.08);
      F1.bp.frequency.setValueAtTime(NASAL, t);
      F1.bp.frequency.setValueAtTime(NASAL, t + 0.05);
      F1.bp.frequency.exponentialRampToValueAtTime(V[0], t + 0.09);
      F2.gain.gain.setValueAtTime(0.12, t);
      F2.gain.gain.setValueAtTime(0.12, t + 0.05);
      F2.gain.gain.linearRampToValueAtTime(f2Open, t + 0.09);
    } else {
      env.gain.exponentialRampToValueAtTime(v, t + 0.03);
    }
    let endLevel = v;
    if (endsInN) {
      F1.bp.frequency.setValueAtTime(V[0], t + dur * 0.55);
      F1.bp.frequency.exponentialRampToValueAtTime(NASAL, t + dur * 0.8);
      F2.gain.gain.setValueAtTime(f2Open, t + dur * 0.55);
      F2.gain.gain.linearRampToValueAtTime(0.12, t + dur * 0.8);
      env.gain.setValueAtTime(v, t + dur * 0.6);
      env.gain.exponentialRampToValueAtTime(v * 0.45, t + dur * 0.85);
      endLevel = v * 0.45;
    }
    env.gain.setValueAtTime(endLevel, t + dur - 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.start(t); vib.start(t);
    src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  },
  lead(freq, t, dur) {
    const c = Sound.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  },
  bass(freq, t, dur) {
    const c = Sound.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.05);
  },
  kick(t) {
    const c = Sound.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.2);
  },
  noiseHit(t, dur, vol, type, freq) {
    const c = Sound.ctx;
    const s = c.createBufferSource();
    s.buffer = Sound.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t); s.stop(t + dur + 0.02);
  },
  snare(t) { this.noiseHit(t, 0.12, 0.18, "bandpass", 1800); },
  hat(t, vol) { this.noiseHit(t, 0.04, vol, "highpass", 7000); },
};

// Music plays during the game, stops for the blender, game over and menu
function syncMusic() {
  const want = ["playing", "cutscene", "flying", "warp"].includes(mode);
  if (want && !Music.playing) Music.start();
  else if (!want && Music.playing) Music.stop();
}

// ================= INPUT =================
const keys = {};
const pointers = new Map();
const GAME_KEYS = [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"];

window.addEventListener("keydown", (e) => {
  Sound.init();
  const k = e.key.toLowerCase();
  if (GAME_KEYS.includes(k)) e.preventDefault();
  keys[k] = true;
  if (k === "m" && !e.repeat) Sound.muted = !Sound.muted;
  if (k === "n" && !e.repeat) Music.enabled = !Music.enabled;
  if ((k === " " || k === "enter") && !e.repeat) {
    if (mode === "title") startGame();
    else if (mode === "over") retry();
  }
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

// Touch: right half = jump (or fly up), left half = duck
canvas.addEventListener("pointerdown", (e) => {
  Sound.init();
  const rect = canvas.getBoundingClientRect();
  pointers.set(e.pointerId, e.clientX - rect.left < rect.width / 2 ? "duck" : "jump");
});
const endPointer = (e) => pointers.delete(e.pointerId);
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

const anyKey = (...ks) => ks.some((k) => keys[k]);
const touching = (a) => [...pointers.values()].includes(a);
const wantJump = () => anyKey(" ", "arrowup", "w") || touching("jump");
const wantDuck = () => anyKey("arrowdown", "s") || touching("duck");
const wantSprint = () => anyKey("arrowright", "d");

// ================= GAME STATE =================
// title | playing | cutscene | flying | warp | dying | over
let mode = "title";
let L = null; // everything about the current level
let titleScroll = 0;
// Things you collect that carry over from level to level
let run = { suns: 0, waters: 0, hearts: 0 };

function startLevel(n) {
  const cfg = levelConfig(n);
  const world = generateLevel(cfg, n);
  L = {
    n,
    cfg,
    phase: "run",
    palette: PALETTES[(n - 1) % PALETTES.length],
    distance: 0,
    frame: 0,
    timeLeft: cfg.timeLimit * 60,
    energy: SETTINGS.maxEnergy,
    hurt: 0,
    stumble: 0,
    player: { y: GROUND_Y, vy: 0, onGround: true, ducking: false, angle: 0 },
    ...world,
    particles: [],
    texts: [],
    shield: 0,
    startRun: { ...run },
    cutT: 0,
    secondsLeft: 0,
  };
  mode = "playing";
}

// The spaceship part at the end of each level
function startShip() {
  L.phase = "flight";
  L.distance = L.cfg.length;
  L.shipDist = 0;
  L.flyT = 0;
  L.ship = { y: 130, vy: 0 };
  L.flight = flightConfig(L.n);
  L.shipObs = generateFlight(L.flight);
  L.particles = [];
  L.texts = [];
  L.shield = 0;
  L.shipRun = { ...run };
  mode = "flying";
}

function hideOverlays() {
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
}
function startGame() { hideOverlays(); run = { suns: 0, waters: 0, hearts: 0 }; startLevel(1); }
function continueGame() { hideOverlays(); run = { suns: 0, waters: 0, hearts: 0 }; startLevel(bestLevel); }
// Try again from where you died (running part, or the spaceship part)
function retry() {
  hideOverlays();
  if (!L || L.won) return startGame();
  if (L.phase === "flight") { run = { ...L.shipRun }; startShip(); L.energy = SETTINGS.maxEnergy; }
  else { run = { ...L.startRun }; startLevel(L.n); }
}
function backToMenu() {
  hideOverlays();
  L = null;
  mode = "title";
  bestEl.textContent = bestLevel;
  updateContinueButton();
  startScreen.classList.remove("hidden");
}

// ================= LEVEL BUILDING =================
function makeFruit(type, x, floating, surfaceY = GROUND_Y) {
  const r = type === "blue" ? 17 : 20;
  // Floating fruit sits at head height: duck under it (or jump right over it)
  const y = floating ? 345 - r : surfaceY - r;
  return { type, x, y, r, floating, hit: false, bob: Math.random() * Math.PI * 2 };
}

function generateLevel(cfg, n) {
  const fruits = [], knives = [], platforms = [], pickups = [];
  const airDistance = 38 * cfg.speed * SETTINGS.sprintBoost; // how far a jump carries you
  const pick = () => (Math.random() < cfg.blueChance ? "blue" : "rasp");
  let x = 900; // a little run-up first

  while (x < cfg.length - 700) {
    const r = Math.random();
    if (r < cfg.platformChance) {
      // A staircase of cutting boards with knives underneath
      const tiers = n >= 3 && Math.random() < 0.5 ? 3 : 2;
      const w = 170, heights = [80, 150, 220];
      for (let t = 0; t < tiers; t++) platforms.push({ x: x + t * (w + 40), y: GROUND_Y - heights[t], w });
      const p2 = platforms[platforms.length - tiers + 1];
      const kCount = n >= 4 ? 3 : 2;
      for (let k = 0; k < kCount; k++) knives.push({ x: p2.x + 25 + k * 45 });
      const top = platforms[platforms.length - 1];
      pickups.push({ kind: "sun", x: top.x + top.w / 2, y: top.y - 75, taken: false });
      if (Math.random() < 0.5) fruits.push(makeFruit(pick(), top.x + top.w - 30, false, top.y));
      x = top.x + top.w + 60;
    } else if (r < cfg.platformChance + cfg.knifeChance) {
      const count = Math.random() < cfg.groupChance ? 2 : 1;
      for (let k = 0; k < count; k++) knives.push({ x: x + k * 34 });
      x += (count - 1) * 34;
    } else {
      const floating = Math.random() < cfg.floatChance;
      const count = Math.random() < cfg.groupChance ? (floating ? 3 : 2) : 1;
      const spacing = floating ? 44 : 38;
      for (let k = 0; k < count; k++) fruits.push(makeFruit(pick(), x + k * spacing, floating));
      x += (count - 1) * spacing;
    }

    const gap = (airDistance + 100) * (1 + Math.random() * cfg.gapVariety);
    if (Math.random() < cfg.pickupChance) {
      const kind = Math.random() < 0.5 ? "puddle" : "sun";
      pickups.push({ kind, x: x + gap / 2, y: kind === "sun" ? GROUND_Y - 95 : GROUND_Y, taken: false });
    }
    x += gap;
  }
  return { fruits, knives, platforms, pickups };
}

function generateFlight(fc) {
  const obs = [];
  let x = 650;
  let c = 200; // centre of the hole in the last wall
  while (x < fc.length - 200) {
    if (Math.random() < fc.gateChance) {
      const lo = 60 + fc.gap / 2 - 20, hi = GROUND_Y - 30 - fc.gap / 2 + 20;
      c = Math.max(lo, Math.min(hi, c + (Math.random() - 0.5) * 220));
      for (let y = 30; y <= GROUND_Y - 10; y += 34) {
        if (Math.abs(y - c) > fc.gap / 2) obs.push({ x, y, r: 17, hit: false });
      }
    } else {
      const count = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < count; k++) obs.push({ x: x + k * 60, y: 60 + Math.random() * (GROUND_Y - 110), r: 17, hit: false });
    }
    x += fc.speed * 45 + Math.random() * fc.speed * 25;
  }
  return obs;
}

// ================= UPDATE =================
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function fruitY(o) {
  return o.floating ? o.y + Math.sin(L.frame * 0.08 + o.bob) * 3 : o.y;
}

function playerBox(p) {
  const s = p.ducking ? DUCK : STAND;
  const inset = 5; // slightly forgiving hitbox
  return { x: PLAYER_X - s.w / 2 + inset, y: p.y - s.h + inset, w: s.w - inset * 2, h: s.h - inset };
}

function circleHitsBox(cx, cy, r, b) {
  const nx = clamp(cx, b.x, b.x + b.w);
  const ny = clamp(cy, b.y, b.y + b.h);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
function boxesTouch(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
const knifeBox = (sx) => ({ x: sx - 5, y: GROUND_Y - 54, w: 10, h: 54 });

function floatText(text, x, y, color = "white") {
  L.texts.push({ text, x, y, color, life: 70 });
}

function gainEnergy(kind, x, y) {
  run[kind]++;
  L.energy = Math.min(SETTINGS.maxEnergy, L.energy + SETTINGS.pickupEnergy);
  Sound.ring();
  splat(x, y, "#fff3a0", 10, 3);
  // Every 5th sun or puddle: a bonus
  if ((run.suns + run.waters) % SETTINGS.bonusEvery === 0) {
    if (L.energy < SETTINGS.maxEnergy) {
      L.energy = Math.min(SETTINGS.maxEnergy, L.energy + SETTINGS.bonusEnergy);
      floatText("Energy boost!", PLAYER_X + 40, L.player.y - 70, "#52d273");
    } else if (run.hearts < SETTINGS.maxHearts) {
      run.hearts++;
      floatText("+1 ❤️", PLAYER_X + 40, L.player.y - 70, "#ff8fab");
    } else {
      floatText("Super banana!", PLAYER_X + 40, L.player.y - 70, "#ffd93b");
    }
    Sound.bonus();
  }
}

function updatePlaying() {
  L.frame++;
  const p = L.player;
  const cfg = L.cfg;

  let speed = cfg.speed;
  if (wantSprint()) speed *= SETTINGS.sprintBoost;
  if (L.stumble > 0) { speed *= SETTINGS.stumbleSlow; L.stumble--; }
  L.distance += speed;
  if (L.hurt > 0) L.hurt--;
  L.timeLeft--;

  // Jump / duck / fall
  if (p.onGround && wantJump()) { p.vy = -SETTINGS.jumpPower; p.onGround = false; Sound.jump(); }
  p.ducking = p.onGround && wantDuck();
  p.vy += SETTINGS.gravity + (!p.onGround && wantDuck() ? 1.2 : 0); // hold duck in the air to drop faster
  let newY = p.y + p.vy;
  let landed = false;

  // Land on top of cutting boards (you can jump up through them from below)
  if (p.vy >= 0) {
    let best = Infinity;
    for (const pl of L.platforms) {
      const sx = pl.x - L.distance + PLAYER_X;
      if (PLAYER_X + 14 < sx || PLAYER_X - 14 > sx + pl.w) continue;
      if (p.y <= pl.y + 0.5 && newY >= pl.y && pl.y < best) best = pl.y;
    }
    if (best < Infinity) { newY = best; landed = true; }
  }
  if (newY >= GROUND_Y) { newY = GROUND_Y; landed = true; }
  p.y = newY;
  if (landed) {
    if (!p.onGround) splat(PLAYER_X, p.y, "#c9a27a", 5, 2);
    p.vy = 0;
    p.onGround = true;
    p.angle = 0;
  } else {
    p.onGround = false;
    p.angle += 0.18; // Geometry Dash style spin
  }

  const box = playerBox(p);
  if (L.shield > 0) L.shield--;
  const safe = L.shield > 0;

  // Knives dice you up
  for (const k of L.knives) {
    if (safe) break;
    const sx = k.x - L.distance + PLAYER_X;
    if (Math.abs(sx - PLAYER_X) > 60) continue;
    if (boxesTouch(box, knifeBox(sx))) return die("knife");
  }

  // Fruit
  for (const o of L.fruits) {
    if (safe) break;
    if (o.hit) continue;
    const sx = o.x - L.distance + PLAYER_X;
    if (Math.abs(sx - PLAYER_X) > 80) continue;
    const oy = fruitY(o);
    if (!circleHitsBox(sx, oy, o.r * 0.85, box)) continue;

    if (o.type === "blue") {
      o.hit = true;
      splat(sx, oy, "#3b4cca", 20);
      return die("blue");
    }
    if (L.hurt > 0) continue; // still flashing from the last raspberry
    o.hit = true;
    L.energy -= SETTINGS.raspberryDamage;
    L.hurt = SETTINGS.hurtFrames;
    L.stumble = SETTINGS.stumbleFrames;
    splat(sx, oy, "#e8284f", 14);
    if (L.energy <= 0) { L.energy = 0; return die("rasp"); }
    Sound.hurt();
  }

  // Energy pickups
  for (const pk of L.pickups) {
    if (pk.taken) continue;
    const sx = pk.x - L.distance + PLAYER_X;
    if (Math.abs(sx - PLAYER_X) > 70) continue;
    if (pk.kind === "sun" && circleHitsBox(sx, pk.y, 18, box)) {
      pk.taken = true;
      gainEnergy("suns", sx, pk.y);
    } else if (pk.kind === "puddle" && p.y >= GROUND_Y - 2 && Math.abs(sx - PLAYER_X) < 45) {
      pk.taken = true;
      gainEnergy("waters", sx, GROUND_Y - 5);
      splat(sx, GROUND_Y - 5, "#5ab4ff", 12, 4);
    }
  }

  if (L.distance >= cfg.length) {
    L.distance = cfg.length;
    L.secondsLeft = Math.ceil(L.timeLeft / 60);
    L.cutT = 0;
    mode = "cutscene";
    Sound.portal();
    return;
  }
  if (L.timeLeft <= 0) return die("time");
}

// Banana into portal → spaceship beams you up → flight
function updateCutscene() {
  L.cutT++;
  if (L.cutT >= 160) startShip();
}

function updateFlying() {
  L.flyT++;
  const s = L.ship;
  const fc = L.flight;
  L.shipDist += fc.speed;

  if (wantJump()) s.vy -= SETTINGS.shipLift;
  else s.vy += SETTINGS.shipFall;
  s.vy = clamp(s.vy, -6.5, 6.5);
  s.y += s.vy;
  if (s.y < 40) { s.y = 40; s.vy = 0; }
  if (s.y > GROUND_Y - 30) { s.y = GROUND_Y - 30; s.vy = 0; }

  if (L.flyT % 3 === 0) {
    L.particles.push({ x: SHIP_X - 32, y: s.y + 8, vx: -3, vy: Math.random() - 0.5, life: 18, color: "#ffb347", size: 4, float: true });
  }

  const box = { x: SHIP_X - 30, y: s.y - 18, w: 60, h: 32 };
  if (L.shield > 0) L.shield--;
  for (const o of L.shipObs) {
    if (L.shield > 0) break;
    if (o.hit) continue;
    const sx = o.x - L.shipDist + SHIP_X;
    if (Math.abs(sx - SHIP_X) > 70) continue;
    if (circleHitsBox(sx, o.y, o.r * 0.85, box)) {
      o.hit = true;
      splat(sx, o.y, "#3b4cca", 20);
      return die("shipblue");
    }
  }

  if (L.shipDist >= fc.length) {
    mode = "warp";
    L.warpT = 0;
    Sound.portal();
    const next = Math.min(L.n + 1, MAX_LEVEL);
    if (next > bestLevel) {
      bestLevel = next;
      try { localStorage.setItem("dtfs-best-level", bestLevel); } catch (e) {}
    }
  }
}

function updateWarp() {
  L.warpT++;
  if (L.warpT >= 150) {
    if (L.n >= MAX_LEVEL) return showWin();
    startLevel(L.n + 1);
  }
}

// ---------- Dying ----------
function die(reason) {
  // A heart saves you once (but not from running out of time)
  if (reason !== "time" && run.hearts > 0) {
    run.hearts--;
    L.shield = SETTINGS.shieldFrames;
    if (L.energy <= 0) L.energy = SETTINGS.raspberryDamage;
    const y = L.phase === "flight" ? L.ship.y : L.player.y - 25;
    const x = L.phase === "flight" ? SHIP_X : PLAYER_X;
    floatText("Saved by a ❤️!", x + 60, y - 50, "#ff8fab");
    splat(x, y, "#ff8fab", 18, 4);
    Sound.save();
    return;
  }
  L.deathReason = reason;
  L.deathT = 0;
  L.deathStyle = reason === "knife" ? "dice" : "blender";
  if (L.phase === "flight") { L.deadX = SHIP_X; L.deadY = L.ship.y; }
  else { L.deadX = PLAYER_X; L.deadY = L.player.y - 25; }
  mode = "dying";

  if (L.deathStyle === "dice") {
    Sound.chop();
    L.dice = [];
    for (let i = 0; i < 10; i++) {
      L.dice.push({
        kind: i < 7 ? "slice" : "peel",
        x: L.deadX + (Math.random() - 0.5) * 20,
        y: L.deadY + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 8,
        vy: -3 - Math.random() * 6,
        rot: Math.random() * 6,
        vr: i === 0 ? 0 : (Math.random() - 0.5) * 0.4,
      });
    }
  } else {
    Sound.squash();
  }
}

const BLENDER_TIME = 210;
const DICE_TIME = 90;
function updateDying() {
  L.deathT++;
  if (L.deathStyle === "blender") {
    if (L.deathT === 75) Sound.blend(1.2);
    if (L.deathT === 150) Sound.ding();
    if (L.deathT >= BLENDER_TIME) showGameOver();
  } else {
    for (const d of L.dice) {
      d.vy += 0.45;
      d.x += d.vx;
      d.y += d.vy;
      d.rot += d.vr;
      if (d.y > GROUND_Y - 5) { d.y = GROUND_Y - 5; d.vy *= -0.35; d.vx *= 0.7; d.vr *= 0.6; }
    }
    if (L.deathT >= DICE_TIME) showGameOver();
  }
}

function showWin() {
  mode = "over";
  L.won = true;
  goTitle.textContent = "You beat all 100 levels!";
  goMsg.textContent = `Banana champion! You collected ${run.suns} suns and ${run.waters} puddles.`;
  retryBtn.textContent = "Play again";
  gameOverScreen.classList.remove("hidden");
}

function showGameOver() {
  mode = "over";
  retryBtn.textContent = "Try again";
  const msgs = {
    blue: ["Blended!", "A blueberry got you. You're a banana milkshake now."],
    rasp: ["Blended!", "Too many raspberries. Banana milkshake time."],
    time: ["Out of time!", "The blender got you."],
    knife: ["Diced!", "Watch out for the knives."],
    shipblue: ["Blended!", "Your spaceship hit a blueberry."],
  };
  const [title, line] = msgs[L.deathReason];
  goTitle.textContent = title;
  goMsg.textContent = L.phase === "flight"
    ? `${line} Level ${L.n}, in the spaceship.`
    : `${line} Level ${L.n}: you got ${Math.floor((L.distance / L.cfg.length) * 100)}% of the way.`;
  gameOverScreen.classList.remove("hidden");
}

// Juice splats and dust
function splat(x, y, color, count, power = 5) {
  if (!L) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = Math.random() * power + 1;
    L.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 30 + Math.random() * 20, color, size: 2 + Math.random() * 4 });
  }
}
function updateParticles() {
  for (const pt of L.particles) {
    pt.x += pt.vx;
    pt.y += pt.vy;
    if (!pt.float) pt.vy += 0.3;
    pt.life--;
  }
  L.particles = L.particles.filter((pt) => pt.life > 0);
  for (const tx of L.texts) { tx.y -= 0.6; tx.life--; }
  L.texts = L.texts.filter((tx) => tx.life > 0);
}

function update() {
  if (mode === "title") { titleScroll += 3; syncMusic(); return; }
  if (mode === "playing") updatePlaying();
  else if (mode === "cutscene") updateCutscene();
  else if (mode === "flying") updateFlying();
  else if (mode === "warp") updateWarp();
  else if (mode === "dying") updateDying();
  if (L) updateParticles();
  syncMusic();
}

// ================= DRAWING =================
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - k) ** 3;
function easeOutBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

function outlinedText(text, x, y, size, fill = "white") {
  ctx.font = `bold ${size}px ${TEXT_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = "#3b2a1a";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawBackground(dist, pal) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyBot);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  const span = W + 200;
  for (let i = 0; i < 6; i++) {
    const cx = (((i * 170 - dist * 0.15) % span) + span) % span - 100;
    const cy = 60 + ((i * 47) % 90);
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.arc(cx + 25, cy - 10, 26, 0, Math.PI * 2);
    ctx.arc(cx + 52, cy, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = pal.hill;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= W; x += 10) {
    const t = x + dist * 0.4;
    ctx.lineTo(x, GROUND_Y - 60 - 30 * Math.sin(t * 0.01) - 15 * Math.sin(t * 0.023));
  }
  ctx.lineTo(W, GROUND_Y);
  ctx.fill();

  ctx.fillStyle = pal.ground;
  ctx.fillRect(0, GROUND_Y, W, 14);
  ctx.fillStyle = pal.dirt;
  ctx.fillRect(0, GROUND_Y + 14, W, H - GROUND_Y - 14);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  for (let x = -(dist % 40); x < W; x += 40) ctx.fillRect(x, GROUND_Y + 26, 18, 8);
}

// The banana kid. s = { angle, scale, ducking, face, phase, air }
// face: "happy" | "scared" | "sad"
function drawBanana(x, bottomY, s, alpha = 1) {
  const scale = s.scale ?? 1;
  const squash = s.ducking ? 0.55 : 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, bottomY - 31 * scale * squash);
  ctx.rotate(s.angle || 0);
  ctx.scale(scale * (s.ducking ? 1.2 : 1), scale * squash);
  drawBananaKid(s);
  ctx.restore();
}

function drawBananaKid(s) {
  const air = !!s.air;
  const swing = air ? 0 : Math.sin(s.phase ?? 0);
  ctx.lineCap = "round";

  // Legs with red sneakers
  ctx.strokeStyle = "#5c3b12";
  ctx.lineWidth = 3.5;
  const legs = air ? [[-7, 0.5], [2, -0.4]] : [[-7, swing * 0.6], [2, -swing * 0.6]];
  for (const [lx, a] of legs) {
    ctx.save();
    ctx.translate(lx, 18);
    ctx.rotate(a);
    const len = air ? 8 : 10;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, len); ctx.stroke();
    ctx.fillStyle = "#e63946";
    ctx.beginPath(); ctx.ellipse(2.5, len + 1, 4.5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Arms with white gloves (up in the air when jumping)
  ctx.lineWidth = 3;
  const arms = air ? [[-14, 2.6], [8, -2.6]] : [[-14, 0.3 + swing * 0.5], [8, -0.3 + swing * 0.5]];
  for (const [ax, a] of arms) {
    ctx.save();
    ctx.translate(ax, 2);
    ctx.rotate(a);
    ctx.strokeStyle = "#5c3b12";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 11); ctx.stroke();
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 13, 3.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.restore();
  }

  // Banana body
  const g = ctx.createLinearGradient(-16, 0, 10, 0);
  g.addColorStop(0, "#f4b400");
  g.addColorStop(0.5, "#ffe14d");
  g.addColorStop(1, "#f2c200");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#7a4f00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -24);
  ctx.quadraticCurveTo(-34, 0, 4, 22);
  ctx.quadraticCurveTo(-2, 0, 10, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // stem and tip
  ctx.fillStyle = "#6b4a1a";
  ctx.beginPath();
  ctx.moveTo(4, -23); ctx.lineTo(10, -21); ctx.lineTo(12, -29); ctx.lineTo(7, -30);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); ctx.arc(4, 21, 2.2, 0, Math.PI * 2); ctx.fill();
  // shine
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(-15, 0, -10, 10); ctx.stroke();

  drawFace(-6, -4, s.face || "happy");
}

// A face centred at (cx, cy). mood: "happy" | "scared" | "sad"
function drawFace(cx, cy, mood) {
  ctx.lineCap = "round";
  // eyes
  for (const ex of [cx - 3.5, cx + 3.5]) {
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#3b2a1a";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ex, cy - 4, 3.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1b1b1b";
    ctx.beginPath(); ctx.arc(ex + (mood === "sad" ? 0 : 0.7), cy - 3.6 + (mood === "sad" ? 0.8 : 0), mood === "scared" ? 1.2 : 1.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = "#3b2a1a";
  ctx.lineWidth = 1.5;
  if (mood === "happy") {
    ctx.fillStyle = "rgba(255,120,140,0.5)";
    ctx.beginPath(); ctx.arc(cx - 7, cy + 2, 2.2, 0, Math.PI * 2); ctx.arc(cx + 7, cy + 2, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#7a1f1f";
    ctx.beginPath(); ctx.arc(cx, cy + 2, 4.5, 0, Math.PI); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff7a8a";
    ctx.beginPath(); ctx.arc(cx, cy + 5, 2, 0, Math.PI); ctx.fill();
  } else if (mood === "scared") {
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 10); ctx.lineTo(cx - 2, cy - 9); ctx.moveTo(cx + 2, cy - 9); ctx.lineTo(cx + 6, cy - 10); ctx.stroke();
    ctx.fillStyle = "#7a1f1f";
    ctx.beginPath(); ctx.ellipse(cx, cy + 4, 2.6, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    // sad: droopy eyebrows, frown and a tear
    ctx.beginPath(); ctx.moveTo(cx - 6.5, cy - 8); ctx.lineTo(cx - 2, cy - 9.5); ctx.moveTo(cx + 2, cy - 9.5); ctx.lineTo(cx + 6.5, cy - 8); ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(cx, cy + 7, 4, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
    ctx.fillStyle = "#5ab4ff";
    ctx.beginPath(); ctx.moveTo(cx - 5, cy - 1); ctx.quadraticCurveTo(cx - 7.5, cy + 3, cx - 5, cy + 3.5); ctx.quadraticCurveTo(cx - 2.5, cy + 3, cx - 5, cy - 1); ctx.fill();
  }
}

function drawBlueberry(x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
  g.addColorStop(0, "#7d90ff");
  g.addColorStop(1, "#262b85");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#14174d";
  ctx.lineWidth = 2;
  const cy = y - r * 0.62;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + Math.cos(a) * r * 0.28, cy + Math.sin(a) * r * 0.18);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
}

const DRUPELETS = [
  [0, -0.55], [-0.42, -0.35], [0.42, -0.35], [-0.6, 0.05], [0.6, 0.05],
  [-0.2, -0.1], [0.2, -0.1], [-0.38, 0.38], [0.38, 0.38], [0, 0.25], [0, 0.65],
];
function drawRaspberry(x, y, r) {
  for (const [dx, dy] of DRUPELETS) {
    const px = x + dx * r, py = y + dy * r;
    ctx.fillStyle = "#e8284f";
    ctx.strokeStyle = "#a3123a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(px - r * 0.1, py - r * 0.1, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3fa34d";
  for (const dir of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.85);
    ctx.lineTo(x + dir * r * 0.5 - 3, y - r * 1.15);
    ctx.lineTo(x + dir * r * 0.5 + 3, y - r * 1.05);
    ctx.fill();
  }
}

// A kitchen knife stuck in the ground, blade up
function drawKnife(x) {
  ctx.save();
  ctx.translate(x, GROUND_Y);
  ctx.fillStyle = "#6b3e1f";
  ctx.fillRect(-6, -16, 12, 16);
  ctx.fillStyle = "#e9d3b0";
  ctx.beginPath(); ctx.arc(0, -11, 1.6, 0, Math.PI * 2); ctx.arc(0, -5, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#8d99ae";
  ctx.fillRect(-7, -20, 14, 4);
  const g = ctx.createLinearGradient(-6, 0, 7, 0);
  g.addColorStop(0, "#f8f9fa");
  g.addColorStop(1, "#adb5bd");
  ctx.fillStyle = g;
  ctx.strokeStyle = "#6c757d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-5, -20);
  ctx.lineTo(-5, -48);
  ctx.quadraticCurveTo(-4, -56, 4, -58);
  ctx.lineTo(6, -20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.moveTo(-2, -24); ctx.lineTo(-2, -46); ctx.stroke();
  ctx.restore();
}

// Platforms are cutting boards
function drawPlatform(x, y, w) {
  ctx.fillStyle = "#a8703a";
  ctx.fillRect(x, y + 4, w, 12);
  ctx.fillStyle = "#d9a066";
  ctx.fillRect(x, y, w, 12);
  ctx.strokeStyle = "rgba(120,70,30,0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(x + 6, y + i * 4); ctx.lineTo(x + w - 20, y + i * 4); ctx.stroke();
  }
  ctx.fillStyle = "#7a4a20";
  ctx.beginPath(); ctx.arc(x + w - 10, y + 6, 3.5, 0, Math.PI * 2); ctx.fill();
}

function drawSun(x, y, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.03);
  ctx.strokeStyle = "#ffb703";
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 15, Math.sin(a) * 15);
    ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffd60a";
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPuddle(x, t) {
  ctx.fillStyle = "#4ea8de";
  ctx.beginPath(); ctx.ellipse(x, GROUND_Y + 3, 36, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.ellipse(x - 10 + Math.sin(t * 0.1) * 6, GROUND_Y + 1, 9, 2, 0, 0, Math.PI * 2); ctx.fill();
}

function drawPortal(x, t) {
  const cy = GROUND_Y - 62;
  ctx.save();
  ctx.fillStyle = "#2a0a4a";
  ctx.beginPath();
  ctx.ellipse(x, cy, 24, 58, 0, 0, Math.PI * 2);
  ctx.fill();
  const colors = ["#c77dff", "#ff70a6", "#70d6ff", "#ffd670"];
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = colors[(i + Math.floor(t / 6)) % 4];
    ctx.beginPath();
    ctx.ellipse(x, cy, 26 + i * 6 + Math.sin(t * 0.1 + i) * 2, 60 + i * 6, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "white";
  for (let i = 0; i < 6; i++) {
    const a = t * 0.05 + i;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * 16, cy + Math.sin(a * 1.3) * 45, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPeel(cx, cy) {
  ctx.fillStyle = "#ffd93b";
  ctx.strokeStyle = "#c99a00";
  ctx.lineWidth = 1.5;
  for (const [dx, len, tilt] of [[-7, 26, 0.3], [0, 32, 0], [7, 24, -0.3]]) {
    ctx.save();
    ctx.translate(cx + dx, cy);
    ctx.rotate(tilt);
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.quadraticCurveTo(-6, len * 0.6, 0, len);
    ctx.quadraticCurveTo(6, len * 0.6, 4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = "#7a5a1e";
  ctx.fillRect(cx - 3, cy - 7, 6, 8);
}

// The fruit-bowl spaceship, draped in banana peels
function drawShip(x, y, t, flame, scale = 1, tilt = 0, withBanana = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(scale, scale);

  if (flame) {
    const f = 30 + Math.random() * 20;
    ctx.fillStyle = "#ff9f1c";
    ctx.beginPath();
    ctx.moveTo(-22, 38); ctx.lineTo(22, 38); ctx.lineTo(0, 38 + f);
    ctx.fill();
    ctx.fillStyle = "#ffe066";
    ctx.beginPath();
    ctx.moveTo(-11, 38); ctx.lineTo(11, 38); ctx.lineTo(0, 30 + f * 0.6);
    ctx.fill();
  }

  // Inside the glass dome
  if (withBanana) {
    ctx.save();
    ctx.translate(0, -24);
    ctx.scale(0.8, 0.8);
    drawBananaKid({ face: "happy", air: true });
    ctx.restore();
  }
  for (const [fx, fy, fr, col] of [[-30, -10, 12, "#ff9f1c"], [30, -10, 11, "#e63946"], [-12, -6, 8, "#8ac926"], [14, -5, 7, "#7b2cbf"]]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(190,235,255,0.45)";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, -2, 56, 50, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();

  // Bowl
  const g = ctx.createLinearGradient(0, 0, 0, 44);
  g.addColorStop(0, "#f2994a");
  g.addColorStop(1, "#b5562b");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 85, 44, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = "#ffc078";
  ctx.beginPath();
  ctx.ellipse(0, 0, 88, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  for (const px of [-60, -20, 22, 62]) drawPeel(px, 3);

  [-55, -20, 20, 55].forEach((lx, i) => {
    const ly = 0.75 * 44 * Math.sqrt(1 - (lx / 85) ** 2);
    ctx.fillStyle = Math.floor(t / 8 + i) % 2 ? "#fff3b0" : "#70d6ff";
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawBeam(x, shipY) {
  ctx.fillStyle = "rgba(255,250,170,0.35)";
  ctx.beginPath();
  ctx.moveTo(x - 30, shipY + 36);
  ctx.lineTo(x + 30, shipY + 36);
  ctx.lineTo(x + 70, GROUND_Y);
  ctx.lineTo(x - 70, GROUND_Y);
  ctx.fill();
}

function drawBananaSlice(x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#fff3c4";
  ctx.strokeStyle = "#f2c200";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#c9a66b";
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath(); ctx.arc(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function drawPeelBit(x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#ffd93b";
  ctx.strokeStyle = "#c99a00";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 4, 11, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#5c4013";
  ctx.fillRect(-1.5, -12, 3, 4);
  ctx.restore();
}

// ---------- The blender ----------
const JAR = { baseH: 34, h: 110, topW: 96, botW: 70 };
function drawBlender(x, groundY, t) {
  const blending = t >= 75 && t < 150;
  const shake = blending ? (Math.random() - 0.5) * 5 : 0;
  const fill = clamp((t - 85) / 65, 0, 1) * 0.85;
  const jb = -JAR.baseH;           // jar bottom (relative)
  const jt = -JAR.baseH - JAR.h;   // jar top
  ctx.save();
  ctx.translate(x + shake, groundY);

  // Motor base
  ctx.fillStyle = "#d62828";
  ctx.fillRect(-48, -JAR.baseH, 96, JAR.baseH);
  ctx.fillStyle = "#9d0208";
  ctx.fillRect(-48, -6, 96, 6);
  ctx.fillStyle = blending ? "#80ed99" : "#f1faee";
  ctx.beginPath(); ctx.arc(-18, -18, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#f1faee";
  ctx.beginPath(); ctx.arc(0, -18, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(18, -18, 5, 0, Math.PI * 2); ctx.fill();

  // Jar shape
  const jarPath = new Path2D();
  jarPath.moveTo(-JAR.botW / 2, jb);
  jarPath.lineTo(-JAR.topW / 2, jt);
  jarPath.lineTo(JAR.topW / 2, jt);
  jarPath.lineTo(JAR.botW / 2, jb);
  jarPath.closePath();
  ctx.fillStyle = "rgba(220,240,255,0.35)";
  ctx.fill(jarPath);

  // What's inside
  ctx.save();
  ctx.clip(jarPath);
  if (t >= 65 && t < 85) {
    ctx.save();
    ctx.translate(0, jb - 30);
    ctx.rotate(Math.sin(t * 0.8) * 0.3);
    drawBananaKid({ face: "scared", air: true });
    ctx.restore();
  }
  if (t >= 85) {
    const chunkAlpha = clamp(1 - (fill - 0.5) * 3, 0, 1);
    ctx.globalAlpha = chunkAlpha;
    for (let i = 0; i < 9; i++) {
      const a = t * 0.35 + i * 0.7;
      drawBananaSlice(Math.cos(a) * 28, jb - 18 - ((i * 13) % 75) + Math.sin(a) * 8, a);
    }
    ctx.globalAlpha = 1;
  }
  if (fill > 0) {
    const top = jb - JAR.h * fill;
    ctx.fillStyle = "#fff1a8";
    ctx.beginPath();
    ctx.moveTo(-60, jb);
    ctx.lineTo(-60, top);
    for (let wx = -60; wx <= 60; wx += 10) ctx.lineTo(wx, top + Math.sin(wx * 0.2 + t * 0.5) * (blending ? 4 : 1.5));
    ctx.lineTo(60, jb);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-60, top + 6, 120, 4);
  }
  // Blades
  ctx.strokeStyle = "#adb5bd";
  ctx.lineWidth = 4;
  const ba = blending ? t * 0.9 : 0;
  ctx.beginPath();
  ctx.moveTo(Math.cos(ba) * -18, jb - 6);
  ctx.lineTo(Math.cos(ba) * 18, jb - 6);
  ctx.moveTo(Math.sin(ba) * -12, jb - 10);
  ctx.lineTo(Math.sin(ba) * 12, jb - 10);
  ctx.stroke();
  ctx.restore();

  // Glass outline, shine and handle
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 3;
  ctx.stroke(jarPath);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.moveTo(-26, jb - 10); ctx.lineTo(-36, jt + 12); ctx.stroke();
  ctx.strokeStyle = "#495057";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(JAR.topW / 2 - 6, jt + 20);
  ctx.quadraticCurveTo(JAR.topW / 2 + 26, jt + 50, JAR.botW / 2 + 2, jb - 15);
  ctx.stroke();

  // Lid
  if (t >= 65) {
    const lidDrop = t < 72 ? (72 - t) * 8 : 0;
    ctx.fillStyle = "#343a40";
    ctx.fillRect(-JAR.topW / 2 - 4, jt - 10 - lidDrop, JAR.topW + 8, 10);
    ctx.fillRect(-10, jt - 18 - lidDrop, 20, 8);
  }

  // Straw (and a sad little face) once it's a milkshake
  if (t >= 150) {
    ctx.save();
    ctx.translate(0, jb - 45);
    ctx.scale(1.6, 1.6);
    drawFace(0, 0, "sad");
    ctx.restore();
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(8, jt + 30); ctx.lineTo(30, jt - 40); ctx.stroke();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 6;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(8, jt + 30); ctx.lineTo(30, jt - 40); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawDeath() {
  const t = L.deathT;
  if (L.deathStyle === "dice") {
    [...L.dice.slice(1), L.dice[0]].forEach((d) => {
      if (d === L.dice[0]) {
        ctx.save();
        ctx.translate(d.x, d.y - 6);
        ctx.scale(2, 2);
        drawBananaSlice(0, 0, 0);
        ctx.scale(0.55, 0.55);
        drawFace(0, 3, "sad");
        ctx.restore();
      } else if (d.kind === "slice") drawBananaSlice(d.x, d.y, d.rot);
      else drawPeelBit(d.x, d.y, d.rot);
    });
    return;
  }
  // Blender drops in, banana hops in, whizz, milkshake
  const bx = clamp(L.deadX, 70, W - 70);
  const dropK = Math.min(t / 35, 1);
  const by = GROUND_Y - (1 - easeOutBounce(dropK)) * 500;
  drawBlender(bx, by, t);
  if (t < 35) {
    drawBanana(L.deadX + Math.sin(t * 1.3) * 2, L.deadY + 25, { angle: Math.sin(t * 0.9) * 0.15, face: "scared" });
  } else if (t < 65) {
    const k = (t - 35) / 30;
    const x = lerp(L.deadX, bx, k);
    const y = lerp(L.deadY, GROUND_Y - JAR.baseH - JAR.h + 10, k) - Math.sin(k * Math.PI) * 90;
    drawBanana(x, y + 25, { angle: k * 8, scale: lerp(1, 0.85, k), face: "scared", air: true });
  }
  if (t >= 150) {
    outlinedText("Banana milkshake!", bx < W / 2 ? bx + 200 : bx - 200, 200, 34, "#fff1a8");
  }
}

// Banana into the portal, then the spaceship comes down and beams it up
function drawCutscene(portalX) {
  const t = L.cutT;
  const restY = 130;
  let shipY = -150;
  if (t < 30) {
    const k = t / 30;
    drawBanana(lerp(PLAYER_X, portalX, k), GROUND_Y - k * 35, { angle: k * 6, scale: 1 - k, air: true });
  } else if (t < 90) {
    shipY = lerp(-150, restY, easeOut((t - 30) / 60));
  } else {
    shipY = restY;
    drawBeam(portalX, shipY);
    const k = (t - 90) / 70;
    if (k < 0.85) drawBanana(portalX, lerp(GROUND_Y - 20, restY + 30, easeOut(k)), { angle: Math.sin(t * 0.2) * 0.4, scale: lerp(0.4, 0.8, Math.min(k * 2, 1)), air: true });
  }
  drawShip(portalX, shipY, t, false, 1, 0, t >= 150);
  if (t >= 30) {
    outlinedText("Level complete!", W / 2, 300, 44, "#ffd93b");
    outlinedText(`${L.secondsLeft}s to spare`, W / 2, 342, 22);
  }
}

function drawShield(x, y) {
  ctx.save();
  ctx.globalAlpha = 0.35 + Math.sin(L.frame * 0.3) * 0.15;
  ctx.fillStyle = "#ffb3c6";
  ctx.strokeStyle = "#ff4d8d";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawEnergyBar() {
  const x = 44, y = 36, w = 140, h = 16;
  ctx.font = `20px ${EMOJI_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", 14, y + h / 2);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x, y, w, h);
  const k = clamp(L.energy / SETTINGS.maxEnergy, 0, 1);
  ctx.fillStyle = k > 0.6 ? "#52d273" : k > 0.3 ? "#ffd60a" : "#ff4d4d";
  ctx.fillRect(x, y, w * k, h);
  ctx.strokeStyle = "#3b2a1a";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function drawHUD() {
  const flight = L.phase === "flight";
  const prog = flight ? Math.min(L.shipDist / L.flight.length, 1) : Math.min(L.distance / L.cfg.length, 1);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(W / 2 - 150, 12, 300, 10);
  ctx.fillStyle = flight ? "#70d6ff" : "#ffd93b";
  ctx.fillRect(W / 2 - 150, 12, 300 * prog, 10);

  drawEnergyBar();

  // hearts, and what you've collected
  ctx.font = `20px ${EMOJI_FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let i = 0; i < run.hearts; i++) ctx.fillText("❤️", 194 + i * 26, 44);
  ctx.font = `bold 16px ${TEXT_FONT}`;
  ctx.fillStyle = "white";
  ctx.strokeStyle = "#3b2a1a";
  ctx.lineWidth = 3;
  const toBonus = SETTINGS.bonusEvery - ((run.suns + run.waters) % SETTINGS.bonusEvery);
  const counter = `☀️ ${run.suns}   💧 ${run.waters}   (bonus in ${toBonus})`;
  ctx.strokeText(counter, 14, 70);
  ctx.fillText(counter, 14, 70);

  outlinedText(flight ? `Level ${L.n} of ${MAX_LEVEL} · Fly!` : `Level ${L.n} of ${MAX_LEVEL}`, W / 2, 44, 22);

  if (!flight) {
    const secs = Math.max(0, Math.ceil(L.timeLeft / 60));
    outlinedText(`⏱ ${secs}`, W - 55, 44, 24, secs <= 5 ? "#ff4d4d" : "white");
  }

  ctx.font = `13px ${TEXT_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillText(`${Sound.muted ? "🔇 M: sound off" : "🔊 M: sound on"}  ·  ${Music.enabled ? "🎵 N: music on" : "N: music off"}`, W - 10, H - 8);
}

function drawRunWorld() {
  const toScreen = (wx) => wx - L.distance + PLAYER_X;
  const portalX = toScreen(L.cfg.length) + 25;
  if (portalX < W + 100) drawPortal(portalX, L.frame + L.cutT);

  for (const pl of L.platforms) {
    const sx = toScreen(pl.x);
    if (sx > W || sx + pl.w < 0) continue;
    drawPlatform(sx, pl.y, pl.w);
  }
  for (const pk of L.pickups) {
    if (pk.taken) continue;
    const sx = toScreen(pk.x);
    if (sx < -50 || sx > W + 50) continue;
    if (pk.kind === "sun") drawSun(sx, pk.y + Math.sin(L.frame * 0.1 + pk.x) * 3, L.frame);
    else drawPuddle(sx, L.frame);
  }
  for (const k of L.knives) {
    const sx = toScreen(k.x);
    if (sx < -30 || sx > W + 30) continue;
    drawKnife(sx);
  }
  for (const o of L.fruits) {
    if (o.hit) continue;
    const sx = toScreen(o.x);
    if (sx < -50 || sx > W + 50) continue;
    if (o.type === "blue") drawBlueberry(sx, fruitY(o), o.r);
    else drawRaspberry(sx, fruitY(o), o.r);
  }

  if (mode === "playing") {
    const p = L.player;
    const flashing = L.hurt > 0 && Math.floor(L.hurt / 5) % 2 === 0;
    const angle = p.onGround ? 0 : p.angle;
    const face = L.hurt > SETTINGS.hurtFrames - 25 ? "sad" : "happy";
    if (L.shield > 0) drawShield(PLAYER_X, p.y - 25);
    drawBanana(PLAYER_X, p.y, { angle, ducking: p.ducking, face, phase: L.frame * 0.35, air: !p.onGround }, flashing ? 0.35 : 1);
  }
  if (mode === "cutscene") drawCutscene(portalX);
}

function drawFlightWorld() {
  for (const o of L.shipObs) {
    if (o.hit) continue;
    const sx = o.x - L.shipDist + SHIP_X;
    if (sx < -50 || sx > W + 50) continue;
    drawBlueberry(sx, o.y, o.r);
  }
  const s = L.ship;
  if (mode === "flying") {
    if (L.shield > 0) drawShield(SHIP_X, s.y - 5);
    drawShip(SHIP_X, s.y, L.flyT, true, 0.42, s.vy * 0.03, true);
  } else if (mode === "warp") {
    const t = L.warpT;
    drawShip(SHIP_X + t * t * 0.08, s.y - t * t * 0.06, t, true, 0.42, -0.3, true);
    if (t > 40 && L.n >= MAX_LEVEL) {
      outlinedText("YOU DID IT!", W / 2, 200, 60, "#ffd93b");
    } else if (t > 40) {
      outlinedText(`Level ${L.n + 1}`, W / 2, 200, 60, "#ffd93b");
      outlinedText("It's getting harder...", W / 2, 250, 24);
    }
  }
  if (mode === "flying" && L.flyT < 110) {
    outlinedText("Fly the fruit bowl!", W / 2, 180, 40, "#ffd93b");
    outlinedText("Hold Space / ↑ to go up. Dodge the blueberries!", W / 2, 222, 20);
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  if (!L) {
    drawBackground(titleScroll, PALETTES[0]);
    drawBanana(PLAYER_X, GROUND_Y, { phase: titleScroll * 0.12 });
    return;
  }

  const flight = L.phase === "flight";
  drawBackground(flight ? L.cfg.length + L.shipDist : L.distance, L.palette);
  if (flight) drawFlightWorld();
  else drawRunWorld();

  if (mode === "dying" || mode === "over") drawDeath();

  for (const pt of L.particles) {
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
  }

  for (const tx of L.texts) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, tx.life / 20);
    outlinedText(tx.text, tx.x, tx.y, 24, tx.color);
    ctx.restore();
  }

  drawHUD();

  if (mode === "playing" && L.frame < 120) {
    ctx.save();
    ctx.globalAlpha = L.frame < 90 ? 1 : 1 - (L.frame - 90) / 30;
    outlinedText(`Level ${L.n}`, W / 2, 170, 56, "#ffd93b");
    outlinedText(`Reach the portal in ${L.cfg.timeLimit}s!`, W / 2, 218, 24);
    ctx.restore();
  }
}

// ================= MAIN LOOP (fixed 60 updates/sec) =================
const STEP = 1000 / 60;
let last = 0, acc = 0;
function frame(ts) {
  if (!last) last = ts;
  acc += Math.min(ts - last, 250);
  last = ts;
  while (acc >= STEP) { update(); acc -= STEP; }
  draw();
  requestAnimationFrame(frame);
}

function clickThen(fn) {
  return (e) => { Sound.init(); e.currentTarget.blur(); fn(); };
}
document.getElementById("start-btn").addEventListener("click", clickThen(startGame));
document.getElementById("retry-btn").addEventListener("click", clickThen(retry));
continueBtn.addEventListener("click", clickThen(continueGame));
document.getElementById("menu-btn").addEventListener("click", clickThen(backToMenu));

requestAnimationFrame(frame);
