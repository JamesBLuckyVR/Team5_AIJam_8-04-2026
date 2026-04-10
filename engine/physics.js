// =============================================================================
// PHYSICS & GAME LOOP — owned by the Game Engine team
// =============================================================================
// Ball movement, wall bouncing, paddle collision, brick collision, and the
// main animation loop. Edit here to change how the ball and paddle behave.
// =============================================================================

// Convenience wrapper so other files can call draw() without arguments.
function draw() {
  drawFrame(canvas, gs, paddleX, splashes, wager, getMultiplier(), getTotalNormal(), phase);
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function startGame(skipCountdown) {
  // skipCountdown must be explicitly true — guards against click Event objects
  // being passed when the function is used directly as an event handler
  const _skip = skipCountdown === true;
  const w = parseFloat(wager);
  if (!w || w <= 0 || w > balance) return;

  const spd   = SPEED_PX[speed];
  const angle = (Math.random() * 60 + 60) * Math.PI / 180;

  gs = {
    bx: CANVAS_W / 2, by: PLAY_H - 80,
    vx: Math.cos(angle) * spd * (Math.random() > 0.5 ? 1 : -1),
    vy: -Math.sin(angle) * spd,
    bricks:  generateBricks(deathCount, Math.floor(Math.random() * 0xffffffff)),
    cleared: 0,
    running: false,   // held until countdown finishes
  };
  paddleX       = CANVAS_W / 2 - PADDLE_W / 2;
  splashes      = [];
  coinBursts    = [];
  sessionStart  = Date.now();
  bricksCleared = 0;
  accumulatedProfit = 0;
  const totalWeight = gs.bricks
    .filter(b => !b.isDeath)
    .reduce((sum, b) => sum + getBrickWeight(b.row), 0);
  brickValueScale = totalWeight > 0 ? w * (getMultiplier() - 1) / totalWeight : 0;
  result        = null;
  phase         = "playing";

  const _tn = getTotalNormal();
  if (bricksRemainHud) { bricksRemainHud.textContent = `${_tn} BRICKS REMAIN`; bricksRemainHud.classList.remove("hidden"); }

  stopBGM();
  addInputListeners();
  updateUI();
  draw();

  if (_skip) {
    gs.running = true;
    startBGM();
    gameLoop();
  } else {
    _runCountdown(() => {
      gs.running = true;
      startBGM();
      gameLoop();
    });
  }
}

function endRound(type, s) {
  cancelAnimationFrame(animFrame);
  removeInputListeners();

  const w    = parseFloat(wager) || 0;
  let payout = 0;
  if      (type === "death") payout = 0;
  else if (type === "drop")  payout = getLivePayout(w);
  else                       payout = getLivePayout(w); // "clear" — accumulatedProfit = full max

  payout  = Math.round(payout * 100) / 100;
  balance = Math.round((balance - w + payout) * 100) / 100;

  result = {
    type, payout, wager: w,
    duration: formatDuration(Date.now() - (sessionStart ?? Date.now())),
    cleared:  s.cleared,
    pct:      Math.round(s.cleared / getTotalNormal() * 100),
  };
  bricksCleared = s.cleared;
  phase         = "result";
  if (bricksRemainHud) bricksRemainHud.classList.add("hidden");
  updateUI();
}

function manualCashout() {
  if (phase !== "playing" || !gs || !gs.running) return;
  gs.running = false;
  sfxCashout();
  endRound("drop", gs);
}

// ── Pre-game countdown ────────────────────────────────────────────────────────

function _runCountdown(onComplete) {
  const overlay = document.getElementById('countdown-overlay');
  const textEl  = document.getElementById('countdown-text');
  if (!overlay || !textEl) { onComplete(); return; }

  // Start countdown audio and keep a reference so we can stop it before GO!
  let _cdSrc = null;
  if (typeof sfxCountdown === 'function') {
    Promise.resolve(sfxCountdown()).then(src => { _cdSrc = src; });
  }

  const steps = [
    { text: 'READY?', cls: 'cd-ready', dur: 1600 },
    { text: '3',      cls: 'cd-count', dur: 900  },
    { text: '2',      cls: 'cd-count', dur: 900  },
    { text: '1',      cls: 'cd-count', dur: 900  },
    { text: 'GO!',    cls: 'cd-go',    dur: 800,
      sfx: () => {
        // Stop the countdown music before the airhorn
        try { if (_cdSrc) { _cdSrc.stop(); _cdSrc = null; } } catch (_) {}
        if (typeof sfxAirhorn === 'function') sfxAirhorn();
      }
    },
  ];

  overlay.classList.remove('hidden');
  let i = 0;

  function next() {
    if (i >= steps.length) {
      overlay.classList.add('hidden');
      textEl.className = '';
      onComplete();
      return;
    }
    const s = steps[i++];
    textEl.textContent = s.text;
    // Force CSS animation restart by swapping class
    textEl.className = '';
    requestAnimationFrame(() => { textEl.className = s.cls; });
    if (s.sfx) s.sfx();
    setTimeout(next, s.dur);
  }
  next();
}

// ── Main animation loop ───────────────────────────────────────────────────────

function gameLoop() {
  const s = gs;
  if (!s || !s.running) return;

  // Apply held arrow / WASD key movement every frame for smooth keyboard control
  _applyKeyMovement();

  // Move ball
  s.bx += s.vx;
  s.by += s.vy;

  // Wall bounces
  if (s.bx - BALL_R < 0)        { s.bx = BALL_R;            s.vx =  Math.abs(s.vx); sfxWall(); }
  if (s.bx + BALL_R > CANVAS_W) { s.bx = CANVAS_W - BALL_R; s.vx = -Math.abs(s.vx); sfxWall(); }
  if (s.by - BALL_R < 0)        { s.by = BALL_R;             s.vy =  Math.abs(s.vy); sfxWall(); }

  // Paddle collision
  const py = PLAY_H - 44;
  if (s.by + BALL_R >= py && s.by + BALL_R <= py + PADDLE_H + 6 &&
      s.bx >= paddleX - 4 && s.bx <= paddleX + PADDLE_W + 4 && s.vy > 0) {
    const hit = (s.bx - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
    const spd = SPEED_PX[speed];
    s.vx = Math.sin(hit * 65 * Math.PI / 180) * spd;
    s.vy = -Math.cos(hit * 65 * Math.PI / 180) * spd;
    s.by = py - BALL_R;
    sfxPaddle();
    if (typeof showPaddleEffect === 'function') showPaddleEffect(paddleX);
  }

  // Ball dropped into cashout zone
  if (s.by + BALL_R > PLAY_H) {
    s.running = false;
    sfxCashout();
    endRound("drop", s);
    return;
  }

  // Brick collisions
  const w  = parseFloat(wager) || 0;
  const tn = getTotalNormal();

  for (const b of s.bricks) {
    if (!b.alive) continue;
    const bR = b.x + BRICK_W, bB = b.y + BRICK_H;
    if (s.bx + BALL_R > b.x && s.bx - BALL_R < bR &&
        s.by + BALL_R > b.y && s.by - BALL_R < bB) {

      b.alive = false;

      if (b.isDeath) {
        b.revealed = true;
        s.running  = false;
        sfxDeath();
        deathBurst = createDeathBurst(b.x + BRICK_W / 2, b.y + BRICK_H / 2);
        tickDeathBurst();
        draw();
        endRound("death", s);
        return;
      }

      s.cleared++;

      sfxCoin();

      // Coin burst VFX — Sonic-style coins pop out of the brick
      coinBursts.push(createCoinBurst(b.x + BRICK_W / 2, b.y + BRICK_H / 2));

      // Reflect off nearest edge
      const oL = s.bx - b.x, oR = bR - s.bx, oT = s.by - b.y, oB = bB - s.by;
      if (Math.min(oL, oR) < Math.min(oT, oB)) s.vx *= -1; else s.vy *= -1;

      // Floating payout splash
      const gain = brickValueScale * getBrickWeight(b.row);
      accumulatedProfit += gain;
      if (gain > 0) splashes.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, val: +gain.toFixed(2), row: b.row, born: performance.now() });

      // Update live payout display
      bricksCleared            = s.cleared;
      liveVal.textContent      = `$${getLivePayout(w).toFixed(2)}`;
      bricksProgEl.textContent = `${bricksCleared}/${tn} bricks`;
      if (bricksRemainHud) bricksRemainHud.textContent = `${tn - s.cleared} BRICKS REMAIN`;

      if (s.cleared === tn) {
        s.running = false;
        sfxClear();
        endRound("clear", s);
        return;
      }
      break;
    }
  }

  draw();
  animFrame = requestAnimationFrame(gameLoop);
}

// ── Death burst animation loop ────────────────────────────────────────────────
// Runs independently of the main game loop so the explosion plays out even
// after the ball has stopped and endRound() has been called.
function tickDeathBurst() {
  if (!deathBurst) return;
  const age = (performance.now() - deathBurst.born) / 1200;
  if (age >= 1) {
    deathBurst = null;
    draw(); // one final clean frame without the burst
    return;
  }
  draw();
  requestAnimationFrame(tickDeathBurst);
}

// ── Input handlers ────────────────────────────────────────────────────────────

// Keyboard state — track held keys so paddle moves every frame, not per-repeat
const _keys = { left: false, right: false };
const PADDLE_KEY_SPEED = 14; // px per frame while key held (~840 px/s at 60 fps)

function onMouseMove(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const cx     = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  paddleX = Math.max(0, Math.min(CANVAS_W - PADDLE_W, cx * scaleX - PADDLE_W / 2));
}
function onKeyDown(e) {
  if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") _keys.left  = true;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") _keys.right = true;
  // Prevent page scrolling with arrow keys during gameplay
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") e.preventDefault();
}
function onKeyUp(e) {
  if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") _keys.left  = false;
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") _keys.right = false;
}

// Called once per game loop tick — applies held-key movement
function _applyKeyMovement() {
  if (_keys.left)  paddleX = Math.max(0,                  paddleX - PADDLE_KEY_SPEED);
  if (_keys.right) paddleX = Math.min(CANVAS_W - PADDLE_W, paddleX + PADDLE_KEY_SPEED);
}

function addInputListeners() {
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchmove", onMouseMove);
  window.addEventListener("keydown",   onKeyDown);
  window.addEventListener("keyup",     onKeyUp);
}
function removeInputListeners() {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("touchmove", onMouseMove);
  window.removeEventListener("keydown",   onKeyDown);
  window.removeEventListener("keyup",     onKeyUp);
  _keys.left = false;
  _keys.right = false;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  canvas         = document.getElementById("game-canvas");
  canvas.width   = CANVAS_W;
  canvas.height  = CANVAS_H;
  wagerInput     = document.getElementById("wager-input");
  halfBtn        = document.getElementById("half-btn");
  doubleBtn      = document.getElementById("double-btn");
  betBtn         = document.getElementById("bet-btn");
  balanceEl      = document.getElementById("balance-val");
  multEl         = document.getElementById("mult-val");
  maxPayEl       = document.getElementById("max-payout");
  speedSel       = document.getElementById("speed-sel");
  deathSel       = document.getElementById("death-sel");
  liveBox        = document.getElementById("live-box");
  liveVal        = document.getElementById("live-val");
  bricksProgEl   = document.getElementById("bricks-prog");
  bricksRemainHud = document.getElementById("bricks-remain-hud");
  resultCard     = document.getElementById("result-card");
  splashEl          = document.getElementById("splash");
  deathOverlay      = document.getElementById("death-overlay");
  cashoutOverlay    = document.getElementById("cashout-overlay");
  cashoutCard       = document.getElementById("cashout-card");
  cashoutBtn = document.getElementById("cashout-btn");
  cashoutBtn.addEventListener("click", manualCashout);

  paddleX = CANVAS_W / 2 - PADDLE_W / 2;

  wagerInput.addEventListener("input", e => { wager = e.target.value; updateUI(); });

  halfBtn.addEventListener("click", () => {
    wager            = Math.max(0.01, parseFloat(wager || 0) / 2).toFixed(2);
    wagerInput.value = wager;
    updateUI();
  });

  doubleBtn.addEventListener("click", () => {
    wager            = (parseFloat(wager || 0) * 2).toFixed(2);
    wagerInput.value = wager;
    updateUI();
  });

  betBtn.addEventListener("click", startGame);

  buildSelectors();
  updateUI();
});
