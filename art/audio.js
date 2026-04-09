// =============================================================================
// AUDIO — owned by the Game Art team
// =============================================================================
// All sounds synthesized via the Web Audio API — no audio files needed.
// Works offline and on file://. Tune frequencies, envelopes and the BGM
// pattern here without touching any game logic.
// =============================================================================

let _audioCtx = null;
let _muted    = false;

// Lazily create (and resume) the AudioContext on first use.
// Browsers require a user gesture before audio can play; the BET click handles that.
function _ctx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_audioCtx.state === "suspended") _audioCtx.resume();
  return _audioCtx;
}

function _play(fn) {
  if (_muted) return;
  try { fn(_ctx()); } catch (e) {}
}

// ── Toggle mute ───────────────────────────────────────────────────────────────

function toggleMute() {
  _muted = !_muted;
  const btn = document.getElementById("mute-btn");
  if (btn) btn.textContent = _muted ? "🔇" : "🔊";

  if (_muted) {
    _bgmStopScheduler();
    // Fade master gain to silence so currently playing notes don't cut hard
    if (_bgmMaster) {
      _bgmMaster.gain.setTargetAtTime(0, _ctx().currentTime, 0.15);
    }
  } else if (_bgmActive) {
    if (_bgmMaster) _bgmMaster.gain.setTargetAtTime(BGM_MASTER_VOL, _ctx().currentTime, 0.3);
    _bgmNextBeat = _ctx().currentTime + 0.05;
    _bgmBeatIdx  = 0;
    _bgmStartScheduler();
  }
}

// =============================================================================
// BACKGROUND MUSIC — casino groove, 8-beat loop
// =============================================================================
// 110 BPM, C mixolydian feel.
// Each array has 8 entries — one per beat. null = rest.
//
// To change the groove, edit the pattern arrays below.
// To change tempo, change BGM_BPM.
// To change volume, change BGM_MASTER_VOL (0 = silent, 1 = full).
// =============================================================================

const BGM_BPM        = 110;
const BGM_BEAT_S     = 60 / BGM_BPM;   // seconds per beat (~0.545 s)
const BGM_BEATS      = 8;               // loop length in beats
const BGM_MASTER_VOL = 0.55;            // overall BGM level
const BGM_LOOKAHEAD  = 0.15;            // seconds to schedule ahead
const BGM_INTERVAL   = 60;             // ms between scheduler ticks

// Bass notes (triangle wave, Hz) — C2 mixolydian walking line
const BGM_BASS = [65.41, 65.41, 98.00, 98.00, 103.83, 103.83, 87.31, 98.00];
//               C2     C2     G2     G2     Ab2    Ab2    F2     G2

// Lead melody (sine wave, Hz) — simple casino arpeggio
const BGM_LEAD = [523.25, 659.25, 783.99, 659.25, 622.25, 523.25, 466.16, 523.25];
//               C5      E5      G5      E5      Eb5    C5      Bb4    C5

// Kick pattern — true = play kick on this beat
const BGM_KICK = [true, false, true, false, true, false, true, false];

// Hihat pattern — true = play hihat on this beat
const BGM_HIHAT = [false, true, false, true, false, true, false, true];

// Snare on beats 2 and 6 (offbeats of bar 1 and bar 2)
const BGM_SNARE = [false, false, true, false, false, false, true, false];

let _bgmActive    = false;  // should BGM play when unmuted
let _bgmTimer     = null;
let _bgmBeatIdx   = 0;
let _bgmNextBeat  = 0;
let _bgmMaster    = null;   // master gain node for fade in/out

function _bgmNote(ctx, freq, time, dur, type, vol) {
  if (!freq) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(_bgmMaster);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.start(time);
  osc.stop(time + dur + 0.01);
}

function _bgmKick(ctx, time) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(_bgmMaster);
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(35, time + 0.18);
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  osc.start(time);
  osc.stop(time + 0.22);
}

function _bgmSnare(ctx, time) {
  // Snare = short noise burst bandpassed around 2kHz
  const samples = Math.floor(ctx.sampleRate * 0.10);
  const buf     = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const src    = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain   = ctx.createGain();
  src.buffer = buf;
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(_bgmMaster);
  gain.gain.setValueAtTime(0.55, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.10);
  src.start(time);
  src.stop(time + 0.10);
}

function _bgmHihat(ctx, time) {
  const samples = Math.floor(ctx.sampleRate * 0.04);
  const buf     = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data    = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
  const src    = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain   = ctx.createGain();
  src.buffer = buf;
  filter.type = "highpass";
  filter.frequency.value = 7000;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(_bgmMaster);
  gain.gain.setValueAtTime(0.35, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  src.start(time);
  src.stop(time + 0.04);
}

function _bgmScheduler() {
  if (!_bgmActive || _muted) return;
  const ctx = _ctx();

  while (_bgmNextBeat < ctx.currentTime + BGM_LOOKAHEAD) {
    const i = _bgmBeatIdx % BGM_BEATS;
    const t = _bgmNextBeat;

    if (BGM_KICK[i])  _bgmKick(ctx, t);
    if (BGM_SNARE[i]) _bgmSnare(ctx, t);
    if (BGM_HIHAT[i]) _bgmHihat(ctx, t);

    // Bass — sustained for most of the beat
    _bgmNote(ctx, BGM_BASS[i], t, BGM_BEAT_S * 0.82, "triangle", 0.55);

    // Lead — shorter, sits on top
    _bgmNote(ctx, BGM_LEAD[i], t, BGM_BEAT_S * 0.38, "sine", 0.30);

    // Subtle harmony — a fifth above bass, quiet pad
    _bgmNote(ctx, BGM_BASS[i] * 1.5, t, BGM_BEAT_S * 0.70, "sine", 0.10);

    _bgmNextBeat += BGM_BEAT_S;
    _bgmBeatIdx++;
  }

  _bgmTimer = setTimeout(_bgmScheduler, BGM_INTERVAL);
}

function _bgmStartScheduler() {
  if (_bgmTimer) return;
  _bgmScheduler();
}

function _bgmStopScheduler() {
  if (_bgmTimer) { clearTimeout(_bgmTimer); _bgmTimer = null; }
}

function startBGM() {
  if (_bgmActive) return;
  _bgmActive = true;

  const ctx  = _ctx();
  if (!_bgmMaster) {
    _bgmMaster = ctx.createGain();
    _bgmMaster.connect(ctx.destination);
  }

  if (_muted) {
    _bgmMaster.gain.value = 0;
    return;
  }

  // Fade in over 1.5 s so the music doesn't slam in
  _bgmMaster.gain.setValueAtTime(0, ctx.currentTime);
  _bgmMaster.gain.linearRampToValueAtTime(BGM_MASTER_VOL, ctx.currentTime + 1.5);

  _bgmNextBeat = ctx.currentTime + 0.05;
  _bgmBeatIdx  = 0;
  _bgmStartScheduler();
}

function stopBGM() {
  _bgmActive = false;
  _bgmStopScheduler();
  if (_bgmMaster) {
    _bgmMaster.gain.setTargetAtTime(0, _ctx().currentTime, 0.4);
  }
}

// =============================================================================
// SOUND EFFECTS
// =============================================================================

// ── Coin collect — short rising chirp, like Sonic grabbing a ring ─────────────

function sfxCoin() {
  _play(ctx => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(700, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.13);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.13);
  });
}

// ── Paddle bounce — soft low thud ─────────────────────────────────────────────

function sfxPaddle() {
  _play(ctx => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.28, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.11);
  });
}

// ── Wall bounce — light tap ────────────────────────────────────────────────────

function sfxWall() {
  _play(ctx => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.10, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
  });
}

// ── Death explosion — low rumble + noise burst ────────────────────────────────

function sfxDeath() {
  _play(ctx => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(90, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(18, ctx.currentTime + 0.55);
    gain.gain.setValueAtTime(0.55, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.55);

    const samples = ctx.sampleRate * 0.35;
    const buf     = ctx.createBuffer(1, samples, ctx.sampleRate);
    const data    = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;
    const noise     = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    noise.buffer = buf;
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseGain.gain.setValueAtTime(0.45, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    noise.start(ctx.currentTime);
    noise.stop(ctx.currentTime + 0.35);
  });
}

// ── Cashout drop — ascending cha-ching ────────────────────────────────────────

function sfxCashout() {
  _play(ctx => {
    [0, 0.10, 0.20].forEach((delay, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime([523, 659, 784][i], ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.24, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.28);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.28);
    });
  });
}

// ── All bricks cleared — victory fanfare ──────────────────────────────────────

function sfxClear() {
  _play(ctx => {
    [523, 659, 784, 1047].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.10);
      gain.gain.setValueAtTime(0.28, ctx.currentTime + i * 0.10);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.10 + 0.32);
      osc.start(ctx.currentTime + i * 0.10);
      osc.stop(ctx.currentTime + i * 0.10 + 0.32);
    });
  });
}
