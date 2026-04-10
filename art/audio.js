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
    // Fade out and stop the source so we're not burning CPU while muted
    if (_bgmMaster) _bgmMaster.gain.setTargetAtTime(0, _ctx().currentTime, 0.15);
    _stopBGMSource();
  } else if (_bgmActive) {
    // Fade back in and restart the loop
    if (_bgmMaster) _bgmMaster.gain.setTargetAtTime(BGM_MASTER_VOL, _ctx().currentTime, 0.3);
    _loadBGMBuffer().then(buf => {
      if (!buf || _muted || !_bgmActive) return;
      _startBGMSource(buf);
    });
  }
}

// =============================================================================
// BACKGROUND MUSIC — WAV file loop (assets/mid-flight_loop-01.wav)
// =============================================================================

const BGM_MASTER_VOL = 0.55;   // overall BGM level (0 = silent, 1 = full)

let _bgmActive = false;         // should BGM be playing
let _bgmMaster = null;          // master GainNode — controls volume & mute
let _bgmSource = null;          // active AudioBufferSourceNode
let _bgmBuffer = null;          // decoded AudioBuffer (cached after first load)

// Load and decode the WAV file once; returns the buffer (or null on error).
async function _loadBGMBuffer() {
  if (_bgmBuffer) return _bgmBuffer;
  try {
    const resp = await fetch('assets/mid-flight_loop-01.wav');
    const arr  = await resp.arrayBuffer();
    _bgmBuffer = await _ctx().decodeAudioData(arr);
  } catch (e) {
    console.warn('[audio] BGM file failed to load:', e);
  }
  return _bgmBuffer;
}

// Start a looping source node connected to _bgmMaster.
function _startBGMSource(buf) {
  if (_bgmSource) return;           // already playing
  const ctx  = _ctx();
  const src  = ctx.createBufferSource();
  src.buffer = buf;
  src.loop   = true;
  src.connect(_bgmMaster);
  src.start();
  _bgmSource = src;
}

// Stop and discard the source node (does NOT touch _bgmMaster gain).
function _stopBGMSource() {
  if (_bgmSource) {
    try { _bgmSource.stop(); } catch (_) {}
    _bgmSource = null;
  }
}

// Stub kept so any legacy callers don't crash.
function _bgmStopScheduler() {}

function startBGM() {
  if (_bgmActive) return;
  _bgmActive = true;

  const ctx = _ctx();
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

  // Load (or use cached) buffer then start looping
  _loadBGMBuffer().then(buf => {
    if (!_bgmActive || !buf) return;
    _startBGMSource(buf);
  });
}

function stopBGM() {
  _bgmActive = false;
  _stopBGMSource();
  if (_bgmMaster) {
    _bgmMaster.gain.setTargetAtTime(0, _ctx().currentTime, 0.4);
  }
}

// =============================================================================
// SOUND EFFECTS
// =============================================================================

// ── WAV-file SFX helper ───────────────────────────────────────────────────────
// Buffers are decoded once and cached; subsequent plays are instant.

const _sfxCache = {};

async function _playWav(url) {
  if (_muted) return;
  try {
    const ctx = _ctx();
    if (!_sfxCache[url]) {
      const resp = await fetch(url);
      const arr  = await resp.arrayBuffer();
      _sfxCache[url] = await ctx.decodeAudioData(arr);
    }
    const src = ctx.createBufferSource();
    src.buffer = _sfxCache[url];
    src.connect(ctx.destination);
    src.start();
  } catch (e) {}
}

// ── Cash brick hit — blockhit.wav ─────────────────────────────────────────────

function sfxCoin() { _playWav('assets/blockhit.wav'); }

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

// ── Deathblock hit — deathblock.wav ──────────────────────────────────────────

function sfxDeath() { _playWav('assets/deathblock.wav'); }

// ── Cashout — cashout.wav ─────────────────────────────────────────────────────

function sfxCashout() { _playWav('assets/cashout.wav'); }

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
